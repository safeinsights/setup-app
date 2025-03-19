type ManagementAppJob = {
    jobId: string
    title: string
    containerLocation: string
}

export type ManagementAppGetReadyStudiesResponse = {
    jobs: ManagementAppJob[]
}

type TOAJob = {
    jobId: string
}

export type TOAGetJobsResponse = {
    jobs: TOAJob[]
}

export type KubernetesJob = {
    metadata: {
        name: string
        namespace: string
        labels: {
            [key: string]: string | number
        }
    }
    spec: {
        selector: {
            matchLabels: {
                [key: string]: string | number
            }
        }
    }
    status: {
        active: number
        startTime: string
    }
}

export type KubernetesJobsResponse = {
    jobs: KubernetesJob[]
}

export type KubernetesApiResponse = {
    status?: string
    items?: KubernetesJob[]
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isManagementAppJob(data: any): data is ManagementAppJob {
    return (
        typeof data === 'object' &&
        data !== null &&
        typeof data.jobId === 'string' &&
        typeof data.title === 'string' &&
        typeof data.containerLocation === 'string'
    )
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function isManagementAppGetReadyStudiesResponse(data: any): data is ManagementAppGetReadyStudiesResponse {
    return typeof data === 'object' && data !== null && Array.isArray(data.jobs) && data.jobs.every(isManagementAppJob)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isTOAJob(data: any): data is TOAJob {
    return typeof data === 'object' && data !== null && typeof data.jobId === 'string'
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function isTOAGetJobsResponse(data: any): data is TOAGetJobsResponse {
    return typeof data === 'object' && data !== null && Array.isArray(data.jobs) && data.jobs.every(isTOAJob)
}
