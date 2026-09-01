import { ECSClient, RunTaskCommandOutput } from '@aws-sdk/client-ecs'
import { ResourceGroupsTaggingAPIClient } from '@aws-sdk/client-resource-groups-tagging-api'
import {
    getECSTaskDefinition,
    registerECSTaskDefinition,
    runECSFargateTask,
    JOB_ID_TAG_KEY,
    RESEARCHER_ID_TAG_KEY,
    MANAGEMENT_APP_TAG_KEY,
    getAllTaskDefinitionsWithJobId,
    getAllTasksWithJobId,
} from './aws'
import { ensureValueWithError, filterManagementAppJobs, toManagementAppTagValue } from './utils'
import { managementAppGetReadyStudiesRequest, toaUpdateJobStatus } from './api'
import 'dotenv/config'
import { ManagementAppGetReadyStudiesResponse } from './types'

async function launchStudy(
    client: ECSClient,
    cluster: string,
    baseTaskDefinitionFamily: string,
    managementAppTag: string,
    subnets: string[],
    securityGroup: string,
    toaEndpointWithJobId: string,
    jobId: string,
    imageLocation: string,
    studyTitle: string,
    researcherId: string,
): Promise<RunTaskCommandOutput> {
    console.log(`Creating task definition for study ${studyTitle} and jobId ${jobId}`)
    const taskTags = [
        { key: JOB_ID_TAG_KEY, value: jobId },
        { key: RESEARCHER_ID_TAG_KEY, value: researcherId },
        { key: MANAGEMENT_APP_TAG_KEY, value: managementAppTag },
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
        jobId, // Use job ID as the stream prefix
        researcherId,
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

export async function runAWSStudies(options: { ignoreAWSJobs: boolean }): Promise<void> {
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
    // Tags our AWS resources so other enclaves in this account leave them alone
    const managementAppTag = toManagementAppTagValue(
        ensureValueWithError(process.env.MANAGEMENT_APP_BASE_URL, 'Env var MANAGEMENT_APP_BASE_URL not found'),
        ensureValueWithError(process.env.MANAGEMENT_APP_MEMBER_ID, 'Env var MANAGEMENT_APP_MEMBER_ID not found'),
    )

    const bmaReadysResults = await managementAppGetReadyStudiesRequest()
    console.log(
        `Found ${bmaReadysResults.jobs.length} jobs in management app. Job ids: ${bmaReadysResults.jobs.map((job) => job.jobId)}`,
    )

    // Possibly used in filtering; used in garbage collection
    const existingAwsTaskDefs = await getAllTaskDefinitionsWithJobId(taggingClient, managementAppTag)
    console.log(`Found ${existingAwsTaskDefs.length} task definitions with jobId in the AWS environment`)

    let filteredResult: ManagementAppGetReadyStudiesResponse

    if (options.ignoreAWSJobs) {
        // Don't query AWS, filter without it
        filteredResult = filterManagementAppJobs(bmaReadysResults)
    } else {
        // Take AWS into account when filtering
        const existingAwsTasks = await getAllTasksWithJobId(taggingClient, managementAppTag)
        console.log(`Found ${existingAwsTasks.length} tasks with jobId in the AWS environment`)

        filteredResult = filterManagementAppJobs(bmaReadysResults, existingAwsTasks, existingAwsTaskDefs)
    }

    console.log(
        `Found ${filteredResult.jobs.length} studies that can be job. Job ids: ${filteredResult.jobs.map((job) => job.jobId)}`,
    )

    for (const job of filteredResult.jobs) {
        console.log(`Launching study for job ID ${job.jobId}`)

        const toaEndpointWithJobId = `${process.env.TOA_BASE_URL}/api/job/${job.jobId}`

        let launchSuccess: boolean = true

        try {
            await launchStudy(
                ecsClient,
                cluster,
                baseTaskDefinition,
                managementAppTag,
                subnets.split(','),
                securityGroup,
                toaEndpointWithJobId,
                job.jobId,
                job.containerLocation,
                job.title,
                job.researcherId,
            )
        } catch (error: unknown) {
            // NOTE: The AWS generated message may be confusing to users, so it is logged for
            // devs / operators but not passed through to the TOA
            console.error(`Error launching study for job ID ${job.jobId}. Cause: ${error}`)
            launchSuccess = false
        }

        if (launchSuccess) {
            await toaUpdateJobStatus(job.jobId, { status: 'JOB-PROVISIONING' })
        } else {
            await toaUpdateJobStatus(job.jobId, { status: 'JOB-ERRORED', message: 'Failed to launch job' })
        }
    }
}
