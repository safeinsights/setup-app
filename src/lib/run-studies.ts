/* eslint-disable no-console */
import {
    ECSClient,
    LaunchType,
    RunTaskCommand,
    RunTaskCommandInput,
    RegisterTaskDefinitionCommand,
    RegisterTaskDefinitionCommandInput,
    DescribeTaskDefinitionCommand,
    DescribeTaskDefinitionCommandOutput,
    RunTaskCommandOutput,
} from '@aws-sdk/client-ecs'
import { GetResourcesCommand, ResourceGroupsTaggingAPIClient } from '@aws-sdk/client-resource-groups-tagging-api'
import { managementAppRequest } from './utils'
import 'dotenv/config'

async function launchStudy(
    client: ECSClient,
    cluster: string,
    baseTaskDefinition: string,
    subnets: string,
    securityGroup: string,
    runId: string,
    imageLocation: string,
    studyTitle: string,
): Promise<RunTaskCommandOutput> {
    const baseTaskDefinitionData = await getTaskDefinition(client, cluster, baseTaskDefinition)
    const containerDefinition = baseTaskDefinitionData.taskDefinition?.containerDefinitions?.map((container) => {
        return {
            ...container,
            image: imageLocation,
        }
    })

    const taskTags = [
        { key: 'runId', value: runId },
        { key: 'title', value: studyTitle },
    ]

    // Create a derived task definition for the study using the base
    // The following defines a new family versus versioning the base family
    const registerTaskDefInput: RegisterTaskDefinitionCommandInput = {
        family: `${baseTaskDefinitionData.taskDefinition?.family}-${runId}`,
        containerDefinitions: containerDefinition,
        taskRoleArn: baseTaskDefinitionData.taskDefinition?.taskRoleArn,
        executionRoleArn: baseTaskDefinitionData.taskDefinition?.executionRoleArn,
        networkMode: baseTaskDefinitionData.taskDefinition?.networkMode,
        cpu: baseTaskDefinitionData.taskDefinition?.cpu,
        memory: baseTaskDefinitionData.taskDefinition?.memory,
        tags: taskTags,
        requiresCompatibilities: baseTaskDefinitionData.taskDefinition?.requiresCompatibilities,
    }
    const registerTaskDefCommand = new RegisterTaskDefinitionCommand(registerTaskDefInput)
    const registerTaskDefResponse = await client.send(registerTaskDefCommand)

    const runTaskInput: RunTaskCommandInput = {
        taskDefinition: registerTaskDefResponse.taskDefinition?.family,
        cluster: cluster,
        launchType: LaunchType.FARGATE,
        networkConfiguration: {
            awsvpcConfiguration: {
                subnets: subnets.split(','),
                securityGroups: [securityGroup],
            },
        },
        tags: taskTags,
    }
    const runTaskCommand = new RunTaskCommand(runTaskInput)
    const runTaskResponse = await client.send(runTaskCommand)

    return runTaskResponse
}

async function checkRunExists(client: ResourceGroupsTaggingAPIClient, runId: string): Promise<boolean> {
    const getResourcesCommand = new GetResourcesCommand({
        TagFilters: [
            {
                Key: 'runId',
                Values: [runId],
            },
        ],
        ResourceTypeFilters: ['ecs:task', 'ecs:task-definition'],
    })

    const taggedResources = await client.send(getResourcesCommand)

    if (taggedResources.ResourceTagMappingList?.length === 0) {
        return false
    }

    console.log(taggedResources.ResourceTagMappingList)

    return true
}

async function getTaskDefinition(
    client: ECSClient,
    cluster: string,
    taskDefinition: string,
): Promise<DescribeTaskDefinitionCommandOutput> {
    const command = new DescribeTaskDefinitionCommand({
        taskDefinition: taskDefinition,
    })

    const res = await client.send(command)
    return res
}

const ecsClient = new ECSClient()
const taggingClient = new ResourceGroupsTaggingAPIClient()

// Set in IaC
const cluster = process.env.ECS_CLUSTER || ''
const baseTaskDefinition = process.env.BASE_TASK_DEFINITION_FAMILY || ''
const subnets = process.env.VPC_SUBNETS || ''
const securityGroup = process.env.SECURITY_GROUP || ''

// In case we want to test stuff without connecting to mgmt app
const _managementAppSampleData = {
    runs: [
        {
            runId: 'unique-run-id-3',
            containerLocation: '084375557107.dkr.ecr.us-east-1.amazonaws.com/research-app:v1',
            title: 'my-run-1',
        },
    ],
}

// Wrap calls in a function to avoid layers of promise resolves
const main = async (): Promise<void> => {
    // const result = _managementAppSampleData
    const result = await managementAppRequest()
    result.runs.forEach(async (run) => {
        await launchStudy(
            ecsClient,
            cluster,
            baseTaskDefinition,
            subnets,
            securityGroup,
            run.runId,
            run.containerLocation,
            run.title,
        )
        const exists = await checkRunExists(taggingClient, run.runId)
        console.log(exists)
    })
}

main()
