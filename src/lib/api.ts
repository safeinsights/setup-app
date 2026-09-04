import http from 'http'
import https from 'https'
import jwt from 'jsonwebtoken'
import { LogEntry } from './aws'
import { getKubeAPIServiceAccountToken, getNamespace, initHTTPSTrustStore } from './kube'
import {
    DockerApiResponse,
    KubernetesApiError,
    KubernetesApiResponse,
    ManagementAppGetReadyStudiesResponse,
    isManagementAppGetReadyStudiesResponse,
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
    const endpoint = `${process.env.TOA_BASE_URL}/api/job/${jobId}/logs`

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

export const parseK8sResponse = (statusCode: number, data: string): KubernetesApiResponse => {
    let body: unknown = undefined
    if (data.length > 0) {
        try {
            body = JSON.parse(data)
        } catch {
            throw new Error(`Failed to parse JSON from K8s API (status ${statusCode}): ${data}`)
        }
    }

    // A rejected request answers with a Status object. Match on `kind` as well, since a Job carries
    // its own unrelated `status` field.
    const isFailureStatus =
        typeof body === 'object' &&
        body !== null &&
        (body as { kind?: unknown }).kind === 'Status' &&
        (body as { status?: unknown }).status === 'Failure'

    if (statusCode >= 400 || isFailureStatus) {
        throw new KubernetesApiError(statusCode, body)
    }

    // A 2xx with no body (a 204, for instance) is a success, not a parse failure
    return (body ?? {}) as KubernetesApiResponse
}

// Caps what a failed job can push through the TOA, the enclave's only egress. The ECS path is
// unbounded by comparison, but the research container is untrusted.
const MAX_LOG_LINES = 10_000

// Docker multiplexes stdout and stderr into a single stream when the container has no TTY, which is
// how research containers are created. Each frame is an 8 byte header — byte 0 the stream type, bytes
// 4-7 a big-endian payload length — followed by the payload.
export const demultiplexDockerLogStream = (stream: Buffer): string => {
    const payloads: string[] = []
    let offset = 0
    while (offset + 8 <= stream.length) {
        const size = stream.readUInt32BE(offset + 4)
        payloads.push(stream.subarray(offset + 8, offset + 8 + size).toString('utf8'))
        offset += 8 + size
    }
    return payloads.join('')
}

// Both the Docker and Kubernetes log endpoints prefix each line with an RFC3339Nano timestamp
export const parseTimestampedLogLines = (text: string): LogEntry[] =>
    text
        .split('\n')
        .filter((line) => line.trim().length > 0)
        .map((line) => {
            const [stamp, ...rest] = line.split(' ')
            // Date cannot parse sub-millisecond precision
            const timestamp = Date.parse(stamp.replace(/(\.\d{3})\d+/, '$1'))
            if (Number.isNaN(timestamp)) {
                return { timestamp: 0, message: line }
            }
            return { timestamp, message: rest.join(' ') }
        })

/* v8 ignore start */
type DockerRequest = {
    protocol: string
    options: {
        hostname: string
        port: number | undefined
        path: string
        method: string
        socketPath: string | undefined
        headers: { [key: string]: string }
    }
}

// Shared by dockerApiCall and dockerGetContainerLogs so both reach the daemon the same way
const buildDockerRequest = (method: string, path: string): DockerRequest => {
    const protocol = process.env.DOCKER_API_PROTOCOL ?? 'https'
    const host = process.env.DOCKER_API_HOST ?? 'localhost'
    const port = process.env.DOCKER_API_PORT ?? 443
    const apiVersion = process.env.DOCKER_API_VERSION ?? 'v1.48'
    const socketPath = process.env.DOCKER_SOCKET ?? '/var/run/docker.sock'
    path = path.startsWith('/') ? path : `/${path}`
    const url = new URL(`${protocol}://${host}:${port}/${apiVersion}${path}`)
    console.log(`Connecting to docker Engine API: ${url.toString()}`)
    const options: DockerRequest['options'] = {
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
    return { protocol, options }
}

// Reads a response body as bytes, for endpoints that do not return JSON
const readRawResponse = (transport: typeof http | typeof https, options: object): Promise<Buffer> =>
    new Promise((resolve, reject) => {
        const req = transport.request(options, (response) => {
            const chunks: Buffer[] = []
            response.on('data', (chunk) => chunks.push(chunk))
            response.on('end', () => {
                if ((response.statusCode ?? 500) >= 400) {
                    reject(new Error(`Log request failed with ${response.statusCode}`))
                    return
                }
                resolve(Buffer.concat(chunks))
            })
        })
        req.on('error', reject)
        req.end()
    })

export const dockerGetContainerLogs = async (containerId: string): Promise<LogEntry[]> => {
    const query = `stdout=1&stderr=1&timestamps=1&tail=${MAX_LOG_LINES}`
    const { protocol, options } = buildDockerRequest('GET', `containers/${containerId}/logs?${query}`)
    const stream = await readRawResponse(protocol === 'http' ? http : https, options)
    return parseTimestampedLogLines(demultiplexDockerLogStream(stream))
}

export const dockerApiCall = async (
    method: string,
    path: string,
    body?: unknown,
    ignoreResponse: boolean = false,
): Promise<DockerApiResponse> => {
    const { protocol, options } = buildDockerRequest(method, path)
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

type K8sOptions = {
    hostname: string
    port: number | undefined
    path: string
    method: string
    headers: { [key: string]: string }
}

// Shared by k8sApiCall and k8sGetPodLogs
const buildK8sRequest = (group: string | undefined, path: string, method: string): K8sOptions => {
    const namespace = getNamespace()
    const kubeAPIServer = process.env.K8S_APISERVER || `https://kubernetes.default.svc.cluster.local`
    const apiPrefix = group === undefined ? 'api' : `apis/${group}`
    const kubeAPIServerURL = `${kubeAPIServer}/${apiPrefix}/v1/namespaces/${namespace}/${path}`
    const kubeAPIServerAccountToken = getKubeAPIServiceAccountToken()
    initHTTPSTrustStore()
    console.log(`K8s: Making ${method} => ${kubeAPIServerURL}`)
    const url = new URL(kubeAPIServerURL)
    return {
        hostname: url.hostname,
        port: url.port ? parseInt(url.port, 10) : 443,
        path: url.pathname + url.search,
        method: method.toUpperCase(),
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${kubeAPIServerAccountToken}`,
        },
    }
}

export const k8sGetPodLogs = async (podName: string, containerName: string): Promise<LogEntry[]> => {
    const query = `container=${containerName}&timestamps=true&tailLines=${MAX_LOG_LINES}`
    const options = buildK8sRequest(undefined, `pods/${podName}/log?${query}`, 'GET')
    const body = await readRawResponse(https, options)
    return parseTimestampedLogLines(body.toString('utf8'))
}

export const k8sApiCall = (
    group: string | undefined,
    path: string,
    method: string,
    body?: unknown,
): Promise<KubernetesApiResponse> => {
    const options = buildK8sRequest(group, path, method)

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
                    // Fail closed if node somehow gave us no status
                    resolve(parseK8sResponse(response.statusCode ?? 500, data))
                } catch (error: unknown) {
                    reject(error)
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
