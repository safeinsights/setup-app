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
import {
    managementAppGetRunnableStudiesRequest,
    toaGetRunsRequest,
    filterManagmentAppRuns,
    filterOrphanTaskDefinitions,
} from './utils'
import 'dotenv/config'

const ecsClient = new ECSClient()
const taggingClient = new ResourceGroupsTaggingAPIClient()

// Set in IaC
const cluster = process.env.ECS_CLUSTER || ''
const baseTaskDefinition = process.env.BASE_TASK_DEFINITION_FAMILY || ''
const subnets = process.env.VPC_SUBNETS || ''
const securityGroup = process.env.SECURITY_GROUP || ''

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
        ecsClient,
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
        ecsClient,
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

export async function runStudies(ignoreAWSRuns: boolean): Promise<void> {
    const bmaRunnablesResults = await managementAppGetRunnableStudiesRequest()
    const toaGetRunsResult = await toaGetRunsRequest()
    const existingAwsRuns: string[] = []

    // Ignore AWS runs if --ignore-aws flag is passed
    if (!ignoreAWSRuns) {
        for (const run of bmaRunnablesResults.runs) {
            if (await checkRunExists(taggingClient, run.runId)) {
                existingAwsRuns.push(run.runId)
            }
        }
    }

    const filteredResult = filterManagmentAppRuns(bmaRunnablesResults, toaGetRunsResult, existingAwsRuns)

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

    await deleteECSTaskDefinitions(
        ecsClient,
        filterOrphanTaskDefinitions(
            bmaRunnablesResults,
            (await getTaskDefinitionsWithRunId(taggingClient)).ResourceTagMappingList || [],
        ),
    )
}

// Wrap calls in a function to avoid layers of promise resolves
const main = async (): Promise<void> => {
    let ignoreAWSRuns = false
    if (process.argv.includes('--help')) {
        printHelp()
        process.exit(0)
    }
    if (process.argv.includes('--ignore-aws')) {
        console.log('Ignoring AWS existing runs')
        ignoreAWSRuns = true
    }

    await runStudies(ignoreAWSRuns)
}

const printHelp = () => {
    console.log('Usage: npx tsx run-studies.ts')
    console.log('Options:')
    console.log('--help             Display this help message')
    console.log('--ignore-aws       Ignore AWS existing runs and start a new run')
}

main()
