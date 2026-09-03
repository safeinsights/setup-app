import { ResourceTagMapping } from '@aws-sdk/client-resource-groups-tagging-api'
import fs from 'fs'
import { JOB_ID_TAG_KEY } from './aws'
import { ManagementAppGetReadyStudiesResponse } from './types'

const getJobIdFromResourceTagMapping = (resource: ResourceTagMapping): string | undefined => {
    return resource.Tags?.find((tag) => tag.Key === JOB_ID_TAG_KEY)?.Value
}

export const filterManagementAppJobs = (
    managementAppResponse: ManagementAppGetReadyStudiesResponse,
    existingAwsTasks?: ResourceTagMapping[],
    existingAwsTaskDefs?: ResourceTagMapping[],
): ManagementAppGetReadyStudiesResponse => {
    const taskJobIdArray: string[] =
        existingAwsTasks?.map((resource) => ensureValueWithError(getJobIdFromResourceTagMapping(resource))) || []
    const taskDefJobIdArray: string[] =
        existingAwsTaskDefs?.map((resource) => ensureValueWithError(getJobIdFromResourceTagMapping(resource))) || []

    return {
        jobs: managementAppResponse.jobs.filter((job) => {
            return !taskJobIdArray.includes(job.jobId) && !taskDefJobIdArray.includes(job.jobId)
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

// Derives an AWS tag value from the management app URL and member id.
// The `=` keeps it obvious that this is not a URL, so it is never used to build a request
// Remove trailing slash and invalid tag characters
export const toManagementAppTagValue = (baseUrl: string, memberId: string): string => {
    return `${baseUrl.replace(/\/+$/, '')}=${memberId}`.replace(/[^\w +=.:/@-]/g, '_')
}

// returns given value with type certainty, or errors if value is null or undefined
export const ensureValueWithError = <T>(value: T | null | undefined, message?: string): T => {
    if (value === null || value === undefined) {
        throw new Error(message || `${value} value`)
    }
    return value
}

// Connecting to a Unix socket needs write permission, not just read
export const hasReadWritePermissions = (filePath: string): boolean => {
    try {
        fs.accessSync(filePath, fs.constants.R_OK | fs.constants.W_OK)
        return true
    } catch {
        return false
    }
}

export const sanitize = (input: string): string => {
    // \w is [A-Za-z0-9_], so anything NOT in that set is a “special” char.
    // The `g` flag ensures we replace every occurrence.
    const underscored = input.replace(/[^\w]/g, '_')
    // collapse multiple underscores into a single one
    return underscored.replace(/_+/g, '_')
}
