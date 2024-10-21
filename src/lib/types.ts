type ManagementAppRun = {
    runId: string
    title: string
    containerLocation: string
}

export type ManagementAppResponse = {
    runs: ManagementAppRun[]
}
