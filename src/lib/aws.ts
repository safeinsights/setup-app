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
    GetResourcesCommandOutput,
    ResourceGroupsTaggingAPIClient,
} from '@aws-sdk/client-resource-groups-tagging-api'
import { ensureValueWithExchange } from './utils'

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

    console.log('AWS:   END: DescribeTaskDefinitionCommand finished')

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
        const environment = ensureValueWithExchange(container.environment, [])

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
            console.log('AWS: START: Deregistering task definition ...')
            await client.send(deregisterCommand)
            console.log('AWS:   END: DegregisterTaskDefinitionCommand finished')
        }

        // If the task definition is not DELETE_IN_PROGRESS, we request a deletion
        if (taskDefinitionDetails.taskDefinition?.status !== TaskDefinitionStatus.DELETE_IN_PROGRESS) {
            const deleteCommand = new DeleteTaskDefinitionsCommand({
                taskDefinitions: [task],
            })
            console.log('AWS: START: Deleting task definitions ...')
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
    console.log('AWS:   END: RunTaskCommand finished')
    return result
}

export async function getTaskResourcesByRunId(
    client: ResourceGroupsTaggingAPIClient,
    runId: string,
): Promise<GetResourcesCommandOutput> {
    const command = new GetResourcesCommand({
        TagFilters: [
            {
                Key: RUN_ID_TAG_KEY,
                Values: [runId],
            },
        ],
        ResourceTypeFilters: ['ecs:task', 'ecs:task-definition'],
    })

    console.log(`AWS: START: Getting a run with run id ${runId} ...`)
    const result = await client.send(command)
    console.log('AWS:   END: GetResourcesCommand finished')
    return result
}

export async function getAllTaskDefinitionsWithRunId(
    client: ResourceGroupsTaggingAPIClient,
): Promise<GetResourcesCommandOutput> {
    // TODO: pagination of results may mean this only returns the first page
    const command = new GetResourcesCommand({
        TagFilters: [
            {
                Key: RUN_ID_TAG_KEY,
            },
        ],
        ResourceTypeFilters: ['ecs:task-definition'],
    })

    console.log('AWS: START: Getting all task definitions with runId ...')
    const result = await client.send(command)
    console.log('AWS:   END: GetResourcesCommand finished')
    return result
}
