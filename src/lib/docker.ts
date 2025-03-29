import fs from 'fs'
import http from 'http'
import https from 'https'
import { DockerApiContainersResponse, DockerApiResponse } from './types'

function hasReadPermissions(
    filePath: string,
    callback: (error: Error | null, hasPermissions: boolean) => void,
): boolean {
    let hasPermissions = false
    fs.access(filePath, fs.constants.R_OK, (error) => {
        if (error) {
            callback(error, false)
            hasPermissions = false
        } else {
            callback(null, true)
        }
    })
    return hasPermissions
}
function dockerApiCall(
    method: string,
    path: string,
    body?: unknown,
    ignoreResponse: boolean = false,
): Promise<DockerApiResponse> {
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
            'X-Registry-Auth': process.env.DOCKER_REGISTRY_AUTH ?? ''
        },
    }
    console.log(`Headers: ${JSON.stringify(options.headers)}`)
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
                    console.log(`Response: ${data}`)
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

async function pullContainer(imageLocation: string):Promise<DockerApiResponse> {
    const path = `images/create?fromImage=${imageLocation}`
    try {
        console.log(`Docker => Pulling container from ${imageLocation}`)
        return await dockerApiCall('POST', path, undefined, true)
    } catch (error: unknown) {
        const errMsg = `Docker API Call Error: Failed to pull container ${imageLocation}. Cause: ${JSON.stringify(error)}`
        console.error(errMsg)
        throw new Error(errMsg)
    }
}
function createContainerObject(imageLocation: string, runId: string, studyTitle: string) {
    const name = `research-container-${runId}`
    studyTitle = studyTitle.toLowerCase()
    console.log(`Creating Docker container job: ${name}`)
    const toaEndpointWithRunId = `${process.env.TOA_BASE_URL}/api/run/${runId}`
    const container = {
        Image: imageLocation,
        Labels: {
            app: name,
            component: 'research-container',
            'part-of': studyTitle,
            instance: runId,
            'managed-by': 'setup-app',
        },
        Env: [`TRUSTED_OUTPUT_ENDPOINT=${toaEndpointWithRunId}`],
    }
    return container
}

function filterContainers(
    containers: DockerApiContainersResponse[],
    filters: { [key: string]: string | number },
    state: string,
): DockerApiContainersResponse[] {
    console.log('Filetering Docker containers...')
    if (containers != null && containers.length > 0) {
        return containers.filter(
            (container) =>
                container.State === state &&
                Object.keys(filters).every((key) => container.Labels[key] === filters[key]),
        )
    }
    return []
}

export { createContainerObject, dockerApiCall, filterContainers, pullContainer }

