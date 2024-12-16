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
    getTaskDefinitionsWithRunId,
    deleteECSTaskDefinitions,
} from './aws'
import { filterManagementAppRuns, filterOrphanTaskDefinitions } from './utils'
import { managementAppGetRunnableStudiesRequest, toaGetRunsRequest } from './api'
import 'dotenv/config'
import { ManagementAppGetRunnableStudiesResponse } from './types'

async function launchStudy(
    client: ECSClient,
    cluster: string,
    baseTaskDefinition: string,
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
    const baseTaskDefinitionData = await getECSTaskDefinition(client, baseTaskDefinition)

    if (baseTaskDefinitionData.taskDefinition === undefined) {
        throw new Error(`Could not find task definition data for ${baseTaskDefinition}`)
    }

    const newTaskDefinitionFamily = `${baseTaskDefinitionData.taskDefinition.family}-${runId}`

    const registerTaskDefResponse = await registerECSTaskDefinition(
        client,
        baseTaskDefinitionData.taskDefinition,
        newTaskDefinitionFamily,
        toaEndpointWithRunId,
        imageLocation,
        taskTags,
    )

    if (registerTaskDefResponse.taskDefinition?.family === undefined) {
        throw new Error('Generated task definition has undefined family')
    }

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

    if (taggedResources.ResourceTagMappingList?.length === 0) {
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
    const taskDefsWithRunId = (await getTaskDefinitionsWithRunId(taggingClient)).ResourceTagMappingList || []
    const orphanTaskDefinitions = filterOrphanTaskDefinitions(bmaResults, taskDefsWithRunId)
    await deleteECSTaskDefinitions(ecsClient, orphanTaskDefinitions)
}

export async function runStudies(options: { ignoreAWSRuns: boolean }): Promise<void> {
    const ecsClient = new ECSClient()
    const taggingClient = new ResourceGroupsTaggingAPIClient()

    // Set in IaC
    const cluster = process.env.ECS_CLUSTER || ''
    const baseTaskDefinition = process.env.BASE_TASK_DEFINITION_FAMILY || ''
    const subnets = process.env.VPC_SUBNETS || ''
    const securityGroup = process.env.SECURITY_GROUP || ''

    const bmaRunnablesResults = await managementAppGetRunnableStudiesRequest()
    const toaGetRunsResult = await toaGetRunsRequest()
    const existingAwsRuns: string[] = []

    // Find runs already in AWS environment, unless --ignore-aws flag has been passed
    if (!options.ignoreAWSRuns) {
        for (const run of bmaRunnablesResults.runs) {
            if (await checkRunExists(taggingClient, run.runId)) {
                existingAwsRuns.push(run.runId)
            }
        }
    }

    const filteredResult = filterManagementAppRuns(bmaRunnablesResults, toaGetRunsResult, existingAwsRuns)

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
