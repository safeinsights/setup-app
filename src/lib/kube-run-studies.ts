import { apiCall, getNamespace } from './kube'

import { managementAppGetRunnableStudiesRequest, toaGetRunsRequest } from './api'
import { KubernetesRun, KubernetesRunsResponse, ManagementAppGetRunnableStudiesResponse } from './types'

function filterDeployments(
    deployments: Array<KubernetesRun>,
    runnableStudies: ManagementAppGetRunnableStudiesResponse,
): KubernetesRun[] {
    console.log('Filtering Kubernetes deployments...')
    const runIds = runnableStudies.runs.map((run) => run.runId)
    console.log(`Run IDs: ${JSON.stringify(runIds, null, 4)}`)
    if (deployments != null && deployments.length > 0) {
        const researchContainerDeployments = deployments.filter(
            (deployment) =>
                deployment.metadata.labels['managed-by'] === 'setup-app' &&
                deployment.metadata.labels['component'] === 'research-container' &&
                runIds.includes(String(deployment.metadata.labels['instance'])),
        )
        return researchContainerDeployments
    }
    return []
}

async function getJobs(runIds: ManagementAppGetRunnableStudiesResponse): Promise<KubernetesRunsResponse> {
    try {
        const deployments = await apiCall('batch', 'jobs', 'GET')
        console.log(JSON.stringify(deployments, null, 4))
        return { runs: filterDeployments(deployments['items'], runIds) }
    } catch (error) {
        console.error('Error getting deployments', error)
    }
    return { runs: [] }
}
function createKubernetesJob(imageLocation: string, runId: string, studyTitle: string) {
    const name = `research-container-${runId}`
    studyTitle = studyTitle.toLowerCase()
    console.log(`Creating Kubernetes job: ${name} `)
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
        const response = await apiCall('batch', 'jobs', 'POST', job)
        console.log(`${JSON.stringify(response)}`)
        console.log(`Successfully deployed ${studyTitle} with run id ${runId}`)
        if ('status' in response && response['status'] === 'Failure') {
            throw new Error(`Failed to deploy study container: ${response}`)
        }
    } catch (error) {
        console.error(`Failed to deploy ${studyTitle} with run id ${runId}`, error)
    }
}

async function runK8sStudies() {
    const bmaRunnablesResults = await managementAppGetRunnableStudiesRequest()
    console.log(
        `Found ${bmaRunnablesResults.runs.length} runs in management app. Run ids: ${bmaRunnablesResults.runs.map((run) => run.runId)}`,
    )
    const toaGetRunsResult = await toaGetRunsRequest()
    console.log(
        `Found ${toaGetRunsResult.runs.length} runs with results in TOA. Run ids: ${toaGetRunsResult.runs.map((run) => run.runId)}`,
    )
    const kubernetesDeployments = await getJobs(bmaRunnablesResults)
    console.log(
        `Found ${kubernetesDeployments.runs.length} deployments already deployed. Run ids: ${kubernetesDeployments.runs.map((run) => run.spec.selector.matchLabels['instance'])}`,
    )
    bmaRunnablesResults.runs
        .filter(
            (run) =>
                !kubernetesDeployments.runs.some(
                    (deployment) => deployment.spec.selector.matchLabels.instance === run.runId,
                ),
        )
        .forEach(async (run) => {
            const studyTitle = run.title
            const imageLocation = run.containerLocation
            await deployStudyContainer(run.runId, studyTitle, imageLocation)
        })
}

export { runK8sStudies }
