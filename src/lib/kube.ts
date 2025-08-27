import fs from 'fs'
import https from 'https'
import tls from 'tls'
import { CONTAINER_TYPES, KubernetesJob } from './types'

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

function createKubernetesJob(imageLocation: string, jobId: string, studyTitle: string, toaEndpointWithJobId: string) {
    const name = `research-container-${jobId}`
    studyTitle = studyTitle.toLowerCase()
    console.log(`Creating Kubernetes job: ${name}`)
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
                spec: {
                    containers: [
                        {
                            name: name,
                            image: imageLocation,
                            ports: [],
                            env: [
                                {
                                    name: 'TRUSTED_OUTPUT_ENDPOINT',
                                    value: toaEndpointWithJobId,
                                },
                                {
                                    name: 'TRUSTED_OUTPUT_BASIC_AUTH',
                                    value: process.env.TOA_BASIC_AUTH,
                                },
                            ],
                        },
                    ],
                    restartPolicy: 'Never',
                    imagePullSecrets: [{ name: process.env.HARBOR_PULL_SECRET }],
                },
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

export { createKubernetesJob, filterDeployments, getKubeAPIServiceAccountToken, getNamespace, initHTTPSTrustStore }
