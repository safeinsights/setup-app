import { ECSClient, RunTaskCommandOutput } from '@aws-sdk/client-ecs'
import { ResourceGroupsTaggingAPIClient, ResourceTagMapping } from '@aws-sdk/client-resource-groups-tagging-api'
import {
    getECSTaskDefinition,
    registerECSTaskDefinition,
    runECSFargateTask,
    JOB_ID_TAG_KEY,
    TITLE_TAG_KEY,
    getAllTaskDefinitionsWithJobId,
    deleteECSTaskDefinitions,
    getAllTasksWithJobId,
} from './aws'
import { ensureValueWithError, filterManagementAppJobs, filterOrphanTaskDefinitions } from './utils'
import { managementAppGetReadyStudiesRequest, toaGetJobsRequest, toaUpdateJobStatus } from './api'
import 'dotenv/config'
import { ManagementAppGetReadyStudiesResponse } from './types'

async function launchStudy(
    client: ECSClient,
    cluster: string,
    baseTaskDefinitionFamily: string,
    subnets: string[],
    securityGroup: string,
    toaEndpointWithJobId: string,
    jobId: string,
    imageLocation: string,
    studyTitle: string,
): Promise<RunTaskCommandOutput> {
    const taskTags = [
        { key: JOB_ID_TAG_KEY, value: jobId },
        { key: TITLE_TAG_KEY, value: studyTitle },
    ]
    const baseTaskDefinitionData = await getECSTaskDefinition(client, baseTaskDefinitionFamily)
    baseTaskDefinitionData.taskDefinition = ensureValueWithError(
        baseTaskDefinitionData.taskDefinition,
        `Could not find task definition data for ${baseTaskDefinitionFamily}`,
    )

    const newTaskDefinitionFamily = `${baseTaskDefinitionData.taskDefinition.family}-${jobId}`

    const registerTaskDefResponse = await registerECSTaskDefinition(
        client,
        baseTaskDefinitionData.taskDefinition,
        newTaskDefinitionFamily,
        toaEndpointWithJobId,
        imageLocation,
        taskTags,
    )
    registerTaskDefResponse.taskDefinition = ensureValueWithError(
        registerTaskDefResponse.taskDefinition,
        `Could not register task definition ${newTaskDefinitionFamily}`,
    )
    registerTaskDefResponse.taskDefinition.family = ensureValueWithError(
        registerTaskDefResponse.taskDefinition.family,
        'Generated task definition has undefined family',
    )

    return await runECSFargateTask(
        client,
        cluster,
        registerTaskDefResponse.taskDefinition.family,
        subnets,
        [securityGroup],
        taskTags,
    )
}

async function cleanupTaskDefs(
    bmaResults: ManagementAppGetReadyStudiesResponse,
    taskDefsWithJobId: ResourceTagMapping[],
    ecsClient: ECSClient,
) {
    // Garbage collect orphan task definitions
    const orphanTaskDefinitions = filterOrphanTaskDefinitions(bmaResults, taskDefsWithJobId)
    console.log(`Found ${orphanTaskDefinitions.length} orphan task definitions to delete`)
    await deleteECSTaskDefinitions(ecsClient, orphanTaskDefinitions)
}

export async function runStudies(options: { ignoreAWSJobs: boolean }): Promise<void> {
    const ecsClient = new ECSClient()
    const taggingClient = new ResourceGroupsTaggingAPIClient()

    // Set in IaC
    const cluster = ensureValueWithError(process.env.ECS_CLUSTER, 'Env var ECS_CLUSTER not found')
    const baseTaskDefinition = ensureValueWithError(
        process.env.BASE_TASK_DEFINITION_FAMILY,
        'Env var BASE_TASK_DEFINITION_FAMILY not found',
    )
    const subnets = ensureValueWithError(process.env.VPC_SUBNETS, 'Env var VPC_SUBNETS not found')
    const securityGroup = ensureValueWithError(process.env.SECURITY_GROUP, 'Env var SECURITY_GROUP not found')

    const bmaReadysResults = await managementAppGetReadyStudiesRequest()
    console.log(
        `Found ${bmaReadysResults.jobs.length} jobs in management app. Job ids: ${bmaReadysResults.jobs.map((job) => job.jobId)}`,
    )
    const toaGetJobsResult = await toaGetJobsRequest()
    console.log(
        `Found ${toaGetJobsResult.jobs.length} jobs with results in TOA. Job ids: ${toaGetJobsResult.jobs.map((job) => job.jobId)}`,
    )

    // Possibly used in filtering; used in garbage collection
    const existingAwsTaskDefs = await getAllTaskDefinitionsWithJobId(taggingClient)
    console.log(`Found ${existingAwsTaskDefs.length} task definitions with jobId in the AWS environment`)

    let filteredResult: ManagementAppGetReadyStudiesResponse

    if (options.ignoreAWSJobs) {
        // Don't query AWS, filter without it
        filteredResult = filterManagementAppJobs(bmaReadysResults, toaGetJobsResult)
    } else {
        // Take AWS into account when filtering
        const existingAwsTasks = await getAllTasksWithJobId(taggingClient)
        console.log(`Found ${existingAwsTasks.length} tasks with jobId in the AWS environment`)

        filteredResult = filterManagementAppJobs(
            bmaReadysResults,
            toaGetJobsResult,
            existingAwsTasks,
            existingAwsTaskDefs,
        )
    }

    console.log(
        `Found ${filteredResult.jobs.length} studies that can be job. Job ids: ${filteredResult.jobs.map((job) => job.jobId)}`,
    )

    for (const job of filteredResult.jobs) {
        console.log(`Launching study for job ID ${job.jobId}`)

        const toaEndpointWithJobId = `${process.env.TOA_BASE_URL}/api/job/${job.jobId}`

        await launchStudy(
            ecsClient,
            cluster,
            baseTaskDefinition,
            subnets.split(','),
            securityGroup,
            toaEndpointWithJobId,
            job.jobId,
            job.containerLocation,
            job.title,
        )

        await toaUpdateJobStatus(job.jobId, { status: 'JOB-PROVISIONING' })
    }

    // Tidy AWS environment
    cleanupTaskDefs(bmaReadysResults, existingAwsTaskDefs, ecsClient)
}
