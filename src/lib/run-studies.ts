 
import { ECSClient, RunTaskCommandOutput } from '@aws-sdk/client-ecs'
import { ResourceGroupsTaggingAPIClient, ResourceTagMapping } from '@aws-sdk/client-resource-groups-tagging-api'
import {
    getECSTaskDefinition,
    registerECSTaskDefinition,
    runECSFargateTask,
    RUN_ID_TAG_KEY,
    TITLE_TAG_KEY,
    getAllTaskDefinitionsWithRunId,
    deleteECSTaskDefinitions,
    getAllTasksWithRunId,
} from './aws'
import { ensureValueWithError, filterManagementAppRuns, filterOrphanTaskDefinitions } from './utils'
import { managementAppGetRunnableStudiesRequest, toaGetRunsRequest } from './api'
import 'dotenv/config'
import { ManagementAppGetRunnableStudiesResponse } from './types'

async function launchStudy(
    client: ECSClient,
    cluster: string,
    baseTaskDefinitionFamily: string,
    subnets: string[],
    securityGroup: string,
    toaEndpointWithRunId: string,
    runId: string,
    imageLocation: string,
    studyTitle: string,
): Promise<RunTaskCommandOutput> {
    const taskTags = [
        { key: RUN_ID_TAG_KEY, value: runId },
        { key: TITLE_TAG_KEY, value: studyTitle },
    ]
    const baseTaskDefinitionData = await getECSTaskDefinition(client, baseTaskDefinitionFamily)
    baseTaskDefinitionData.taskDefinition = ensureValueWithError(
        baseTaskDefinitionData.taskDefinition,
        `Could not find task definition data for ${baseTaskDefinitionFamily}`,
    )

    const newTaskDefinitionFamily = `${baseTaskDefinitionData.taskDefinition.family}-${runId}`

    const registerTaskDefResponse = await registerECSTaskDefinition(
        client,
        baseTaskDefinitionData.taskDefinition,
        newTaskDefinitionFamily,
        toaEndpointWithRunId,
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
    bmaResults: ManagementAppGetRunnableStudiesResponse,
    taskDefsWithRunId: ResourceTagMapping[],
    ecsClient: ECSClient,
) {
    // Garbage collect orphan task definitions
    const orphanTaskDefinitions = filterOrphanTaskDefinitions(bmaResults, taskDefsWithRunId)
    console.log(`Found ${orphanTaskDefinitions.length} orphan task definitions to delete`)
    await deleteECSTaskDefinitions(ecsClient, orphanTaskDefinitions)
}

export async function runStudies(options: { ignoreAWSRuns: boolean }): Promise<void> {
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

    const bmaRunnablesResults = await managementAppGetRunnableStudiesRequest()
    // const bmaRunnablesResults: ManagementAppGetRunnableStudiesResponse = {
    // runs: [
    // {
    //     runId: 'run1',
    //     containerLocation: 'location1',
    //     title: 'title1',
    // },
    // {
    //     runId: 'run2',
    //     containerLocation: 'location2',
    //     title: 'title2',
    // },
    // {
    //     runId: 'run3',
    //     containerLocation: 'location3',
    //     title: 'title3',
    // },
    // {
    //     runId: 'run4',
    //     containerLocation: 'location4',
    //     title: 'title4',
    // }
    // ],
    // }
    console.log(
        `Found ${bmaRunnablesResults.runs.length} runs in management app. Run ids: ${bmaRunnablesResults.runs.map((run) => run.runId)}`,
    )
    const toaGetRunsResult = await toaGetRunsRequest()
    // const toaGetRunsResult: TOAGetRunsResponse = {
    //     runs: [],
    // }
    console.log(
        `Found ${toaGetRunsResult.runs.length} runs with results in TOA. Run ids: ${toaGetRunsResult.runs.map((run) => run.runId)}`,
    )

    // Possibly used in filtering; used in garbage collection
    const existingAwsTaskDefs = await getAllTaskDefinitionsWithRunId(taggingClient)
    console.log(`Found ${existingAwsTaskDefs.length} task definitions with runId in the AWS environment`)

    let filteredResult: ManagementAppGetRunnableStudiesResponse

    if (options.ignoreAWSRuns) {
        // Don't query AWS, filter without it
        filteredResult = filterManagementAppRuns(bmaRunnablesResults, toaGetRunsResult)
    } else {
        // Take AWS into account when filtering
        const existingAwsTasks = await getAllTasksWithRunId(taggingClient)
        console.log(`Found ${existingAwsTasks.length} tasks with runId in the AWS environment`)

        filteredResult = filterManagementAppRuns(
            bmaRunnablesResults,
            toaGetRunsResult,
            existingAwsTasks,
            existingAwsTaskDefs,
        )
    }

    console.log(
        `Found ${filteredResult.runs.length} studies that can be run. Run ids: ${filteredResult.runs.map((run) => run.runId)}`,
    )

    for (const run of filteredResult.runs) {
        console.log(`Launching study for run ID ${run.runId}`)

        const toaEndpointWithRunId = `${process.env.TOA_BASE_URL}/api/run/${run.runId}`

        await launchStudy(
            ecsClient,
            cluster,
            baseTaskDefinition,
            subnets.split(','),
            securityGroup,
            toaEndpointWithRunId,
            run.runId,
            run.containerLocation,
            run.title,
        )
    }

    // Tidy AWS environment
    cleanupTaskDefs(bmaRunnablesResults, existingAwsTaskDefs, ecsClient)
}
