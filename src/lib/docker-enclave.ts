import { dockerApiCall, toaUpdateJobStatus } from './api'
import { createContainerObject, filterContainers, pullContainer } from './docker'
import { Enclave, IEnclave } from './enclave'
import {
    CONTAINER_TYPES,
    DockerApiContainerResponse,
    DockerApiContainersResponse,
    DockerApiResponse,
    ManagementAppGetReadyStudiesResponse,
    ManagementAppJob,
    TOAGetJobsResponse,
} from './types'

class DockerEnclave extends Enclave<DockerApiContainersResponse> implements IEnclave<DockerApiContainersResponse> {
    filterJobsInEnclave(
        bmaReadysResults: ManagementAppGetReadyStudiesResponse,
        toaGetJobsResult: TOAGetJobsResponse,
        runningJobsInEnclave: DockerApiContainersResponse[],
    ): ManagementAppGetReadyStudiesResponse {
        console.log('Filtering Docker jobs')
        /* v8 ignore next */
        if (!runningJobsInEnclave?.length) return { jobs: bmaReadysResults.jobs }
        const jobs: ManagementAppJob[] = bmaReadysResults.jobs.filter((job) =>
            runningJobsInEnclave.map((r) => r.Labels?.instance !== job.jobId),
        )
        console.log(`Found ${jobs.length} jobs that could be deployed!`)
        return {
            jobs: jobs,
        }
    }

    async cleanup(): Promise<void> {
        console.log('Cleaning up the enclave. Removing successfully ran studies.')
        const successfulContainers = filterContainers(
            await this.getAllStudiesInEnclave(),
            {
                component: CONTAINER_TYPES.RESEARCH_CONTAINER,
                'managed-by': CONTAINER_TYPES.SETUP_APP,
            },
            ['exited'],
        )
        successfulContainers.forEach(async (container) => {
            const containerExitResult = (await dockerApiCall(
                'GET',
                `containers/${container.Id}/json`,
            )) as DockerApiContainerResponse
            if (containerExitResult?.State?.ExitCode === 0) {
                await this.removeContainer(container.Id)
                /* v8 ignore next 5 */
            } else {
                console.log(
                    `Container ${container.Id} did not exit successfully. Please check the logs for more details. Will be cleaned up during the error jobs fetch.`,
                )
            }
        })
    }

    async removeContainer(id: string): Promise<void> {
        console.log(`Removing Container ${id}`)
        try {
            await dockerApiCall('DELETE', `containers/${id}`)
            /* v8 ignore next 6 */
        } catch (error: unknown) {
            const err = error as Error & { cause: string }
            console.error(
                `Error deleting container: [${id}]. Please check the logs for more details. Cause: ${JSON.stringify(err)}`,
            )
        }
    }

    async getAllStudiesInEnclave(): Promise<DockerApiContainersResponse[]> {
        try {
            const containers: DockerApiResponse = await dockerApiCall('GET', 'containers/json?all=true')
            return containers as DockerApiContainersResponse[]
        } catch (error: unknown) {
            const err = error as Error & { cause: string }
            console.error(`Error getting containers. Please check the logs for more details. Cause: ${err['cause']}`)
        }
        return []
    }
    async getDeployedStudies(): Promise<DockerApiContainersResponse[]> {
        console.log('Docker => Retrieving running research containers')
        const containers = filterContainers(
            await this.getAllStudiesInEnclave(),
            {
                component: CONTAINER_TYPES.RESEARCH_CONTAINER,
                'managed-by': CONTAINER_TYPES.SETUP_APP,
            },
            ['running', 'created', 'restarting', 'removing', 'paused', 'exited', 'dead'],
        )
        console.log(`Found ${containers.length} containers deployed!`)
        return containers
    }
    async launchStudy(job: ManagementAppJob, toaEndpointWithJobId: string): Promise<void> {
        const container = createContainerObject(job.containerLocation, job.jobId, job.title, toaEndpointWithJobId)
        console.log(`Deploying Container ==> ${JSON.stringify(container)}`)
        try {
            const result = await pullContainer(job.containerLocation)
            console.log(`Pull result ${JSON.stringify(result)}`)
            const path = `containers/create?name=rc-${job.jobId}`
            const response: DockerApiResponse = await dockerApiCall('POST', path, container)
            if ('Id' in response) {
                await dockerApiCall('POST', `containers/${response.Id}/start`, undefined, true)
            }
            console.log(`Successfully deployed ${job.title} with run id ${job.jobId}`)
        } catch (error: unknown) {
            const errMsg = `Docker API Call Error: Failed to deploy ${job.title} with run id ${job.jobId}. Cause: ${JSON.stringify(error)}`
            console.error(errMsg)
            throw new Error(errMsg)
        }
    }

    async checkForErroredJobs(): Promise<void> {
        console.log('Polling for jobs that errored!')

        const exitedContainers = filterContainers(
            await this.getAllStudiesInEnclave(),
            {
                component: CONTAINER_TYPES.RESEARCH_CONTAINER,
                'managed-by': CONTAINER_TYPES.SETUP_APP,
            },
            ['exited'],
        )
        exitedContainers.forEach(async (container) => {
            const containerExitResult: DockerApiContainerResponse = (await dockerApiCall(
                'GET',
                `containers/${container.Id}/json`,
            )) as DockerApiContainerResponse
            if (containerExitResult?.State?.ExitCode !== 0) {
                const errorMsg = `Container ${container.Id} exited with message: ${containerExitResult.State.Error}`
                console.log(errorMsg)
                await toaUpdateJobStatus(container.Labels?.instance.toString(), {
                    status: 'JOB-ERRORED',
                    message: errorMsg,
                })
            }
        })
    }
}

export { DockerEnclave }
