import { ResourceTagMapping } from '@aws-sdk/client-resource-groups-tagging-api'
import fs from 'fs'
import { JOB_ID_TAG_KEY } from './aws'
import { ManagementAppGetReadyStudiesResponse, TOAGetJobsResponse } from './types'

const getJobIdFromResourceTagMapping = (resource: ResourceTagMapping): string | undefined => {
    return resource.Tags?.find((tag) => tag.Key === JOB_ID_TAG_KEY)?.Value
}

export const filterManagementAppJobs = (
    managementAppResponse: ManagementAppGetReadyStudiesResponse,
    toaResponse: TOAGetJobsResponse,
    existingAwsTasks?: ResourceTagMapping[],
    existingAwsTaskDefs?: ResourceTagMapping[],
): ManagementAppGetReadyStudiesResponse => {
    const toaJobIdArray: string[] = toaResponse.jobs.map((job) => job.jobId) // flatten toaResponse
    const taskJobIdArray: string[] =
        existingAwsTasks?.map((resource) => ensureValueWithError(getJobIdFromResourceTagMapping(resource))) || []
    const taskDefJobIdArray: string[] =
        existingAwsTaskDefs?.map((resource) => ensureValueWithError(getJobIdFromResourceTagMapping(resource))) || []

    return {
        jobs: managementAppResponse.jobs.filter((job) => {
            return (
                !toaJobIdArray.includes(job.jobId) &&
                !taskJobIdArray.includes(job.jobId) &&
                !taskDefJobIdArray.includes(job.jobId)
            )
        }),
    }
}

export const filterOrphanTaskDefinitions = (
    managementAppResponse: ManagementAppGetReadyStudiesResponse,
    taskDefinitionResources: ResourceTagMapping[],
): string[] => {
    const managementAppJobIds = managementAppResponse.jobs.map((job) => job.jobId)
    const orphanTaskDefinitions: string[] = []

    // If there are task definitions with job IDs that were not returned by
    // the BMA, they must be for orphan tasks that were already run.
    taskDefinitionResources.forEach((item) => {
        const jobId = getJobIdFromResourceTagMapping(item)
        if (jobId !== undefined && !managementAppJobIds.includes(jobId) && item.ResourceARN !== undefined) {
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

/* v8 ignore start */
export const hasReadPermissions = (
    filePath: string,
    callback: (error: Error | null, hasPermissions: boolean) => void,
): boolean => {
    let hasPermissions = false
    fs.access(filePath, fs.constants.R_OK, (error) => {
        if (error) {
            callback(error, false)
            hasPermissions = false
        } else {
            callback(null, true)
        }
    })
    return hasPermissions
}
/* v8 ignore end */

export const sanitize = (input: string): string => {
    // \w is [A-Za-z0-9_], so anything NOT in that set is a “special” char.
    // The `g` flag ensures we replace every occurrence.
    const underscored = input.replace(/[^\w]/g, '_')
    // collapse multiple underscores into a single one
    return underscored.replace(/_+/g, '_')
}
