import {
    ECSClient,
    DescribeTaskDefinitionCommand,
    DescribeTaskDefinitionCommandOutput,
    TaskDefinition,
    RegisterTaskDefinitionCommandOutput,
    Tag,
    RegisterTaskDefinitionCommand,
    RunTaskCommandOutput,
    RunTaskCommandInput,
    LaunchType,
    RunTaskCommand,
    DeleteTaskDefinitionsCommand,
    DeregisterTaskDefinitionCommand,
    TaskDefinitionStatus,
} from '@aws-sdk/client-ecs'
import {
    GetResourcesCommand,
    ResourceGroupsTaggingAPIClient,
    ResourceTagMapping,
    TagFilter,
} from '@aws-sdk/client-resource-groups-tagging-api'
import { ensureValueWithError } from './utils'

export const RUN_ID_TAG_KEY = 'runId'
export const TITLE_TAG_KEY = 'title'

export async function getECSTaskDefinition(
    client: ECSClient,
    taskDefinitionFamily: string,
): Promise<DescribeTaskDefinitionCommandOutput> {
    console.log(`AWS: START: Getting task definition ${taskDefinitionFamily} from ECS ...`)
    const command = new DescribeTaskDefinitionCommand({
        taskDefinition: taskDefinitionFamily,
    })

    const result = await client.send(command)
    console.log(`AWS:   END: DescribeTaskDefinitionCommand finished with ${result.taskDefinition?.family}`)
    return result
}

export async function registerECSTaskDefinition(
    client: ECSClient,
    baseTaskDefinition: TaskDefinition,
    familyName: string,
    toaEndpointWithRunId: string,
    imageLocation: string,
    tags: Tag[],
): Promise<RegisterTaskDefinitionCommandOutput> {
    // Create a derived task definition using the base
    // The following defines a new family versus versioning the base family

    const containerDefinition = baseTaskDefinition.containerDefinitions?.map((container) => {
        const environment = ensureValueWithError(container.environment, `No environment found on ${container}`)

        environment.push({
            name: 'TRUSTED_OUTPUT_ENDPOINT',
            value: toaEndpointWithRunId,
        })
        return {
            ...container,
            environment,
            image: imageLocation,
        }
    })

    console.log('AWS: START: Registering task definition ...')

    const command = new RegisterTaskDefinitionCommand({
        family: familyName,
        containerDefinitions: containerDefinition,
        taskRoleArn: baseTaskDefinition.taskRoleArn,
        executionRoleArn: baseTaskDefinition.executionRoleArn,
        networkMode: baseTaskDefinition.networkMode,
        cpu: baseTaskDefinition.cpu,
        memory: baseTaskDefinition.memory,
        requiresCompatibilities: baseTaskDefinition.requiresCompatibilities,
        tags: tags,
    })
    const result = await client.send(command)
    /* v8 ignore next 1 */
    console.log(`AWS:   END: RegisterTaskDefinitionCommand finished with ${result.taskDefinition?.family}.`)
    return result
}

export async function deleteECSTaskDefinitions(client: ECSClient, taskDefinitions: string[]): Promise<void> {
    for (const task of taskDefinitions) {
        // Query task definition status to determine appropriate actions
        const taskDefinitionDetails = await getECSTaskDefinition(client, task)

        // If the task definition is currently ACTIVE, we must deregister
        if (taskDefinitionDetails.taskDefinition?.status === TaskDefinitionStatus.ACTIVE) {
            const deregisterCommand = new DeregisterTaskDefinitionCommand({
                taskDefinition: task,
            })
            console.log(`AWS: START: Deregistering task definition ${task}...`)
            await client.send(deregisterCommand)
            console.log('AWS:   END: DegregisterTaskDefinitionCommand finished')
        }

        // If the task definition is not DELETE_IN_PROGRESS, we request a deletion
        if (taskDefinitionDetails.taskDefinition?.status !== TaskDefinitionStatus.DELETE_IN_PROGRESS) {
            const deleteCommand = new DeleteTaskDefinitionsCommand({
                taskDefinitions: [task],
            })
            console.log(`AWS: START: Deleting task definition ${task} ...`)
            await client.send(deleteCommand)
            console.log('AWS:   END: DeleteTaskDefinitionsCommand finished')
        }
    }
}

export async function runECSFargateTask(
    client: ECSClient,
    cluster: string,
    taskFamilyName: string,
    subnets: string[],
    securityGroups: string[],
    tags: Tag[],
): Promise<RunTaskCommandOutput> {
    const runTaskInput: RunTaskCommandInput = {
        taskDefinition: taskFamilyName,
        cluster: cluster,
        launchType: LaunchType.FARGATE,
        networkConfiguration: {
            awsvpcConfiguration: {
                subnets: subnets,
                securityGroups: securityGroups,
            },
        },
        tags: tags,
    }
    const command = new RunTaskCommand(runTaskInput)
    console.log('AWS: START: Prompting an ECS task to run ...')
    const result = await client.send(command)
    /* v8 ignore next 3 */
    console.log(
        `AWS:   END: RunTaskCommand finished for tasks`,
        result.tasks?.map((task) => task.taskArn),
    )
    return result
}

async function getResourceCommandWrapper(
    tagFilters: TagFilter[],
    resourceTypeFilters: string[],
    client: ResourceGroupsTaggingAPIClient,
    logMessage: string,
): Promise<ResourceTagMapping[]> {
    let paginationToken = ''
    let accumulatedResources: ResourceTagMapping[] | undefined = undefined
    while (true) {
        const command = new GetResourcesCommand({
            TagFilters: tagFilters,
            ResourceTypeFilters: resourceTypeFilters,
            PaginationToken: paginationToken,
            ResourcesPerPage: 2,
        })

        console.log(`AWS: START: ${logMessage}`)
        const result = await client.send(command)
        // Throw if values are unexpectedly undefined
        result.ResourceTagMappingList = ensureValueWithError(result.ResourceTagMappingList)
        result.PaginationToken = ensureValueWithError(result.PaginationToken)
        console.log(`AWS:   END: GetResourcesCommand finished w/ list`, result.ResourceTagMappingList)
        // move onto the next page if there is one
        paginationToken = result.PaginationToken
        accumulatedResources = [...(accumulatedResources || []), ...result.ResourceTagMappingList]
        if (paginationToken === '') {
            break
        } else {
            console.log('AWS:        There are more pages of results, getting next page ...')
        }
    }
    console.log('AWS:        Found all resources matching input')
    return accumulatedResources
}

export async function getTaskResourcesByRunId(
    client: ResourceGroupsTaggingAPIClient,
    runId: string,
): Promise<ResourceTagMapping[]> {
    const tagFilters = [
        {
            Key: RUN_ID_TAG_KEY,
            Values: [runId],
        },
    ]
    const resourceTypeFilters = ['ecs:task', 'ecs:task-definition']
    const logMessage = `Getting task resources with run id ${runId} ...`

    return await getResourceCommandWrapper(tagFilters, resourceTypeFilters, client, logMessage)
}

export async function getAllTaskDefinitionsWithRunId(
    client: ResourceGroupsTaggingAPIClient,
): Promise<ResourceTagMapping[]> {
    const tagFilters = [
        {
            Key: RUN_ID_TAG_KEY,
        },
    ]
    const resourceTypeFilters = ['ecs:task-definition']
    const logMessage = 'Getting all task definitions with runId ...'
    return await getResourceCommandWrapper(tagFilters, resourceTypeFilters, client, logMessage)
}

export async function getAllTasksWithRunId(client: ResourceGroupsTaggingAPIClient): Promise<ResourceTagMapping[]> {
    const tagFilters = [
        {
            Key: RUN_ID_TAG_KEY,
        },
    ]
    const resourceTypeFilters = ['ecs:task']
    const logMessage = 'Getting all tasks with runId ...'
    return await getResourceCommandWrapper(tagFilters, resourceTypeFilters, client, logMessage)
}
