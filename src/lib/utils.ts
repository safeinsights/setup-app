import { ManagementAppGetRunnableStudiesResponse, TOAGetRunsResponse } from './types'
import { ResourceTagMapping } from '@aws-sdk/client-resource-groups-tagging-api'
import { RUN_ID_TAG_KEY } from './aws'

const getRunIdFromResourceTagMapping = (resource: ResourceTagMapping): string | undefined => {
    return resource.Tags?.find((tag) => tag.Key === RUN_ID_TAG_KEY)?.Value
}

export const filterManagementAppRuns = (
    managementAppResponse: ManagementAppGetRunnableStudiesResponse,
    toaResponse: TOAGetRunsResponse,
    existingAwsTasks?: ResourceTagMapping[],
    existingAwsTaskDefs?: ResourceTagMapping[],
): ManagementAppGetRunnableStudiesResponse => {
    const toaRunIdArray: string[] = toaResponse.runs.map((run) => run.runId) // flatten toaResponse
    const taskRunIdArray: string[] =
        existingAwsTasks?.map((resource) => ensureValueWithError(getRunIdFromResourceTagMapping(resource))) || []
    const taskDefRunIdArray: string[] =
        existingAwsTaskDefs?.map((resource) => ensureValueWithError(getRunIdFromResourceTagMapping(resource))) || []

    return {
        runs: managementAppResponse.runs.filter((run) => {
            return (
                !toaRunIdArray.includes(run.runId) &&
                !taskRunIdArray.includes(run.runId) &&
                !taskDefRunIdArray.includes(run.runId)
            )
        }),
    }
}

export const filterOrphanTaskDefinitions = (
    managementAppResponse: ManagementAppGetRunnableStudiesResponse,
    taskDefinitionResources: ResourceTagMapping[],
): string[] => {
    const managementAppRunIds = managementAppResponse.runs.map((run) => run.runId)
    const orphanTaskDefinitions: string[] = []

    // If there are task definitions with run IDs that were not returned by
    // the BMA, they must be for orphan tasks that were already run.
    taskDefinitionResources.forEach((item) => {
        const runId = getRunIdFromResourceTagMapping(item)
        if (runId !== undefined && !managementAppRunIds.includes(runId) && item.ResourceARN !== undefined) {
            orphanTaskDefinitions.push(item.ResourceARN)
        }
    })

    return orphanTaskDefinitions
}

// returns given value with type certainty, or errors if value is null or undefined
export const ensureValueWithError = <T>(value: T | null | undefined, message?: string): T => {
    if (value === null || value === undefined) {
        throw new Error(message || `${value} value`)
    }
    return value
}
