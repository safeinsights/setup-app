import { dockerApiCall } from './api'
import { DockerApiContainersResponse, DockerApiResponse } from './types'
import { hasReadPermissions } from './utils'

async function pullContainer(imageLocation: string): Promise<DockerApiResponse> {
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

function createContainerObject(imageLocation: string, jobId: string, studyTitle: string, toaEndpointWithjobId: string) {
    const name = `research-container-${jobId}`
    studyTitle = studyTitle.toLowerCase()
    console.log(`Creating Docker container job: ${name}`)
    const container = {
        Image: imageLocation,
        Labels: {
            app: name,
            component: 'research-container',
            'part-of': studyTitle,
            instance: jobId,
            'managed-by': 'setup-app',
        },
        Env: [
            `TRUSTED_OUTPUT_ENDPOINT=${toaEndpointWithjobId}`,
            `TRUSTED_OUTPUT_BASIC_AUTH=${process.env.TOA_BASIC_AUTH}`,
        ],
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

export { createContainerObject, filterContainers, hasReadPermissions, pullContainer }
