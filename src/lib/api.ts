import http from 'http'
import https from 'https'
import jwt from 'jsonwebtoken'
import { LogEntry } from './aws'
import { getKubeAPIServiceAccountToken, getNamespace, initHTTPSTrustStore } from './kube'
import {
    DockerApiResponse,
    KubernetesApiResponse,
    ManagementAppGetReadyStudiesResponse,
    TOAGetJobsResponse,
    isManagementAppGetReadyStudiesResponse,
    isTOAGetJobsResponse,
} from './types'
import { hasReadPermissions } from './utils'

// Functions for interacting with the Management App
const generateManagementAppToken = (): string => {
    const privateKey: string | undefined = process.env.MANAGEMENT_APP_PRIVATE_KEY
    const memberId = process.env.MANAGEMENT_APP_MEMBER_ID

    let token = ''
    /* v8 ignore start */
    if (privateKey && memberId) {
        /* v8 ignore stop */
        token = jwt.sign({ iss: memberId }, privateKey, { algorithm: 'RS256', expiresIn: 60 })
    }
    if (token.length === 0) {
        throw new Error('Managment App token failed to generate')
    }
    return token
}

export const managementAppGetReadyStudiesRequest = async (): Promise<ManagementAppGetReadyStudiesResponse> => {
    const endpoint = process.env.MANAGEMENT_APP_BASE_URL + '/api/studies/ready'
    const token = generateManagementAppToken()
    console.log(`BMA: Fetching ready studies from ${endpoint}`)
    const response = await fetch(endpoint, {
        method: 'GET',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
        },
    })

    if (!response.ok) {
        throw new Error(`Received an unexpected ${response.status} from management app: ${await response.text()}`)
    }

    const data = await response.json()
    if (!isManagementAppGetReadyStudiesResponse(data)) {
        throw new Error('Management app response does not match expected structure')
    }
    console.log('BMA: Data received!')

    return data
}

export const managementAppGetJobStatus = async (jobId: string): Promise<{ status: string }> => {
    console.log(`BMA: Fetching job status for jobId ${jobId} ...`)
    const endpoint = `${process.env.MANAGEMENT_APP_BASE_URL}/api/job/${jobId}/status`
    const token = generateManagementAppToken()
    const response = await fetch(endpoint, {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
        },
    })

    if (!response.ok) {
        throw new Error(`Received an unexpected ${response.status} from management app`)
    }
    console.log(`BMA: Job status for jobId ${jobId} received!`)

    return await response.json()
}

export const toaGetJobsRequest = async (): Promise<TOAGetJobsResponse> => {
    const endpoint = process.env.TOA_BASE_URL + '/api/jobs'

    console.log(`TOA: Fetching jobs from ${endpoint} ...`)
    const response = await fetch(endpoint, {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
        },
    })

    if (!response.ok) {
        throw new Error(`Received an unexpected ${response.status} from trusted output app: ${await response.text()}`)
    }

    const data = await response.json()
    if (!isTOAGetJobsResponse(data)) {
        throw new Error('Trusted output app response does not match expected structure')
    }
    console.log('TOA: Data received!')

    return data
}

export const toaUpdateJobStatus = async (
    jobId: string,
    data: { status: 'JOB-PROVISIONING' } | { status: 'JOB-ERRORED'; message?: string },
): Promise<{ success: boolean }> => {
    const endpoint = `${process.env.TOA_BASE_URL}/api/job/${jobId}`

    console.log(`TOA: Updating job ${jobId} status with ${JSON.stringify(data)} ...`)
    const response = await fetch(endpoint, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
    })

    if (!response.ok) {
        console.log(`TOA: Status update for job ${jobId} FAILED!: ${await response.text()}`)
        return { success: false }
    }

    console.log(`TOA: Status update for job ${jobId} succeeded!`)
    return { success: true }
}

export const toaSendLogs = async (jobId: string, logs: LogEntry[]) => {
    const endpoint = `${process.env.TOA_BASE_URL}/api/job/${jobId}/upload`

    const logForm = new FormData()
    logForm.append('logs', JSON.stringify(logs))

    console.log(`TOA: Sending logs for job ${jobId} ...`)
    const response = await fetch(endpoint, {
        method: 'POST',
        body: logForm,
    })

    if (!response.ok) {
        console.log(`TOA: Sending logs for job ${jobId} FAILED!: ${await response.text()}`)
        return { success: false }
    }

    console.log(`TOA: Sending logs for job ${jobId} succeeded!`)
    return { success: true }
}

/* v8 ignore start */
export const dockerApiCall = async (
    method: string,
    path: string,
    body?: unknown,
    ignoreResponse: boolean = false,
): Promise<DockerApiResponse> => {
    const protocol = process.env.DOCKER_API_PROTOCOL ?? 'https'
    const host = process.env.DOCKER_API_HOST ?? 'localhost'
    const port = process.env.DOCKER_API_PORT ?? 443
    const apiVersion = process.env.DOCKER_API_VERSION ?? 'v1.48'
    const socketPath = process.env.DOCKER_SOCKET ?? '/var/run/docker.sock'
    path = path.startsWith('/') ? path : `/${path}`
    const url = new URL(`${protocol}://${host}:${port}/${apiVersion}${path}`)
    console.log(`Connecting to docker Engine API: ${url.toString()}`)
    const options: {
        hostname: string
        port: number | undefined
        path: string
        method: string
        socketPath: string | undefined
        headers: { [key: string]: string }
    } = {
        hostname: url.hostname,
        port: url.port ? parseInt(url.port, 10) : 443,
        path: url.pathname + url.search,
        method: method.toUpperCase(),
        socketPath: undefined,
        headers: {
            'Content-Type': 'application/json',
            'X-Registry-Auth': process.env.DOCKER_REGISTRY_AUTH ?? '',
        },
    }
    let msg: string = ''
    const canReadDockerSock = hasReadPermissions(socketPath, (error: Error | null) => {
        if (error) {
            msg = `Error Accessing file ${socketPath}. Cause: ${JSON.stringify(error)}`
        } else {
            msg = `The Docker socket was found with sufficient permissions at: ${socketPath}`
        }
    })
    if (canReadDockerSock) {
        options.socketPath = socketPath
    }
    console.log(`${msg}`)
    if (method.toUpperCase() === 'POST' && body) {
        console.log(`Sending POST request to Docker API with body: ${JSON.stringify(body)}`)
        options.headers['Content-Length'] = Buffer.byteLength(JSON.stringify(body)).toString()
    }
    return new Promise((resolve, reject) => {
        const req = (protocol === 'http' ? http : https).request(options, (response) => {
            let data = ''

            response.on('data', (chunk) => {
                data += chunk
            })

            response.on('end', () => {
                try {
                    if (data && !ignoreResponse) {
                        const result: DockerApiResponse = JSON.parse(data)
                        if ('message' in result) reject(result)
                        else resolve(result)
                    }
                    resolve({})
                } catch (error: unknown) {
                    reject(new Error(`Failed to parse JSON: ${JSON.stringify(error)}`))
                }
            })
        })

        req.on('error', (error) => {
            console.error('Docker API => Error:', error)
            reject(error)
        })

        if (method.toUpperCase() === 'POST' && body) {
            req.write(JSON.stringify(body))
        }

        req.end()
    })
}

export const k8sApiCall = (
    group: string | undefined,
    path: string,
    method: string,
    body?: unknown,
): Promise<KubernetesApiResponse> => {
    const namespace = getNamespace()
    const kubeAPIServer = process.env.K8S_APISERVER || `https://kubernetes.default.svc.cluster.local`
    const apiPrefix = group === undefined ? 'api' : `apis/${group}`
    const kubeAPIServerURL = `${kubeAPIServer}/${apiPrefix}/v1/namespaces/${namespace}/${path}`
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
/* v8 ignore stop */
