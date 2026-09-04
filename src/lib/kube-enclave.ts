import { k8sApiCall, k8sGetPodLogs, managementAppGetJobStatus, toaSendLogs, toaUpdateJobStatus } from './api'
import { Enclave, IEnclave } from './enclave'
import { createKubernetesJob, filterDeployments } from './kube'
import {
    CONTAINER_TYPES,
    KubernetesApiError,
    KubernetesApiJobsResponse,
    KubernetesApiResponse,
    KubernetesJob,
    KubernetesPod,
    LABELS,
    ManagementAppGetReadyStudiesResponse,
    ManagementAppJob,
} from './types'

class KubernetesEnclave extends Enclave<KubernetesJob> implements IEnclave<KubernetesJob> {
    filterJobsInEnclave(
        bmaReadysResults: ManagementAppGetReadyStudiesResponse,
        runningJobsInEnclave: KubernetesJob[],
    ): ManagementAppGetReadyStudiesResponse {
        console.log('Filtering Kubernetes jobs...')
        const jobs: ManagementAppJob[] = []
        const jobsInEnclaveIds = runningJobsInEnclave
            ?.filter(
                (job) =>
                    job.metadata?.labels?.[LABELS.MANAGED_BY] === CONTAINER_TYPES.SETUP_APP &&
                    job.metadata?.labels?.[LABELS.COMPONENT] === CONTAINER_TYPES.RESEARCH_CONTAINER,
            )
            .map((i) => i.metadata?.labels?.instance)
        console.log(`Jobs running in enclave: ${jobsInEnclaveIds}`)
        bmaReadysResults.jobs.forEach((job) => {
            console.log(`Processing job: ${job.jobId}`)
            if (!jobsInEnclaveIds.includes(job.jobId)) jobs.push(job)
        })
        console.log(`Found ${jobs.length} jobs that could be deployed!`)
        return {
            jobs: jobs,
        }
    }

    async getAllStudiesInEnclave(): Promise<KubernetesJob[]> {
        const jobs: KubernetesApiResponse = (await k8sApiCall('batch', 'jobs', 'GET')) as KubernetesApiJobsResponse
        console.log(`Pulled the following ${jobs?.items?.length} jobs.`)
        return jobs.items.flatMap((j) => j as KubernetesJob)
    }

    async getDeployedStudies(): Promise<KubernetesJob[]> {
        console.log('Kubernetes => Retrieving running research jobs')
        const jobs: KubernetesJob[] = await this.getAllStudiesInEnclave()
        return filterDeployments(jobs, {
            component: CONTAINER_TYPES.RESEARCH_CONTAINER,
            'managed-by': CONTAINER_TYPES.SETUP_APP,
        })
    }

    async launchStudy(job: ManagementAppJob, toaEndpointWithJobId: string): Promise<void> {
        const kubeJob = createKubernetesJob(job.containerLocation, job.jobId, job.title, toaEndpointWithJobId)
        console.log(`Deploying Job ==> ${JSON.stringify(kubeJob)}`)
        try {
            const response: KubernetesApiResponse = await k8sApiCall('batch', 'jobs', 'POST', kubeJob)
            console.log(`${JSON.stringify(response)}`)
            console.log(`Successfully deployed ${job.title} with run id ${job.jobId}`)
        } catch (error: unknown) {
            const errMsg = `K8s API Call Error: Failed to deploy ${job.title} with run id ${job.jobId}. Cause: ${error}`
            console.error(errMsg)
            throw new Error(errMsg, { cause: error })
        }
    }

    async deleteIfPresent(group: string | undefined, path: string): Promise<void> {
        try {
            await k8sApiCall(group, path, 'DELETE')
        } catch (error: unknown) {
            if (error instanceof KubernetesApiError && error.statusCode === 404) {
                console.log(`Nothing to delete at ${path}, it is already gone`)
                return
            }
            throw error
        }
    }

    async cleanup(): Promise<void> {
        console.log('Cleaning up the enclave!')
        const jobsInEnclave = await this.getAllStudiesInEnclave()
        const containers = ((await k8sApiCall(undefined, 'pods', 'GET')) as KubernetesApiJobsResponse).items.flatMap(
            (j) => j as KubernetesPod,
        )
        for (const job of jobsInEnclave) {
            /* v8 ignore start */
            if (
                job.metadata?.labels?.[LABELS.MANAGED_BY] === CONTAINER_TYPES.SETUP_APP &&
                job.metadata?.labels?.[LABELS.COMPONENT] === CONTAINER_TYPES.RESEARCH_CONTAINER
            ) {
                /* v8 ignore stop */
                const statuses = job.status?.conditions?.filter((c) => c.type === 'Complete' && c.status === 'True')
                if (statuses && statuses.length > 0) {
                    console.log(`Cleaning up Job ${job.metadata.labels.instance}`)
                    const jobContainers = containers.filter(
                        (c) =>
                            c.metadata?.labels?.[LABELS.MANAGED_BY] === CONTAINER_TYPES.SETUP_APP &&
                            c.metadata?.labels?.[LABELS.COMPONENT] === CONTAINER_TYPES.RESEARCH_CONTAINER &&
                            c.metadata?.labels?.[LABELS.JOB_NAME] === job.metadata.name,
                    )
                    /* v8 ignore start */
                    if (jobContainers && jobContainers.length > 0) {
                        for (const c of jobContainers) {
                            console.log(`Deleting container: ${JSON.stringify(c.metadata.name)}`)
                            await this.deleteIfPresent(undefined, `pods/${c.metadata.name}`)
                        }
                    }
                    /* v8 ignore stop */
                    await this.deleteIfPresent('batch', `jobs/${job.metadata.name}`)
                }
            }
        }
    }
    // Pod first then the owning Job, matching the order used in cleanup
    async removeFailedJob(pod: KubernetesPod): Promise<void> {
        await this.deleteIfPresent(undefined, `pods/${pod.metadata.name}`)
        const jobName = pod.metadata?.labels?.[LABELS.JOB_NAME]
        if (jobName) {
            await this.deleteIfPresent('batch', `jobs/${jobName}`)
        }
    }

    async checkForErroredJobs(): Promise<void> {
        console.log('Checking environment for errored jobs')
        try {
            const jobsInEnclaveIds = (await this.getAllStudiesInEnclave())
                ?.filter(
                    (job) =>
                        job.metadata?.labels?.[LABELS.MANAGED_BY] === CONTAINER_TYPES.SETUP_APP &&
                        job.metadata?.labels?.[LABELS.COMPONENT] === CONTAINER_TYPES.RESEARCH_CONTAINER,
                )
                .map((i) => i.metadata?.labels?.instance)
            const containers = ((await k8sApiCall(undefined, 'pods', 'GET')) as KubernetesApiJobsResponse).items
                .flatMap((j) => j as KubernetesPod)
                .filter(
                    (c) =>
                        c.metadata?.labels?.[LABELS.MANAGED_BY] === CONTAINER_TYPES.SETUP_APP &&
                        c.metadata?.labels?.[LABELS.COMPONENT] === CONTAINER_TYPES.RESEARCH_CONTAINER &&
                        jobsInEnclaveIds.includes(c.metadata?.labels?.[LABELS.INSTANCE]),
                )
            /* v8 ignore start */
            if (containers && containers.length > 0) {
                for (const c of containers) {
                    if (
                        c.status?.containerStatuses?.some(
                            (d) => 'terminated' in d.state && d.state['terminated'].exitCode !== 0,
                        )
                    ) {
                        /* v8 ignore stop */
                        const jobId = c.metadata?.labels?.instance.toString()

                        // Report once. Without this the same failure is re-sent every cycle, and the
                        // logs below are re-uploaded with it.
                        const bmaStatus = await managementAppGetJobStatus(jobId)
                        if (bmaStatus.status === 'JOB-ERRORED') {
                            console.log(`Job ${jobId} is already ${bmaStatus.status} in the BMA, removing the pod`)
                            await this.removeFailedJob(c)
                            continue
                        }

                        const errorMsg = `Container ${c.metadata.name} exited with non 0 error code`
                        console.log(errorMsg)
                        await toaUpdateJobStatus(jobId, { status: 'JOB-ERRORED', message: errorMsg })

                        // Must happen before the pod is deleted, and must not prevent deletion
                        try {
                            await toaSendLogs(
                                jobId,
                                await k8sGetPodLogs(c.metadata.name, `research-container-${jobId}`),
                            )
                        } catch (error: unknown) {
                            console.error(`Failed to send logs for job ${jobId}. Cause: ${error}`)
                        }

                        await this.removeFailedJob(c)
                    }
                }
            }
        } catch (error: unknown) {
            const errMsg = `An error occurred while cleaning up environment: ${error}`
            console.error(errMsg)
            throw new Error(errMsg, { cause: error })
        }
    }
}

export { KubernetesEnclave }
