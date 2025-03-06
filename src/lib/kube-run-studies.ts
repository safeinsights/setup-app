import { apiCall, getNamespace } from './kube'

import { managementAppGetReadyStudiesRequest, toaGetJobsRequest } from './api'
import {
    KubernetesApiResponse,
    KubernetesJob,
    KubernetesJobsResponse,
    ManagementAppGetReadyStudiesResponse,
} from './types'

function filterDeployments(
    deployments: Array<KubernetesJob>,
    runnableStudies: ManagementAppGetReadyStudiesResponse,
): KubernetesJob[] {
    console.log('Filtering Kubernetes deployments...')
    const jobIds = runnableStudies.jobs.map((job) => job.jobId)
    console.log(`Run IDs: ${JSON.stringify(jobIds, null, 4)}`)
    if (deployments != null && deployments.length > 0) {
        const researchContainerDeployments = deployments.filter(
            (deployment) =>
                deployment.metadata.labels['managed-by'] === 'setup-app' &&
                deployment.metadata.labels['component'] === 'research-container' &&
                jobIds.includes(String(deployment.metadata.labels['instance'])),
        )
        return researchContainerDeployments
    }
    return []
}

async function getJobs(runIds: ManagementAppGetReadyStudiesResponse): Promise<KubernetesJobsResponse> {
    try {
        const deployments: KubernetesApiResponse = await apiCall('batch', 'jobs', 'GET')
        console.log(JSON.stringify(deployments, null, 4))
        if (deployments['items']) {
            return { jobs: filterDeployments(deployments['items'], runIds) }
        }
    } catch (error: Error) {
        console.error(`Error getting deployments. Please check the logs for more details. Cause: ${error?.cause}`)
    }
    return { jobs: [] }
}
function createKubernetesJob(imageLocation: string, runId: string, studyTitle: string) {
    const name = `research-container-${runId}`
    studyTitle = studyTitle.toLowerCase()
    console.log(`Creating Kubernetes job: ${name}`)
    const toaEndpointWithRunId = `${process.env.TOA_BASE_URL}/api/run/${runId}`
    const deployment = {
        apiVersion: 'batch/v1',
        kind: 'Job',
        metadata: {
            name: name,
            namespace: getNamespace(),
            labels: {
                app: name,
                component: 'research-container',
                'part-of': studyTitle,
                instance: runId,
                'managed-by': 'setup-app',
            },
        },
        spec: {
            template: {
                metadata: {
                    labels: {
                        app: name,
                        component: 'research-container',
                        'part-of': studyTitle,
                        instance: runId,
                        'managed-by': 'setup-app',
                        role: 'toa-access',
                    },
                },
                spec: {
                    containers: [
                        {
                            name: name,
                            image: imageLocation,
                            ports: [],
                        },
                    ],
                    env: [
                        {
                            name: 'TRUSTED_OUTPUT_ENDPOINT',
                            value: toaEndpointWithRunId,
                        },
                    ],
                    restartPolicy: 'Never',
                    //TODO Add image Secret pulls to deloyment?
                },
            },
        },
    }
    return deployment
}

async function deployStudyContainer(runId: string, studyTitle: string, imageLocation: string) {
    const job = createKubernetesJob(imageLocation, runId, studyTitle)
    console.log(`Deploying Job ==> ${JSON.stringify(job)}`)
    try {
        const response: KubernetesApiResponse = await apiCall('batch', 'jobs', 'POST', job)
        console.log(`${JSON.stringify(response)}`)
        console.log(`Successfully deployed ${studyTitle} with run id ${runId}`)
        if (('status' in response && response['status'] === 'Failure') || !('status' in response)) {
            console.error(`Failed to deploy study container`)
        }
    } catch (error) {
        const errMsg = `API Call Error: Failed to deploy ${studyTitle} with run id ${runId}`
        console.error(errMsg, error)
        throw new Error(errMsg)
    }
}

async function runK8sStudies() {
    const bmaRunnablesResults = await managementAppGetReadyStudiesRequest()
    console.log(
        `Found ${bmaRunnablesResults.jobs.length} runs in management app. Run ids: ${bmaRunnablesResults.jobs.map((job) => job.jobId)}`,
    )
    const toaGetRunsResult = await toaGetJobsRequest()
    console.log(
        `Found ${toaGetRunsResult.jobs.length} runs with results in TOA. Run ids: ${toaGetRunsResult.jobs.map((job) => job.jobId)}`,
    )
    const kubernetesDeployments = await getJobs(bmaRunnablesResults)
    console.log(
        `Found ${kubernetesDeployments.jobs.length} deployments already deployed. Run ids: ${kubernetesDeployments.jobs.map((job) => job.spec.selector.matchLabels['instance'])}`,
    )
    bmaRunnablesResults.jobs
        .filter(
            (job) =>
                !kubernetesDeployments.jobs.some(
                    (deployment) => deployment.spec.selector.matchLabels.instance === job.jobId,
                ),
        )
        .forEach(async (job) => {
            const studyTitle = job.title
            const imageLocation = job.containerLocation
            await deployStudyContainer(job.jobId, studyTitle, imageLocation)
        })
}

export { runK8sStudies, getJobs, deployStudyContainer, filterDeployments, createKubernetesJob }
