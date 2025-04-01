import { toaUpdateJobStatus } from './api'
import * as docker from './docker'
import { Enclave, IEnclave } from './enclave'
import {
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
        if (!runningJobsInEnclave?.length) return bmaReadysResults || { jobs: [] }

        return {
            jobs: bmaReadysResults.jobs.filter((job) =>
                runningJobsInEnclave.map((r) => r.Labels?.instance).includes(job.jobId),
            ),
        }
    }

    async cleanup(): Promise<void> {
        console.log('Cleaning up the enclave. Removing successfully rand studies.')

        const successfulContainers = docker.filterContainers(
            await this.getAllStudiesInEnclave(),
            {
                component: 'research-container',
                'managed-by': 'setup-app',
            },
            ['completed'],
        )
        successfulContainers.forEach(async (container) => {
            console.log(`Removing Container ${container.Id}`)
            try {
                await docker.dockerApiCall('DEL', `containers/${container.Id}`)
                /* v8 ignore next 6 */
            } catch (error: unknown) {
                const err = error as Error & { cause: string }
                console.error(
                    `Error deleting container: [${container.Id}]. Please check the logs for more details. Cause: ${err['cause']}`,
                )
            }
        })
    }

    async getAllStudiesInEnclave(): Promise<DockerApiContainersResponse[]> {
        try {
            const containers: DockerApiResponse = await docker.dockerApiCall('GET', 'containers/json')
            console.log(`Pulled the following containers: ${JSON.stringify(containers)}`)
            return containers as DockerApiContainersResponse[]
        } catch (error: unknown) {
            const err = error as Error & { cause: string }
            console.error(`Error getting containers. Please check the logs for more details. Cause: ${err['cause']}`)
        }
        return []
    }
    async getRunningStudies(): Promise<DockerApiContainersResponse[]> {
        console.log('Docker => Retrieving running research containers')
        return docker.filterContainers(
            await this.getAllStudiesInEnclave(),
            {
                component: 'research-container',
                'managed-by': 'setup-app',
            },
            ['running'],
        )
    }
    async launchStudy(job: ManagementAppJob, toaEndpointWithJobId: string): Promise<void> {
        const container = await docker.createContainerObject(
            job.containerLocation,
            job.jobId,
            job.title,
            toaEndpointWithJobId,
        )
        console.log(`Deploying Container ==> ${JSON.stringify(container)}`)
        try {
            const result = await docker.pullContainer(job.containerLocation)
            console.log(`Pull result ${JSON.stringify(result)}`)
            const path = `containers/create?name=rc-${job.jobId}`
            const response: DockerApiResponse = await docker.dockerApiCall('POST', path, container)
            if ('Id' in response) {
                await docker.dockerApiCall('POST', `containers/${response.Id}/start`, undefined, true)
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

        const exitedContainers = await docker.filterContainers(
            await this.getAllStudiesInEnclave(),
            {
                component: 'research-container',
                'managed-by': 'setup-app',
            },
            ['exited'],
        )
        exitedContainers.forEach(async (container) => {
            const errorMsg = `Container ${container.Id} exited with message: ${container.Status}`
            console.log(errorMsg)
            await toaUpdateJobStatus(container.Labels?.instance.toString(), {
                status: 'JOB-ERRORED',
                message: errorMsg,
            })
        })
    }
}

export { DockerEnclave }
