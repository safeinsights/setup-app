import fs from 'fs'
import https from 'https'
import tls from 'tls'
import { KubernetesApiResponse, KubernetesJob } from './types'

export const DEFAULT_SERVICE_ACCOUNT_PATH = '/var/run/secrets/kubernetes.io/serviceaccount'

function k8sApiCall(group: string, path: string, method: string, body?: unknown): Promise<KubernetesApiResponse> {
    const namespace = getNamespace()
    const kubeAPIServer = process.env.K8S_APISERVER || `https://kubernetes.default.svc.cluster.local`
    const kubeAPIServerURL = `${kubeAPIServer}/apis/${group}/v1/namespaces/${namespace}/${path}`
    const kubeAPIServerAccountToken = getKubeAPIServiceAccountToken()
    initHTTPSTrustStore()
    console.log(`K8s: Making ${method} => ${kubeAPIServerURL}`)
    const url = new URL(kubeAPIServerURL)
    const options: {
        hostname: string
        port: number | undefined
        path: string
        method: string
        headers: { [key: string]: string }
    } = {
        hostname: url.hostname,
        port: url.port ? parseInt(url.port, 10) : 443,
        path: url.pathname + url.search,
        method: method.toUpperCase(),
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${kubeAPIServerAccountToken}`,
        },
    }

    if (method.toUpperCase() === 'POST' && body) {
        options.headers['Content-Length'] = Buffer.byteLength(JSON.stringify(body)).toString()
    }

    return new Promise((resolve, reject) => {
        const req = https.request(options, (response) => {
            let data = ''

            response.on('data', (chunk) => {
                data += chunk
            })

            response.on('end', () => {
                try {
                    resolve(JSON.parse(data))
                } catch (error: unknown) {
                    reject(new Error(`Failed to parse JSON: ${JSON.stringify(error)}`))
                }
            })
        })

        req.on('error', (error) => {
            console.error('K8s API => Error:', error)
            reject(error)
        })

        if (method.toUpperCase() === 'POST' && body) {
            req.write(JSON.stringify(body))
        }

        req.end()
    })
}

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
    if (!fs.existsSync(certFile)) {
        throw new Error(`Certificate file not found!`)
    }
    https.globalAgent.options.ca = [...tls.rootCertificates, fs.readFileSync(certFile, 'utf8')]
}

function createKubernetesJob(imageLocation: string, jobId: string, studyTitle: string, toaEndpointWithJobId:string) {
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
                component: 'research-container',
                'part-of': studyTitle,
                instance: jobId,
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
                        instance: jobId,
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
                            value: toaEndpointWithJobId,
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
    k8sApiCall,
    getNamespace,
    initHTTPSTrustStore,
    getKubeAPIServiceAccountToken,
    createKubernetesJob,
    filterDeployments,
}
