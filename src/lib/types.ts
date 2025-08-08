export type ManagementAppJob = {
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

export type KubernetesPod = {
    metadata: {
        name: string
        namespace: string
        labels: {
            [key: string]: string | number
        }
    }
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
        template: {
            spec: {
                containers: [{ name: string }]
            }
        }
    }
    status: {
        conditions: [
            {
                type: string
                status: string
            },
        ]
    }
}

export type KubernetesApiJobsResponse = {
    status?: string
    items: KubernetesJob[] | KubernetesPod[]
}

export type KubernetesApiResponse = KubernetesApiJobsResponse | KubernetesJob | KubernetesPod

export type DockerApiResponse =
    | Error
    | DockerApiSuccessResponse
    | DockerApiContainersResponse
    | DockerApiContainersResponse[]
    | DockerApiImageResponse
    | DockerApiContainerResponse

export type DockerApiSuccessResponse = {
    Id?: string
}

export type DockerApiContainerResponse = {
    Id: string
    Image: string
    State: {
        Status: string
        Running: boolean
        Paused: boolean
        Restarting: boolean
        OOMKilled: boolean
        Dead: boolean
        Error: string
        StartedAt: string
        FinishedAt: string
        ExitCode?: number
    }
}

export type DockerApiContainersResponse = {
    Id: string
    Image: string
    Names: string[]
    ImageID: string
    Command: string
    Labels: { [key: string]: string | number }
    State: string
    Status: string
}

export type DockerApiImageResponse = {
    status: string
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
