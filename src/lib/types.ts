type ManagementAppRun = {
    runId: string
    title: string
    containerLocation: string
}

export type ManagementAppGetRunnableStudiesResponse = {
    runs: ManagementAppRun[]
}

type TOARun = {
    runId: string
}

export type TOAGetRunsResponse = {
    runs: TOARun[]
}

export type KubernetesRun = {
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

export type KubernetesRunsResponse = {
    runs: KubernetesRun[]
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isManagementAppRun(data: any): data is ManagementAppRun {
    return (
        typeof data === 'object' &&
        data !== null &&
        typeof data.runId === 'string' &&
        typeof data.title === 'string' &&
        typeof data.containerLocation === 'string'
    )
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function isManagementAppGetRunnableStudiesResponse(data: any): data is ManagementAppGetRunnableStudiesResponse {
    return typeof data === 'object' && data !== null && Array.isArray(data.runs) && data.runs.every(isManagementAppRun)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isTOARun(data: any): data is TOARun {
    return typeof data === 'object' && data !== null && typeof data.runId === 'string'
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function isTOAGetRunsResponse(data: any): data is TOAGetRunsResponse {
    return typeof data === 'object' && data !== null && Array.isArray(data.runs) && data.runs.every(isTOARun)
}
