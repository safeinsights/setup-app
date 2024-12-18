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
    taskDefinition: string,
): Promise<DescribeTaskDefinitionCommandOutput> {
    const command = new DescribeTaskDefinitionCommand({
        taskDefinition: taskDefinition,
    })

    return await client.send(command)
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
    return await client.send(command)
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
            await client.send(deregisterCommand)
        }

        // If the task definition is not DELETE_IN_PROGRESS, we request a deletion
        if (taskDefinitionDetails.taskDefinition?.status !== TaskDefinitionStatus.DELETE_IN_PROGRESS) {
            const deleteCommand = new DeleteTaskDefinitionsCommand({
                taskDefinitions: [task],
            })
            await client.send(deleteCommand)
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
    return await client.send(command)
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

    return await client.send(command)
}

export async function getTaskDefinitionsWithRunId(
    client: ResourceGroupsTaggingAPIClient,
): Promise<GetResourcesCommandOutput> {
    const command = new GetResourcesCommand({
        TagFilters: [
            {
                Key: RUN_ID_TAG_KEY,
            },
        ],
        ResourceTypeFilters: ['ecs:task-definition'],
    })

    return await client.send(command)
}
