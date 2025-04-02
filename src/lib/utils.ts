import { ManagementAppGetReadyStudiesResponse, TOAGetJobsResponse } from './types'
import { ResourceTagMapping } from '@aws-sdk/client-resource-groups-tagging-api'
import { JOB_ID_TAG_KEY } from './aws'
import fs from 'fs'

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

/* v8n ignore start */
export const hasReadPermissions = (
    filePath: string,
    callback: (error: Error | null, hasPermissions: boolean) => void,
): boolean => {
    let hasPermissions = false
    fs.access(filePath, fs.constants.R_OK, (error) => {
        if (error) {
            /* v8n ignore start */
            callback(error, false)
            hasPermissions = false
            /* v8 ignore end */
        } else {
            callback(null, true)
        }
    })
    return hasPermissions
}
/* v8n ignore end */
