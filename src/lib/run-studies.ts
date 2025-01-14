/* eslint-disable no-console */
import { ECSClient, RunTaskCommandOutput } from '@aws-sdk/client-ecs'
import { ResourceGroupsTaggingAPIClient } from '@aws-sdk/client-resource-groups-tagging-api'
import {
    getECSTaskDefinition,
    registerECSTaskDefinition,
    runECSFargateTask,
    getTaskResourcesByRunId,
    RUN_ID_TAG_KEY,
    TITLE_TAG_KEY,
    getAllTaskDefinitionsWithRunId,
    deleteECSTaskDefinitions,
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

async function checkRunExists(client: ResourceGroupsTaggingAPIClient, runId: string): Promise<boolean> {
    const taggedResources = await getTaskResourcesByRunId(client, runId)

    if (taggedResources.ResourceTagMappingList.length === 0) {
        return false
    }

    return true
}

async function cleanupTaskDefs(
    bmaResults: ManagementAppGetRunnableStudiesResponse,
    taggingClient: ResourceGroupsTaggingAPIClient,
    ecsClient: ECSClient,
) {
    // Garbage collect orphan task definitions
    const taskDefsWithRunId = (await getAllTaskDefinitionsWithRunId(taggingClient)).ResourceTagMappingList
    const orphanTaskDefinitions = filterOrphanTaskDefinitions(bmaResults, taskDefsWithRunId)
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
    console.log(
        `Found ${bmaRunnablesResults.runs.length} runs in management app. Run ids: ${bmaRunnablesResults.runs.map((run) => run.runId)}`,
    )
    const toaGetRunsResult = await toaGetRunsRequest()
    console.log(
        `Found ${toaGetRunsResult.runs.length} runs with results in TOA. Run ids: ${toaGetRunsResult.runs.map((run) => run.runId)}`,
    )
    const existingAwsRuns: string[] = []

    // Find runs already in AWS environment, unless --ignore-aws flag has been passed
    if (!options.ignoreAWSRuns) {
        for (const run of bmaRunnablesResults.runs) {
            if (await checkRunExists(taggingClient, run.runId)) {
                existingAwsRuns.push(run.runId)
                console.log(run.runId, 'present in AWS')
            }
        }
    } else {
        console.log('Skipped filtering out runs in AWS.')
    }

    const filteredResult = filterManagementAppRuns(bmaRunnablesResults, toaGetRunsResult, existingAwsRuns)

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
    cleanupTaskDefs(bmaRunnablesResults, taggingClient, ecsClient)
}
