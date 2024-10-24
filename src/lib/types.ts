type ManagementAppRun = {
    runId: string
    title: string
    containerLocation: string
}

export type ManagementAppResponse = {
    runs: ManagementAppRun[]
}

type TOARun = {
    runId: string
}

export type TOAResponse = {
    runs: TOARun[]
}
