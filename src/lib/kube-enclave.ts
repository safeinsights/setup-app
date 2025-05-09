import { k8sApiCall } from './api'
import { Enclave, IEnclave } from './enclave'
import { createKubernetesJob, filterDeployments } from './kube'
import {
    KubernetesApiJobsResponse,
    KubernetesApiResponse,
    KubernetesJob,
    ManagementAppGetReadyStudiesResponse,
    ManagementAppJob,
    TOAGetJobsResponse,
} from './types'

class KubernetesEnclave extends Enclave<KubernetesApiJobsResponse> implements IEnclave<KubernetesApiJobsResponse> {
    filterJobsInEnclave(
        bmaReadysResults: ManagementAppGetReadyStudiesResponse,
        toaGetJobsResult: TOAGetJobsResponse,
        runningJobsInEnclave: KubernetesApiJobsResponse[],
    ): ManagementAppGetReadyStudiesResponse {
        console.log('Filtering Kubernetes jobs...')
        /* v8 ignore next */
        if (!runningJobsInEnclave?.length) return bmaReadysResults || { jobs: [] }
        return {
            jobs: bmaReadysResults.jobs.filter((job) =>
                runningJobsInEnclave
                    .flatMap((j) => j.items?.map((i) => i.metadata?.labels?.instance))
                    .includes(job.jobId),
            ),
        }
    }

    async getAllStudiesInEnclave(): Promise<KubernetesApiJobsResponse[]> {
        try {
            const jobs: KubernetesApiResponse = (await k8sApiCall('batch', 'jobs', 'GET')) as KubernetesApiJobsResponse
            console.log(`Pulled the following jobs: ${JSON.stringify(jobs, null, 4)}`)
            return [jobs]
        } catch (error: unknown) {
            const err = error as Error & { cause: string }
            console.error(`Error getting jobs. Please check the logs for more details. Cause: ${err['cause']}`)
        }
        return []
    }

    async getRunningStudies(): Promise<KubernetesApiJobsResponse[]> {
        console.log('Kubernetes => Retrieving running research jobs')
        const jobs: KubernetesJob[] = (await this.getAllStudiesInEnclave()).flatMap((s) => s?.items)
        return [
            {
                items: filterDeployments(jobs, {
                    component: 'research-container',
                    'managed-by': 'setup-app',
                    role: 'toa-access',
                }),
                //TODO Pass state of the job to the filter
            },
        ]
    }

    async launchStudy(job: ManagementAppJob, toaEndpointWithJobId: string): Promise<void> {
        const kubeJob = createKubernetesJob(job.containerLocation, job.jobId, job.title, toaEndpointWithJobId)
        console.log(`Deploying Job ==> ${JSON.stringify(kubeJob)}`)
        try {
            const response: KubernetesApiResponse = await k8sApiCall('batch', 'jobs', 'POST', kubeJob)
            console.log(`${JSON.stringify(response)}`)
            console.log(`Successfully deployed ${job.title} with run id ${job.jobId}`)
            /* v8 ignore next 3*/
            if (('status' in response && response['status'] === 'Failure') || !('status' in response)) {
                console.error(`Failed to deploy study container`)
            }
        } catch (error: unknown) {
            const errMsg = `K8s API Call Error: Failed to deploy ${job.title} with run id ${job.jobId}. Cause: ${JSON.stringify(error)}`
            console.error(errMsg)
            throw new Error(errMsg)
        }
    }
}

export { KubernetesEnclave }
