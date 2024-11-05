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
} from '@aws-sdk/client-ecs'
import {
    GetResourcesCommand,
    GetResourcesCommandOutput,
    ResourceGroupsTaggingAPIClient,
} from '@aws-sdk/client-resource-groups-tagging-api'

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
    imageLocation: string,
    tags: Tag[],
): Promise<RegisterTaskDefinitionCommandOutput> {
    // Create a derived task definition using the base
    // The following defines a new family versus versioning the base family

    const containerDefinition = baseTaskDefinition.containerDefinitions?.map((container) => {
        return {
            ...container,
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
                Key: 'runId',
                Values: [runId],
            },
        ],
        ResourceTypeFilters: ['ecs:task', 'ecs:task-definition'],
    })

    return await client.send(command)
}
