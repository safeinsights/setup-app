import { k8sApiCall, toaUpdateJobStatus } from './api'
import { Enclave, IEnclave } from './enclave'
import { createKubernetesJob, filterDeployments } from './kube'
import {
    CONTAINER_TYPES,
    KubernetesApiJobsResponse,
    KubernetesApiResponse,
    KubernetesJob,
    KubernetesPod,
    LABELS,
    ManagementAppGetReadyStudiesResponse,
    ManagementAppJob,
    TOAGetJobsResponse,
} from './types'

class KubernetesEnclave extends Enclave<KubernetesJob> implements IEnclave<KubernetesJob> {
    filterJobsInEnclave(
        bmaReadysResults: ManagementAppGetReadyStudiesResponse,
        toaGetJobsResult: TOAGetJobsResponse,
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
        try {
            const jobs: KubernetesApiResponse = (await k8sApiCall('batch', 'jobs', 'GET')) as KubernetesApiJobsResponse
            console.log(`Pulled the following ${jobs?.items?.length} jobs.`)
            return jobs.items.flatMap((j) => j as KubernetesJob)
        } catch (error: unknown) {
            const err = error as Error & { cause: string }
            console.error(`Error getting jobs. Please check the logs for more details. Cause: ${err['cause']}`)
        }
        return []
    }

    async getDeployedStudies(): Promise<KubernetesJob[]> {
        console.log('Kubernetes => Retrieving running research jobs')
        const jobs: KubernetesJob[] = await this.getAllStudiesInEnclave()
        return filterDeployments(jobs, {
            component: CONTAINER_TYPES.RESEARCH_CONTAINER,
            'managed-by': CONTAINER_TYPES.SETUP_APP,
            role: 'toa-access',
        })
    }

    async launchStudy(job: ManagementAppJob, toaEndpointWithJobId: string): Promise<void> {
        const kubeJob = createKubernetesJob(job.containerLocation, job.jobId, job.title, toaEndpointWithJobId)
        console.log(`Deploying Job ==> ${JSON.stringify(kubeJob)}`)
        try {
            const response: KubernetesApiResponse = await k8sApiCall('batch', 'jobs', 'POST', kubeJob)
            console.log(`${JSON.stringify(response)}`)
            console.log(`Successfully deployed ${job.title} with run id ${job.jobId}`)
            /* v8 ignore next 3 */
            if (('status' in response && response['status'] === 'Failure') || !('status' in response)) {
                console.error(`Failed to deploy study container`)
            }
        } catch (error: unknown) {
            const errMsg = `K8s API Call Error: Failed to deploy ${job.title} with run id ${job.jobId}. Cause: ${JSON.stringify(error)}`
            console.error(errMsg)
            throw new Error(errMsg)
        }
    }
    async cleanup(): Promise<void> {
        console.log('Cleaning up the enclave!')
        const jobsInEnclave = await this.getAllStudiesInEnclave()
        const containers = ((await k8sApiCall(undefined, 'pods', 'GET')) as KubernetesApiJobsResponse).items.flatMap(
            (j) => j as KubernetesPod,
        )
        for (const job of jobsInEnclave) {
            if (
                job.metadata?.labels?.[LABELS.MANAGED_BY] === CONTAINER_TYPES.SETUP_APP &&
                job.metadata?.labels?.[LABELS.COMPONENT] === CONTAINER_TYPES.RESEARCH_CONTAINER
            ) {
                const statuses = job.status?.conditions?.filter((c) => c.type === 'Complete' && c.status === 'True')
                if (statuses && statuses.length > 0) {
                    console.log(`Cleaning up Job ${job.metadata.labels.instance}`)
                    const jobContainers = containers.filter(
                        (c) =>
                            c.metadata?.labels?.[LABELS.MANAGED_BY] === CONTAINER_TYPES.SETUP_APP &&
                            c.metadata?.labels?.[LABELS.COMPONENT] === CONTAINER_TYPES.RESEARCH_CONTAINER &&
                            c.metadata?.labels?.[LABELS.JOB_NAME] === job.metadata.name,
                    )
                    /* v8 ignore next 6 */
                    if (jobContainers && jobContainers.length > 0) {
                        for (const c of jobContainers) {
                            console.log(`Deleting container: ${JSON.stringify(c.metadata.name)}`)
                            await k8sApiCall(undefined, `pods/${c.metadata.name}`, 'DELETE')
                        }
                    }
                    await k8sApiCall('batch', `jobs/${job.metadata.name}`, `DELETE`)
                }
            }
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
            if (containers && containers.length > 0) {
                for (const c of containers) {
                    if (
                        c.status?.containerStatuses?.some(
                            (d) => 'terminated' in d.state && d.state['terminated'].exitCode !== 0,
                        )
                    ) {
                        const errorMsg = `Container ${c.metadata.name} exited with non 0 error code`
                        console.log(errorMsg)
                        await toaUpdateJobStatus(c.metadata?.labels?.instance.toString(), {
                            status: 'JOB-ERRORED',
                            message: errorMsg,
                        })
                    }
                }
            }
        } catch (error: unknown) {
            const errMsg = `An error occurred while cleaning up environment: ${error}`
            console.error(errMsg)
            throw new Error(errMsg)
        }
    }
}

export { KubernetesEnclave }
