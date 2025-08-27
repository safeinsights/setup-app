import { describe, expect, it, vi } from 'vitest'
import * as api from './api'
import * as docker from './docker'
import { DockerEnclave } from './docker-enclave'
import {
    CONTAINER_TYPES,
    DockerApiContainerResponse,
    DockerApiContainersResponse,
    ManagementAppGetReadyStudiesResponse,
    TOAGetJobsResponse,
} from './types'

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
                Image: 'test',
                Names: ['research-container-1234567890'],
                ImageID: 'sha256:1234567890',
                Command: 'test/container-1',
                Labels: {
                    instance: '1234567890',
                    component: CONTAINER_TYPES.RESEARCH_CONTAINER,
                    'managed-by': CONTAINER_TYPES.SETUP_APP,
                },
                State: 'running',
                Status: 'running',
            },
            {
                Id: '0987654321',
                Image: 'test',
                Names: ['research-container-0987654321'],
                ImageID: 'sha256:0987654321',
                Command: 'test/container-2',
                Labels: {
                    instance: '0987654321',
                    component: CONTAINER_TYPES.RESEARCH_CONTAINER,
                    'managed-by': CONTAINER_TYPES.SETUP_APP,
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
                Image: 'test',
                Names: ['research-container-1234567890'],
                ImageID: 'sha256:1234567890',
                Command: 'test/container-1',
                Labels: {
                    instance: '1234567890',
                    component: CONTAINER_TYPES.RESEARCH_CONTAINER,
                    'managed-by': CONTAINER_TYPES.SETUP_APP,
                },
                State: 'completed',
                Status: 'completed',
            },
            {
                Id: '0987654321',
                Image: 'test',
                Names: ['research-container-0987654321'],
                ImageID: 'sha256:0987654321',
                Command: 'test/container-2',
                Labels: {
                    instance: '0987654321',
                    component: CONTAINER_TYPES.RESEARCH_CONTAINER,
                    'managed-by': CONTAINER_TYPES.SETUP_APP,
                },
                State: 'completed',
                Status: 'completed',
            },
        ]

        const statuses: DockerApiContainerResponse[] = [
            {
                Id: '1234567890',
                Image: 'test',
                State: {
                    Status: 'exited',
                    Running: false,
                    Paused: false,
                    Restarting: false,
                    OOMKilled: false,
                    Dead: true,
                    StartedAt: '',
                    FinishedAt: '',
                    ExitCode: 0,
                    Error: 'error',
                },
            },
            {
                Id: '0987654321',
                Image: 'test',
                State: {
                    Status: 'exited',
                    Running: false,
                    Paused: false,
                    Restarting: false,
                    OOMKilled: false,
                    Dead: true,
                    StartedAt: '',
                    FinishedAt: '',
                    ExitCode: 0,
                    Error: 'error',
                },
            },
        ]
        const dockerApiCall = vi
            .mocked(api.dockerApiCall)
            .mockResolvedValueOnce(statuses[0])
            .mockResolvedValueOnce(statuses[1])
        vi.spyOn(enclave, 'getAllStudiesInEnclave').mockResolvedValue(jobs)
        vi.mocked(docker.filterContainers).mockReturnValue(jobs)
        await enclave.cleanup()
        expect(dockerApiCall).toHaveBeenCalledTimes(4)
        expect(dockerApiCall).toHaveBeenCalledWith('GET', 'containers/0987654321/json')
        expect(dockerApiCall).toHaveBeenCalledWith('GET', 'containers/1234567890/json')
        expect(dockerApiCall).toHaveBeenCalledWith('DELETE', 'containers/1234567890')
        expect(dockerApiCall).toHaveBeenCalledWith('DELETE', 'containers/0987654321')
    })

    it('removeContainer: should call dockerApiCall with the correct arguments', async () => {
        const enclave = new DockerEnclave()
        const dockerApiCall = vi.mocked(api.dockerApiCall)
        await enclave.removeContainer('1234567890')
        expect(dockerApiCall).toBeCalledTimes(1)
        expect(dockerApiCall).toHaveBeenCalledWith('DELETE', 'containers/1234567890')
    })

    it('getAllStudiesInEnclave: should return an empty array if there are no containers', async () => {
        const dockerApiCall = vi.mocked(api.dockerApiCall).mockResolvedValue([])
        const enclave = new DockerEnclave()
        const containers = await enclave.getAllStudiesInEnclave()

        expect(containers).toEqual([])
        expect(dockerApiCall).toHaveBeenCalledWith('GET', 'containers/json?all=true')
    })

    it('getAllStudiesInEnclave: Return empty when the api call throws an error', async () => {
        const dockerApiCall = vi.mocked(api.dockerApiCall).mockRejectedValue(new Error('Error'))
        const enclave = new DockerEnclave()
        const containers = await enclave.getAllStudiesInEnclave()
        expect(containers).toEqual([])
        expect(dockerApiCall).toHaveBeenCalledWith('GET', 'containers/json?all=true')
    })

    it('getAllStudiesInEnclave: should return a list of containers if they exist', async () => {
        const jobs: DockerApiContainersResponse[] = [
            {
                Id: '1234567890',
                Image: 'test',
                Names: ['research-container-1234567890'],
                ImageID: 'sha256:1234567890',
                Command: 'test/container-1',
                Labels: {
                    instance: '1234567890',
                    component: CONTAINER_TYPES.RESEARCH_CONTAINER,
                    'managed-by': CONTAINER_TYPES.SETUP_APP,
                },
                State: 'completed',
                Status: 'completed',
            },
            {
                Id: '0987654321',
                Image: 'test',
                Names: ['research-container-0987654321'],
                ImageID: 'sha256:0987654321',
                Command: 'test/container-2',
                Labels: {
                    instance: '0987654321',
                    component: CONTAINER_TYPES.RESEARCH_CONTAINER,
                    'managed-by': CONTAINER_TYPES.SETUP_APP,
                },
                State: 'completed',
                Status: 'completed',
            },
        ]
        const dockerApiCall = vi.mocked(api.dockerApiCall).mockResolvedValue(jobs)

        const enclave = new DockerEnclave()
        const result = await enclave.getAllStudiesInEnclave()

        expect(result).toEqual(jobs)
        expect(dockerApiCall).toHaveBeenCalledWith('GET', 'containers/json?all=true')
    })

    it('getRunningStudies: should return an empty array if there are no containers', async () => {
        const enclave = new DockerEnclave()
        const filterContainers = vi.mocked(docker.filterContainers).mockResolvedValue([])
        const getAllStudiesInEnclave = vi.spyOn(enclave, 'getAllStudiesInEnclave').mockResolvedValue([])
        const containers = await enclave.getDeployedStudies()

        expect(containers).toEqual([])
        expect(getAllStudiesInEnclave).toHaveBeenCalledOnce()
        expect(filterContainers).toHaveBeenCalledWith(
            [],
            {
                component: CONTAINER_TYPES.RESEARCH_CONTAINER,
                'managed-by': CONTAINER_TYPES.SETUP_APP,
            },
            ['running', 'created', 'restarting', 'removing', 'paused', 'exited', 'dead'],
        )
    })

    it('getRunningStudies: should return a filtered array ', async () => {
        const running = {
            Id: '1234567890',
            Image: 'test',
            Names: ['research-container-1234567890'],
            ImageID: 'sha256:1234567890',
            Command: 'test/container-1',
            Labels: {
                instance: '1234567890',
                component: CONTAINER_TYPES.RESEARCH_CONTAINER,
                'managed-by': CONTAINER_TYPES.SETUP_APP,
            },
            State: 'running',
            Status: 'running',
        }
        const completed = {
            Id: '0987654321',
            Image: 'test',
            Names: ['research-container-0987654321'],
            ImageID: 'sha256:0987654321',
            Command: 'test/container-2',
            Labels: {
                instance: '0987654321',
                component: CONTAINER_TYPES.RESEARCH_CONTAINER,
                'managed-by': CONTAINER_TYPES.SETUP_APP,
            },
            State: 'completed',
            Status: 'completed',
        }
        const jobs: DockerApiContainersResponse[] = [completed, running]

        const enclave = new DockerEnclave()
        const filterContainers = vi.mocked(docker.filterContainers).mockResolvedValue([running])
        const getAllStudiesInEnclave = vi.spyOn(enclave, 'getAllStudiesInEnclave').mockResolvedValue(jobs)
        const containers = await enclave.getDeployedStudies()

        expect(containers).toEqual([running])
        expect(getAllStudiesInEnclave).toHaveBeenCalledOnce()
        expect(filterContainers).toHaveBeenCalledWith(
            jobs,
            {
                component: CONTAINER_TYPES.RESEARCH_CONTAINER,
                'managed-by': CONTAINER_TYPES.SETUP_APP,
            },
            ['running', 'created', 'restarting', 'removing', 'paused', 'exited', 'dead'],
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
                component: CONTAINER_TYPES.RESEARCH_CONTAINER,
                'part-of': 'My Study',
                instance: '123',
                'managed-by': CONTAINER_TYPES.SETUP_APP,
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
        const failedContainer = {
            Id: '1234567890',
            Image: 'test',
            Names: ['research-container-1234567890'],
            ImageID: 'sha256:1234567890',
            Command: 'test/container-1',
            Labels: {
                instance: '1234567890',
                component: CONTAINER_TYPES.RESEARCH_CONTAINER,
                'managed-by': CONTAINER_TYPES.SETUP_APP,
            },
            State: 'exited',
            Status: 'exited',
        }
        const detailedContainerStatus = {
            Id: '1234567890',
            Image: 'test',
            State: {
                Status: 'exited',
                Running: false,
                Paused: false,
                Restarting: false,
                OOMKilled: false,
                Dead: true,
                StartedAt: '',
                FinishedAt: '',
                ExitCode: 10,
                Error: 'error',
            },
        }
        const mockUpdateJobStatus = vi.mocked(api.toaUpdateJobStatus)
        const dockerApiCall = vi
            .mocked(api.dockerApiCall)
            .mockResolvedValueOnce([failedContainer])
            .mockResolvedValueOnce(detailedContainerStatus)
        vi.mocked(docker.filterContainers).mockReturnValue([failedContainer])
        await enclave.checkForErroredJobs()
        expect(dockerApiCall).toHaveBeenCalledTimes(2)
        expect(dockerApiCall).toHaveBeenCalledWith('GET', `containers/json?all=true`)
        expect(dockerApiCall).toHaveBeenCalledWith('GET', `containers/1234567890/json`)
        expect(mockUpdateJobStatus).nthCalledWith(1, '1234567890', {
            status: 'JOB-ERRORED',
            message: 'Container 1234567890 exited with message: error',
        })
    })
})
