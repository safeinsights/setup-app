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

async function launchStudy(
    client: ECSClient,
    cluster: string,
    baseTaskDefinition: string,
    subnet: string,
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
                subnets: [subnet],
                securityGroups: [securityGroup],
            },
        },
        tags: [{ key: 'studyId', value: studyId }],
    }
    const runTaskCommand = new RunTaskCommand(runTaskInput)
    const runTaskResponse = await client.send(runTaskCommand)

    return runTaskResponse
}

async function checkForStudyTask(client: ResourceGroupsTaggingAPIClient, studyId: string): Promise<boolean> {
    const getResourcesCommand = new GetResourcesCommand({
        TagFilters: [
            {
                Key: 'studyId',
                Values: [studyId],
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

// Things that should probably get passed via environment variable but hard coding for dev hacking
const cluster = 'OpenStaxSecureEnclaveStack-OpenStaxSecureEnclaveFargateCluster23E6B3A1-JBi5bpcwL0WP'
const baseTaskDefinition = 'OpenStaxSecureEnclaveStackResearchContainerTaskDefDB2DA923'
const subnet = 'subnet-015f2a58016853140'
const securityGroup = 'sg-037f146b210c0df15'

// Things that we expect to get from management app
const studyId = 'unique-study-id-3'
const studyImage = '084375557107.dkr.ecr.us-east-1.amazonaws.com/research-app:v1'

launchStudy(ecsClient, cluster, baseTaskDefinition, subnet, securityGroup, studyId, studyImage).then(() => {
    checkForStudyTask(taggingClient, studyId).then((res) => {
        console.log(res)
    })
})
