import { vi, describe, it, expect } from 'vitest'
import { DockerEnclave } from './docker-enclave'
import { ManagementAppGetReadyStudiesResponse, TOAGetJobsResponse, DockerApiContainersResponse } from './types'
import * as docker from './docker'
import * as api from './api'

vi.mock('./docker')
vi.mock('./api')

describe('DockerEnclave', () => {
    it('filterJobsInEnclave should return jobs that are in the enclave', () => {
        const bmaReadysResults: ManagementAppGetReadyStudiesResponse = {
            jobs: [
                {
                    jobId: '1234567890',
                    title: 'Test Job 1',
                    containerLocation: 'test/container-1',
                },
                {
                    jobId: '0987654321',
                    title: 'Test Job 2',
                    containerLocation: 'test/container-2',
                },
            ],
        }

        const toaGetJobsResult: TOAGetJobsResponse = {
            jobs: [
                {
                    jobId: '1234567890',
                },
                {
                    jobId: '0987654321',
                },
            ],
        }

        const runningJobsInEnclave: DockerApiContainersResponse[] = [
            {
                Id: '1234567890',
                Images: 'test',
                Names: ['research-container-1234567890'],
                ImageID: 'sha256:1234567890',
                Command: 'test/container-1',
                Labels: {
                    instance: '1234567890',
                    component: 'research-container',
                    'managed-by': 'setup-app',
                },
                State: 'running',
                Status: 'running',
            },
            {
                Id: '0987654321',
                Images: 'test',
                Names: ['research-container-0987654321'],
                ImageID: 'sha256:0987654321',
                Command: 'test/container-2',
                Labels: {
                    instance: '0987654321',
                    component: 'research-container',
                    'managed-by': 'setup-app',
                },
                State: 'running',
                Status: 'running',
            },
        ]

        const dockerEnclave = new DockerEnclave()
        const filteredJobs = dockerEnclave.filterJobsInEnclave(bmaReadysResults, toaGetJobsResult, runningJobsInEnclave)

        expect(filteredJobs).toEqual({
            jobs: [
                {
                    jobId: '1234567890',
                    title: 'Test Job 1',
                    containerLocation: 'test/container-1',
                },
                {
                    jobId: '0987654321',
                    title: 'Test Job 2',
                    containerLocation: 'test/container-2',
                },
            ],
        })
    })

    it('cleanup: should remove successfully ran studies', async () => {
        const enclave = new DockerEnclave()

        const jobs: DockerApiContainersResponse[] = [
            {
                Id: '1234567890',
                Images: 'test',
                Names: ['research-container-1234567890'],
                ImageID: 'sha256:1234567890',
                Command: 'test/container-1',
                Labels: {
                    instance: '1234567890',
                    component: 'research-container',
                    'managed-by': 'setup-app',
                },
                State: 'completed',
                Status: 'completed',
            },
            {
                Id: '0987654321',
                Images: 'test',
                Names: ['research-container-0987654321'],
                ImageID: 'sha256:0987654321',
                Command: 'test/container-2',
                Labels: {
                    instance: '0987654321',
                    component: 'research-container',
                    'managed-by': 'setup-app',
                },
                State: 'completed',
                Status: 'completed',
            },
        ]
        const dockerApiCall = vi.mocked(api.dockerApiCall).mockResolvedValue({ Id: '' })
        vi.spyOn(enclave, 'getAllStudiesInEnclave').mockResolvedValue(jobs)
        vi.mocked(docker.filterContainers).mockReturnValue(jobs)
        await enclave.cleanup()
        expect(dockerApiCall).toHaveBeenCalledTimes(2)
        expect(dockerApiCall).toHaveBeenCalledWith('DEL', 'containers/1234567890')
        expect(dockerApiCall).toHaveBeenCalledWith('DEL', 'containers/0987654321')
    })

    it('getAllStudiesInEnclave: should return an empty array if there are no containers', async () => {
        const dockerApiCall = vi.mocked(api.dockerApiCall).mockResolvedValue([])
        const enclave = new DockerEnclave()
        const containers = await enclave.getAllStudiesInEnclave()

        expect(containers).toEqual([])
        expect(dockerApiCall).toHaveBeenCalledWith('GET', 'containers/json')
    })

    it('getAllStudiesInEnclave: Return empty when the api call throws an error', async () => {
        const dockerApiCall = vi.mocked(api.dockerApiCall).mockRejectedValue(new Error('Error'))
        const enclave = new DockerEnclave()
        const containers = await enclave.getAllStudiesInEnclave()
        expect(containers).toEqual([])
        expect(dockerApiCall).toHaveBeenCalledWith('GET', 'containers/json')
    })

    it('getAllStudiesInEnclave: should return a list of containers if they exist', async () => {
        const jobs: DockerApiContainersResponse[] = [
            {
                Id: '1234567890',
                Images: 'test',
                Names: ['research-container-1234567890'],
                ImageID: 'sha256:1234567890',
                Command: 'test/container-1',
                Labels: {
                    instance: '1234567890',
                    component: 'research-container',
                    'managed-by': 'setup-app',
                },
                State: 'completed',
                Status: 'completed',
            },
            {
                Id: '0987654321',
                Images: 'test',
                Names: ['research-container-0987654321'],
                ImageID: 'sha256:0987654321',
                Command: 'test/container-2',
                Labels: {
                    instance: '0987654321',
                    component: 'research-container',
                    'managed-by': 'setup-app',
                },
                State: 'completed',
                Status: 'completed',
            },
        ]
        const dockerApiCall = vi.mocked(api.dockerApiCall).mockResolvedValue(jobs)

        const enclave = new DockerEnclave()
        const result = await enclave.getAllStudiesInEnclave()

        expect(result).toEqual(jobs)
        expect(dockerApiCall).toHaveBeenCalledWith('GET', 'containers/json')
    })

    it('getRunningStudies: should return an empty array if there are no containers', async () => {
        const enclave = new DockerEnclave()
        const filterContainers = vi.mocked(docker.filterContainers).mockResolvedValue([])
        const getAllStudiesInEnclave = vi.spyOn(enclave, 'getAllStudiesInEnclave').mockResolvedValue([])
        const containers = await enclave.getRunningStudies()

        expect(containers).toEqual([])
        expect(getAllStudiesInEnclave).toHaveBeenCalledOnce()
        expect(filterContainers).toHaveBeenCalledWith(
            [],
            {
                component: 'research-container',
                'managed-by': 'setup-app',
            },
            ['running'],
        )
    })

    it('getRunningStudies: should return a filtered array ', async () => {
        const running = {
            Id: '1234567890',
            Images: 'test',
            Names: ['research-container-1234567890'],
            ImageID: 'sha256:1234567890',
            Command: 'test/container-1',
            Labels: {
                instance: '1234567890',
                component: 'research-container',
                'managed-by': 'setup-app',
            },
            State: 'running',
            Status: 'running',
        }
        const completed = {
            Id: '0987654321',
            Images: 'test',
            Names: ['research-container-0987654321'],
            ImageID: 'sha256:0987654321',
            Command: 'test/container-2',
            Labels: {
                instance: '0987654321',
                component: 'research-container',
                'managed-by': 'setup-app',
            },
            State: 'completed',
            Status: 'completed',
        }
        const jobs: DockerApiContainersResponse[] = [completed, running]

        const enclave = new DockerEnclave()
        const filterContainers = vi.mocked(docker.filterContainers).mockResolvedValue([running])
        const getAllStudiesInEnclave = vi.spyOn(enclave, 'getAllStudiesInEnclave').mockResolvedValue(jobs)
        const containers = await enclave.getRunningStudies()

        expect(containers).toEqual([running])
        expect(getAllStudiesInEnclave).toHaveBeenCalledOnce()
        expect(filterContainers).toHaveBeenCalledWith(
            jobs,
            {
                component: 'research-container',
                'managed-by': 'setup-app',
            },
            ['running'],
        )
    })

    it('launchStudy: should call docker.pullContainer with the correct image', async () => {
        const enclave = new DockerEnclave()
        vi.mocked(api.dockerApiCall).mockResolvedValue([])
        const job = {
            containerLocation: 'my-image:latest',
            jobId: '123',
            title: 'My Study',
            toaEndpointWithJobId: 'http://example.com/job/123',
        }
        await enclave.launchStudy(job, job.toaEndpointWithJobId)
        expect(docker.createContainerObject).toHaveBeenCalledWith(
            'my-image:latest',
            '123',
            'My Study',
            'http://example.com/job/123',
        )
        expect(docker.pullContainer).toHaveBeenCalledWith('my-image:latest')
    })

    it('launchStudy: should call api.dockerApiCall with the correct path and data', async () => {
        const enclave = new DockerEnclave()

        const container = {
            Image: 'my-image:latest',
            Labels: {
                app: 'rc-123',
                component: 'research-container',
                'part-of': 'My Study',
                instance: '123',
                'managed-by': 'setup-app',
            },
            Env: [`TRUSTED_OUTPUT_ENDPOINT=http://example.com/job/123`],
        }
        vi.mocked(api.dockerApiCall).mockResolvedValue({ Id: '123' })
        vi.mocked(docker.createContainerObject).mockReturnValue(container)

        const job = {
            containerLocation: 'my-image:latest',
            jobId: '123',
            title: 'My Study',
            toaEndpointWithJobId: 'http://example.com/job/123',
        }
        await enclave.launchStudy(job, job.toaEndpointWithJobId)
        expect(docker.createContainerObject).toHaveBeenCalledWith(
            'my-image:latest',
            '123',
            'My Study',
            'http://example.com/job/123',
        )
        expect(docker.pullContainer).toHaveBeenCalledWith('my-image:latest')
        expect(api.dockerApiCall).nthCalledWith(1, 'POST', `containers/create?name=rc-123`, container)
    })

    it('launcStudy: should call api.dockerApiCall with the correct path and data when starting the container', async () => {
        const enclave = new DockerEnclave()
        const job = {
            containerLocation: 'my-image:latest',
            jobId: '123',
            title: 'My Study',
            toaEndpointWithJobId: 'http://example.com/job/123',
        }
        const response = {
            Id: 'abc123',
        }
        vi.mocked(api.dockerApiCall).mockResolvedValueOnce(response)
        await enclave.launchStudy(job, job.toaEndpointWithJobId)
        expect(api.dockerApiCall).toHaveBeenCalledWith('POST', `containers/${response.Id}/start`, undefined, true)
    })

    it('should throw an error if the docker API call fails', async () => {
        const enclave = new DockerEnclave()
        const job = {
            containerLocation: 'my-image:latest',
            jobId: '123',
            title: 'My Study',
            toaEndpointWithJobId: 'http://example.com/job/123',
        }
        const error = new Error('Docker API Call Error: Failed to deploy My Study with run id 123. Cause: {}')
        vi.mocked(api.dockerApiCall).mockRejectedValueOnce(error)
        await expect(enclave.launchStudy(job, job.toaEndpointWithJobId)).rejects.toThrow(error)
    })

    it('checkForErroredJobs', async () => {
        const enclave = new DockerEnclave()
        const failedContainers = [
            {
                Id: '1234567890',
                Images: 'test',
                Names: ['research-container-1234567890'],
                ImageID: 'sha256:1234567890',
                Command: 'test/container-1',
                Labels: {
                    instance: '1234567890',
                    component: 'research-container',
                    'managed-by': 'setup-app',
                },
                State: 'exited',
                Status: 'exited',
            },
            {
                Id: '0987654321',
                Images: 'test',
                Names: ['research-container-0987654321'],
                ImageID: 'sha256:0987654321',
                Command: 'test/container-2',
                Labels: {
                    instance: '0987654321',
                    component: 'research-container',
                    'managed-by': 'setup-app',
                },
                State: 'exited',
                Status: 'exited',
            },
        ]
        const mockUpdateJobStatus = vi.mocked(api.toaUpdateJobStatus)
        vi.mocked(api.dockerApiCall).mockResolvedValue(failedContainers)
        vi.mocked(docker.filterContainers).mockReturnValue(failedContainers)
        await enclave.checkForErroredJobs()
        expect(mockUpdateJobStatus).nthCalledWith(1, '1234567890', {
            status: 'JOB-ERRORED',
            message: 'Container 1234567890 exited with message: exited',
        })
        expect(mockUpdateJobStatus).nthCalledWith(2, '0987654321', {
            status: 'JOB-ERRORED',
            message: 'Container 0987654321 exited with message: exited',
        })
    })
})
