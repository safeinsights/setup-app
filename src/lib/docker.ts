import { dockerApiCall } from './api'
import { CONTAINER_TYPES, DockerApiContainersResponse, DockerApiResponse } from './types'
import { sanitize } from './utils'

async function pullContainer(imageLocation: string): Promise<DockerApiResponse> {
    const path = `images/create?fromImage=${imageLocation}`
    try {
        console.log(`Docker => Pulling container from ${imageLocation}`)
        return await dockerApiCall('POST', path, undefined, true)
    } catch (error: unknown) {
        const errMsg = `Docker API Call Error: Failed to pull container ${imageLocation}. Cause: ${JSON.stringify(error)}`
        console.error(errMsg)
        throw new Error(errMsg, { cause: error })
    }
}

function createContainerObject(
    imageLocation: string,
    jobId: string,
    studyTitle: string,
    toaEndpointWithjobId: string,
    network?: string,
) {
    const name = `research-container-${jobId}`
    studyTitle = sanitize(studyTitle.toLowerCase())
    console.log(`Creating Docker container job: ${name}`)
    // Research container env: always the TOA endpoint, plus any setup-app env vars named in
    // RESEARCH_CONTAINER_ENV (comma-separated), the Docker-mode counterpart of the BQ_* forwarding
    // in kube.ts. Unset names are skipped so a stale list cannot inject empty values.
    const env = [`TRUSTED_OUTPUT_ENDPOINT=${toaEndpointWithjobId}`]
    const forwarded = (process.env.RESEARCH_CONTAINER_ENV ?? '')
        .split(',')
        .map((envName) => envName.trim())
        .filter(Boolean)
    for (const envName of forwarded) {
        const value = process.env[envName]
        if (value) {
            env.push(`${envName}=${value}`)
        }
    }
    const container: {
        Image: string
        Labels: { [key: string]: string }
        Env: string[]
        HostConfig?: { NetworkMode: string }
    } = {
        Image: imageLocation,
        Labels: {
            app: name,
            component: CONTAINER_TYPES.RESEARCH_CONTAINER,
            'part-of': studyTitle,
            instance: jobId,
            'managed-by': CONTAINER_TYPES.SETUP_APP,
        },
        Env: env,
    }

    if (network) {
        container.HostConfig = {
            NetworkMode: network,
        }
    }

    return container
}

function filterContainers(
    containers: DockerApiContainersResponse[],
    filters: { [key: string]: string | number },
    state: string[],
): DockerApiContainersResponse[] {
    console.log('Filtering Docker containers...')
    if (containers != null && containers.length > 0) {
        return containers.filter(
            (container) =>
                state.includes(container.State) &&
                Object.keys(filters).every((key) => container.Labels[key] === filters[key]),
        )
    }
    return []
}

export { createContainerObject, filterContainers, pullContainer }
