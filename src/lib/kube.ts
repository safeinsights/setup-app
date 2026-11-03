import fs from 'fs'
import https from 'https'
import tls from 'tls'
import { CONTAINER_TYPES, KubernetesJob } from './types'
import { sanitize } from './utils'

export const DEFAULT_SERVICE_ACCOUNT_PATH = '/var/run/secrets/kubernetes.io/serviceaccount'

function getNamespace(): string {
    const namespaceFile = `${process.env.K8S_SERVICEACCOUNT_PATH ?? DEFAULT_SERVICE_ACCOUNT_PATH}/namespace`
    if (!fs.existsSync(namespaceFile)) {
        throw new Error(`Namespace file not found!`)
    }
    return fs.readFileSync(namespaceFile, 'utf8').trim()
}

function getKubeAPIServiceAccountToken(): string {
    const tokenFile = `${process.env.K8S_SERVICEACCOUNT_PATH ?? DEFAULT_SERVICE_ACCOUNT_PATH}/token`
    if (!fs.existsSync(tokenFile)) {
        throw new Error(`Token file not found!`)
    }
    return fs.readFileSync(tokenFile, 'utf8').trim()
}

function initHTTPSTrustStore(): void {
    const certFile = `${process.env.K8S_SERVICEACCOUNT_PATH ?? DEFAULT_SERVICE_ACCOUNT_PATH}/ca.crt`
    console.log(`SA: Initializing the K8s truststore`)
    /* v8 ignore start */
    if (!fs.existsSync(certFile)) {
        throw new Error(`Certificate file not found!`)
    }
    https.globalAgent.options.ca = [...tls.rootCertificates, fs.readFileSync(certFile, 'utf8')]
    /* v8 ignore end */
}

type ResearchJobConfig = {
    resources?: Record<string, unknown>
    activeDeadlineSeconds?: number
}

// Optional research Job sizing from RESEARCH_CONTAINER_RESOURCES (JSON of a Kubernetes container
// `resources` block) and RESEARCH_CONTAINER_TIMEOUT_SECONDS. Throws on malformed values; poll.ts calls
// this at startup so a bad config fails the deploy instead of every study.
function getResearchJobConfig(): ResearchJobConfig {
    const config: ResearchJobConfig = {}

    const resources = process.env.RESEARCH_CONTAINER_RESOURCES
    if (resources) {
        let parsed: unknown
        try {
            parsed = JSON.parse(resources)
        } catch {
            throw new Error('RESEARCH_CONTAINER_RESOURCES is not valid JSON')
        }
        if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
            throw new Error('RESEARCH_CONTAINER_RESOURCES must be a JSON object')
        }
        config.resources = parsed as Record<string, unknown>
    }

    const timeout = process.env.RESEARCH_CONTAINER_TIMEOUT_SECONDS
    if (timeout) {
        if (!/^[1-9]\d*$/.test(timeout)) {
            throw new Error('RESEARCH_CONTAINER_TIMEOUT_SECONDS must be a positive integer')
        }
        config.activeDeadlineSeconds = parseInt(timeout)
    }

    return config
}

function createKubernetesJob(imageLocation: string, jobId: string, studyTitle: string, toaEndpointWithJobId: string) {
    const name = `research-container-${jobId}`
    studyTitle = sanitize(studyTitle.toLowerCase())
    console.log(`Creating Kubernetes job: ${name}`)

    // Research container env: always the TOA endpoint, plus BigQuery config (GCP / Workload
    // Identity) when setup-app was given it. Unset vars are omitted so non-GCP deployments
    // produce an identical Job spec.
    const containerEnv: Array<{ name: string; value: string }> = [
        { name: 'TRUSTED_OUTPUT_ENDPOINT', value: toaEndpointWithJobId },
    ]
    for (const envName of ['BQ_PROJECT', 'BQ_DATASET', 'BQ_TABLE', 'BQ_BILLING_PROJECT']) {
        const value = process.env[envName]
        if (value) {
            containerEnv.push({ name: envName, value })
        }
    }

    const { resources, activeDeadlineSeconds } = getResearchJobConfig()

    const podSpec: Record<string, unknown> = {
        containers: [
            {
                name: name,
                image: imageLocation,
                ports: [],
                env: containerEnv,
                ...(resources && { resources }),
            },
        ],
        restartPolicy: 'Never',
        imagePullSecrets: [{ name: process.env.HARBOR_PULL_SECRET }],
    }

    // GCP: run research Jobs under the dedicated, Workload-Identity-bound ServiceAccount so
    // (and only so) the research container can read BigQuery. Omitted when unset (AWS path).
    if (process.env.RESEARCH_SERVICE_ACCOUNT) {
        podSpec.serviceAccountName = process.env.RESEARCH_SERVICE_ACCOUNT
    }

    // Pod-level, not Job-level: a Job deadline deletes the pod, so checkForErroredJobs would
    // never see the failure. A pod deadline leaves a Failed pod (exit 137) that it reports.
    if (activeDeadlineSeconds) {
        podSpec.activeDeadlineSeconds = activeDeadlineSeconds
    }

    const deployment = {
        apiVersion: 'batch/v1',
        kind: 'Job',
        metadata: {
            name: name,
            namespace: getNamespace(),
            labels: {
                app: name,
                component: CONTAINER_TYPES.RESEARCH_CONTAINER,
                'part-of': studyTitle,
                instance: jobId,
                'managed-by': CONTAINER_TYPES.SETUP_APP,
            },
        },
        spec: {
            // setup-app reports the first failed pod as JOB-ERRORED and deletes the Job, so
            // retries would only race that. Evictions (e.g. node upgrades) still get a new pod.
            backoffLimit: 0,
            podFailurePolicy: {
                rules: [{ action: 'Ignore', onPodConditions: [{ type: 'DisruptionTarget' }] }],
            },
            template: {
                metadata: {
                    labels: {
                        app: name,
                        component: CONTAINER_TYPES.RESEARCH_CONTAINER,
                        'part-of': studyTitle,
                        instance: jobId,
                        'managed-by': CONTAINER_TYPES.SETUP_APP,
                        role: 'toa-access',
                    },
                },
                spec: podSpec,
            },
        },
    }
    return deployment
}

function filterDeployments(
    deployments: Array<KubernetesJob>,
    filters: { [key: string]: string | number },
): KubernetesJob[] {
    console.log('Filtering Kubernetes deployments...')
    if (deployments != null && deployments.length > 0) {
        return deployments.filter((deployment) =>
            Object.keys(filters).every((key) => deployment.metadata.labels[key] === filters[key]),
        )
    }
    return []
}

export {
    createKubernetesJob,
    filterDeployments,
    getKubeAPIServiceAccountToken,
    getNamespace,
    getResearchJobConfig,
    initHTTPSTrustStore,
}
