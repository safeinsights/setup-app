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
    DescribeTasksCommand,
    DescribeTasksCommandOutput,
} from '@aws-sdk/client-ecs'
import { CloudWatchLogsClient, paginateFilterLogEvents } from '@aws-sdk/client-cloudwatch-logs'
import {
    GetResourcesCommandInput,
    paginateGetResources,
    ResourceGroupsTaggingAPIClient,
    ResourceTagMapping,
    TagFilter,
} from '@aws-sdk/client-resource-groups-tagging-api'
import { ensureValueWithError } from './utils'

export const JOB_ID_TAG_KEY = 'jobId'
export const TITLE_TAG_KEY = 'title'
export const RESEARCHER_ID_TAG_KEY = 'researcherId'

export type LogEntry = {
    timestamp: number
    message: string
}

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
    toaEndpointWithJobId: string,
    imageLocation: string,
    logStreamPrefix: string,
    researcherId: string,
    tags: Tag[],
): Promise<RegisterTaskDefinitionCommandOutput> {
    // Create a derived task definition using the base
    // The following defines a new family versus versioning the base family

    const containerDefinition = baseTaskDefinition.containerDefinitions?.map((container) => {
        const environment = ensureValueWithError(container.environment, `No environment found on ${container}`)
        const logConfiguration = ensureValueWithError(
            container.logConfiguration,
            `No log configuration found on ${container}`,
        )

        logConfiguration.options ??= {}
        logConfiguration.options['awslogs-stream-prefix'] = logStreamPrefix

        environment.push({
            name: 'TRUSTED_OUTPUT_ENDPOINT',
            value: toaEndpointWithJobId,
        })
        environment.push({
            name: 'RESEARCHER_ID',
            value: researcherId,
        })
        return {
            ...container,
            environment,
            logConfiguration,
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
    const jobTaskInput: RunTaskCommandInput = {
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
        enableExecuteCommand: true,
    }
    const command = new RunTaskCommand(jobTaskInput)
    console.log('AWS: START: Prompting an ECS task to run ...')
    const result = await client.send(command)
    /* v8 ignore next 3 */
    console.log(
        `AWS:   END: RunTaskCommand finished for tasks`,
        result.tasks?.map((task) => task.taskArn),
    )
    return result
}

export async function describeECSTasks(
    client: ECSClient,
    cluster: string,
    tasks: string[],
): Promise<DescribeTasksCommandOutput> {
    const command = new DescribeTasksCommand({ cluster, tasks, include: ['TAGS'] })

    console.log('AWS: START: Calling ECS DescribeTasks ...')
    const result = await client.send(command)
    console.log('AWS:   END: DescribeTasks finished')

    return result
}

async function getResourceCommandWrapper(
    tagFilters: TagFilter[],
    resourceTypeFilters: string[],
    client: ResourceGroupsTaggingAPIClient,
    logMessage: string,
): Promise<ResourceTagMapping[]> {
    const accumulatedResources: ResourceTagMapping[] = []

    const input: GetResourcesCommandInput = {
        TagFilters: tagFilters,
        ResourceTypeFilters: resourceTypeFilters,
    }

    console.log(`AWS: START: ${logMessage}`)
    for await (const page of paginateGetResources({ client }, input)) {
        page.ResourceTagMappingList = ensureValueWithError(page.ResourceTagMappingList)
        accumulatedResources.push(...page.ResourceTagMappingList)
    }
    console.log(`AWS:   END: GetResourcesCommand finished with list`, accumulatedResources)

    return accumulatedResources
}

export async function getTaskResourcesByJobId(
    client: ResourceGroupsTaggingAPIClient,
    jobId: string,
): Promise<ResourceTagMapping[]> {
    const tagFilters = [
        {
            Key: JOB_ID_TAG_KEY,
            Values: [jobId],
        },
    ]
    const resourceTypeFilters = ['ecs:task', 'ecs:task-definition']
    const logMessage = `Getting task resources with job id ${jobId} ...`

    return await getResourceCommandWrapper(tagFilters, resourceTypeFilters, client, logMessage)
}

export async function getAllTaskDefinitionsWithJobId(
    client: ResourceGroupsTaggingAPIClient,
): Promise<ResourceTagMapping[]> {
    const tagFilters = [
        {
            Key: JOB_ID_TAG_KEY,
        },
    ]
    const resourceTypeFilters = ['ecs:task-definition']
    const logMessage = 'Getting all task definitions with jobId ...'
    return await getResourceCommandWrapper(tagFilters, resourceTypeFilters, client, logMessage)
}

export async function getAllTasksWithJobId(client: ResourceGroupsTaggingAPIClient): Promise<ResourceTagMapping[]> {
    const tagFilters = [
        {
            Key: JOB_ID_TAG_KEY,
        },
    ]
    const resourceTypeFilters = ['ecs:task']
    const logMessage = 'Getting all tasks with jobId ...'
    return await getResourceCommandWrapper(tagFilters, resourceTypeFilters, client, logMessage)
}

export async function getLogsForTask(taskId: string, taskDefArn: string): Promise<LogEntry[]> {
    const logsClient = new CloudWatchLogsClient({})
    const ecsClient = new ECSClient()

    // Get full task definition to find the log configuration
    const taskDefData = await getECSTaskDefinition(ecsClient, taskDefArn)
    const logConfiguration = taskDefData.taskDefinition?.containerDefinitions?.find(
        (container) => container.name === 'ResearchContainer',
    )?.logConfiguration
    ensureValueWithError(logConfiguration, `Could not find log configuration for task ${taskId}`)
    console.log(`Found log configuration`, logConfiguration)

    const logGroupName = ensureValueWithError(logConfiguration?.options?.['awslogs-group'])
    const logStreamPrefix = ensureValueWithError(logConfiguration?.options?.['awslogs-stream-prefix'])

    // Get the log events for the task
    const events: LogEntry[] = []
    console.log(`AWS: START: Getting log events for task ${taskId} ...`)
    const paginatedLogEvents = paginateFilterLogEvents(
        { client: logsClient },
        {
            logGroupIdentifier: logGroupName,
            logStreamNames: [`${logStreamPrefix}/ResearchContainer/${taskId}`],
        },
    )
    for await (const page of paginatedLogEvents) {
        page.events?.map((event) => {
            events.push({
                timestamp: ensureValueWithError(event.timestamp),
                message: ensureValueWithError(event.message),
            })
        })
    }

    console.log(`AWS:   END: paginateFilterLogEvents finished with ${events.length} log events for task ${taskId}`)

    return events
}
