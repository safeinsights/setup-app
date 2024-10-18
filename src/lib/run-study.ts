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
import { ResourceGroupsTaggingAPIClient } from '@aws-sdk/client-resource-groups-tagging-api'
import { checkForStudyTask } from './check-study-exists'

async function launchStudy(
    client: ECSClient,
    cluster: string,
    baseTaskDefinition: string,
    subnets: string,
    securityGroup: string,
    studyId: string,
    studyImage: string,
): Promise<RunTaskCommandOutput> {
    const baseTaskDefinitionData = await getTaskDefinition(client, cluster, baseTaskDefinition)
    const containerDefinition = baseTaskDefinitionData.taskDefinition?.containerDefinitions?.map((container) => {
        return {
            ...container,
            image: studyImage,
        }
    })

    // Create a derived task definition for the study using the base
    // The following defines a new family versus versioning the base family
    const registerTaskDefInput: RegisterTaskDefinitionCommandInput = {
        family: `${baseTaskDefinitionData.taskDefinition?.family}-${studyId}`,
        containerDefinitions: containerDefinition,
        taskRoleArn: baseTaskDefinitionData.taskDefinition?.taskRoleArn,
        executionRoleArn: baseTaskDefinitionData.taskDefinition?.executionRoleArn,
        networkMode: baseTaskDefinitionData.taskDefinition?.networkMode,
        cpu: baseTaskDefinitionData.taskDefinition?.cpu,
        memory: baseTaskDefinitionData.taskDefinition?.memory,
        tags: [{ key: 'studyId', value: studyId }],
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
        tags: [{ key: 'studyId', value: studyId }],
    }
    const runTaskCommand = new RunTaskCommand(runTaskInput)
    const runTaskResponse = await client.send(runTaskCommand)

    return runTaskResponse
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

// Things that we expect to get from management app
const studyId = 'unique-study-id-3'
const studyImage = '084375557107.dkr.ecr.us-east-1.amazonaws.com/research-app:v1' // Change this by region

launchStudy(ecsClient, cluster, baseTaskDefinition, subnets, securityGroup, studyId, studyImage).then(() => {
    checkForStudyTask(taggingClient, studyId).then((res) => {
        console.log(res)
    })
})
