import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as kube from './kube'
import { createKubernetesJob, deployStudyContainer, filterDeployments, getJobs } from './kube-run-studies'
import { KubernetesJob, ManagementAppGetReadyStudiesResponse } from './types'

// Mocking external functions
vi.mock('./api')
vi.mock('./kube', () => ({
    apiCall: vi.fn(),
    getNamespace: vi.fn(),
}))

describe('filterDeployments', () => {
    let mockKubernetesJobs: Array<KubernetesJob>
    let mockRunnableStudies: ManagementAppGetReadyStudiesResponse // Assuming this is the actual type of runnableStudies

    beforeEach(() => {
        mockKubernetesJobs = [
            {
                metadata: {
                    name: 'job1',
                    namespace: 'default',
                    labels: { 'managed-by': 'setup-app', component: 'research-container', instance: 1 },
                },
                spec: {
                    selector: {
                        matchLabels: { 'managed-by': 'setup-app', component: 'research-container' },
                    },
                },
                status: {
                    active: 1,
                    startTime: '2023-10-01T00:00:00Z',
                },
            } as KubernetesJob,
            {
                metadata: {
                    name: 'job2',
                    namespace: 'default',
                    labels: { 'managed-by': 'setup-app', component: 'research-container', instance: 2 },
                },
                spec: {
                    selector: {
                        matchLabels: { 'managed-by': 'setup-app', component: 'research-container' },
                    },
                },
                status: {
                    active: 1,
                    startTime: '2023-10-01T00:00:00Z',
                },
            } as KubernetesJob,
            {
                metadata: {
                    name: 'job3',
                    namespace: 'default',
                    labels: { 'managed-by': 'setup-app', component: 'research-container', instance: 3 },
                },
                spec: {
                    selector: {
                        matchLabels: { 'managed-by': 'setup-app', component: 'research-container' },
                    },
                },
                status: {
                    active: 1,
                    startTime: '2023-10-01T00:00:00Z',
                },
            } as KubernetesJob,
            {
                metadata: {
                    name: 'job4',
                    namespace: 'default',
                    labels: { 'managed-by': 'setup-app', component: 'research-container', instance: 4 },
                },
                spec: {
                    selector: {
                        matchLabels: { 'managed-by': 'setup-app', component: 'research-container' },
                    },
                },
                status: {
                    active: 1,
                    startTime: '2023-10-01T00:00:00Z',
                },
            } as KubernetesJob,
        ]

        mockRunnableStudies = {
            jobs: [
                { jobId: '1', title: 'research1', containerLocation: 'aws/location' },
                { jobId: '3', title: 'research3', containerLocation: 'aws/location' },
            ],
        } // Only the first and third jobs are runnable.
    })

    it('should return an empty array if no deployments are provided', () => {
        expect(filterDeployments([], mockRunnableStudies)).toEqual([])
    })

    it('should filter the deployments correctly based on labels and runnable studies', () => {
        const result = filterDeployments(mockKubernetesJobs, mockRunnableStudies)
        expect(result).toEqual([mockKubernetesJobs[0], mockKubernetesJobs[2]]) // The first and third jobs should be returned.
    })

    it('should return an empty array if no deployments match the criteria', () => {
        const result = filterDeployments([mockKubernetesJobs[1], mockKubernetesJobs[3]], mockRunnableStudies)
        expect(result).toEqual([]) // The second and fourth jobs are not runnable by the 'setup-app' with 'research-container' component.
    })
})

describe('getJobs', () => {
    const mockRunIds = {
        jobs: [
            {
                jobId: '1',
                title: 'job1',
                containerLocation: 'aws/image',
            },
            {
                jobId: '2',
                title: 'job2',
                containerLocation: 'aws/image',
            },
        ],
    }

    it('should return jobs if deployments are found', async () => {
        const mockDeployments = {
            items: [
                {
                    metadata: {
                        name: 'job1',
                        namespace: 'default',
                        labels: { 'managed-by': 'setup-app', component: 'research-container', instance: 1 },
                    },
                    spec: {
                        selector: {
                            matchLabels: { 'managed-by': 'setup-app', component: 'research-container' },
                        },
                    },
                    status: {
                        active: 1,
                        startTime: '2023-10-01T00:00:00Z',
                    },
                } as KubernetesJob,
                {
                    metadata: {
                        name: 'job3',
                        namespace: 'default',
                        labels: { 'managed-by': 'setup-app', component: 'research-container', instance: 3 },
                    },
                    spec: {
                        selector: {
                            matchLabels: { 'managed-by': 'setup-app', component: 'research-container' },
                        },
                    },
                    status: {
                        active: 0,
                        startTime: '2023-10-01T00:00:00Z',
                    },
                } as KubernetesJob,
            ],
            status: 'test',
        }

        vi.mocked(kube.apiCall).mockResolvedValue(mockDeployments)

        const result = await getJobs(mockRunIds)
        expect(result.jobs.length).toEqual(1)
        expect(result.jobs).toEqual([mockDeployments.items[0]])
    })

    it('should return an empty jobs array if no deployments are found', async () => {
        vi.mocked(kube.apiCall).mockResolvedValue({})

        const result = await getJobs(mockRunIds)
        expect(result.jobs).toEqual([])
    })

    it('should handle errors gracefully and return an empty jobs array', async () => {
        vi.mocked(kube.apiCall).mockRejectedValue(new Error('API error'))

        const result = await getJobs(mockRunIds)
        expect(result.jobs).toEqual([])
    })

    it('should filter deployments based on runIds', async () => {
        const mockDeployments = {
            items: [
                {
                    metadata: {
                        name: 'job1',
                        namespace: 'default',
                        labels: { 'managed-by': 'setup-app', component: 'research-container', instance: 1 },
                    },
                    spec: {
                        selector: {
                            matchLabels: { 'managed-by': 'setup-app', component: 'research-container' },
                        },
                    },
                    status: {
                        active: 1,
                        startTime: '2023-10-01T00:00:00Z',
                    },
                } as KubernetesJob,
                {
                    metadata: {
                        name: 'job3',
                        namespace: 'default',
                        labels: { 'managed-by': 'setup-app', component: 'research-container', instance: 3 },
                    },
                    spec: {
                        selector: {
                            matchLabels: { 'managed-by': 'setup-app', component: 'research-container' },
                        },
                    },
                    status: {
                        active: 0,
                        startTime: '2023-10-01T00:00:00Z',
                    },
                } as KubernetesJob,
            ],
        }

        vi.mocked(kube.apiCall).mockResolvedValue(mockDeployments)

        const result = await getJobs(mockRunIds)
        expect(result.jobs).toEqual([mockDeployments.items[0]])
    })

    it('should log deployments if they are found', async () => {
        const mockDeployments = {
            items: [
                {
                    metadata: {
                        name: 'job1',
                        namespace: 'default',
                        labels: { 'managed-by': 'setup-app', component: 'research-container', instance: 1 },
                    },
                    spec: {
                        selector: {
                            matchLabels: { 'managed-by': 'setup-app', component: 'research-container' },
                        },
                    },
                    status: {
                        active: 1,
                        startTime: '2023-10-01T00:00:00Z',
                    },
                } as KubernetesJob,
            ],
        }

        vi.mocked(kube.apiCall).mockResolvedValue(mockDeployments)

        console.log = vi.fn()

        await getJobs(mockRunIds)
        expect(console.log).toHaveBeenCalledWith(JSON.stringify(mockDeployments, null, 4))
    })

    it('should log an error if apiCall fails', async () => {
        const mockError = new Error('API error')
        vi.mocked(kube.apiCall).mockRejectedValue(mockError)

        console.error = vi.fn()

        await getJobs(mockRunIds)
        expect(console.error).toHaveBeenCalledWith(
            'Error getting deployments. Please check the logs for more details. Cause: undefined',
        )
    })
})

describe('createKubernetesJob', () => {
    beforeEach(() => {
        process.env.TOA_BASE_URL = 'http://example.com'
    })

    afterEach(() => {
        delete process.env.TOA_BASE_URL
    })

    it('should create a valid Kubernetes Job object', () => {
        const imageLocation = 'nginx:latest'
        const runId = '12345'
        const studyTitle = 'My Study'

        vi.mocked(kube.getNamespace).mockResolvedValue('namespace')
        const job = createKubernetesJob(imageLocation, runId, studyTitle)

        expect(job).toEqual({
            apiVersion: 'batch/v1',
            kind: 'Job',
            metadata: {
                name: `research-container-${runId}`,
                namespace: kube.getNamespace(),
                labels: {
                    app: `research-container-${runId}`,
                    component: 'research-container',
                    'part-of': studyTitle.toLowerCase(),
                    instance: runId,
                    'managed-by': 'setup-app',
                },
            },
            spec: {
                template: {
                    metadata: {
                        labels: {
                            app: `research-container-${runId}`,
                            component: 'research-container',
                            'part-of': studyTitle.toLowerCase(),
                            instance: runId,
                            'managed-by': 'setup-app',
                            role: 'toa-access',
                        },
                    },
                    spec: {
                        containers: [
                            {
                                name: `research-container-${runId}`,
                                image: imageLocation,
                                ports: [],
                            },
                        ],
                        env: [
                            {
                                name: 'TRUSTED_OUTPUT_ENDPOINT',
                                value: `${process.env.TOA_BASE_URL}/api/run/${runId}`,
                            },
                        ],
                        restartPolicy: 'Never',
                    },
                },
            },
        })
    })

    it('should handle empty studyTitle correctly', () => {
        const imageLocation = 'nginx:latest'
        const runId = '12345'
        const studyTitle = ''

        const job = createKubernetesJob(imageLocation, runId, studyTitle)

        expect(job.metadata.labels['part-of']).toBe('')
    })
})

describe('deployStudyContainer', () => {
    const runId = 'test-run-id'
    const studyTitle = 'Test Study'
    const imageLocation = 'docker.io/test/image'

    beforeEach(() => {
        console.log = vi.fn()
        console.error = vi.fn()
    })

    afterEach(() => {
        vi.clearAllMocks()
    })

    const mockJob = {
        apiVersion: 'batch/v1',
        kind: 'Job',
        metadata: {
            labels: {
                app: 'research-container-test-run-id',
                component: 'research-container',
                instance: 'test-run-id',
                'managed-by': 'setup-app',
                'part-of': 'test study',
            },
            name: 'research-container-test-run-id',
            namespace: undefined,
        },
        spec: {
            template: {
                metadata: {
                    labels: {
                        app: 'research-container-test-run-id',
                        component: 'research-container',
                        instance: 'test-run-id',
                        'managed-by': 'setup-app',
                        'part-of': 'test study',
                        role: 'toa-access',
                    },
                },
                spec: {
                    containers: [
                        {
                            image: 'docker.io/test/image',
                            name: 'research-container-test-run-id',
                            ports: [],
                        },
                    ],
                    env: [
                        {
                            name: 'TRUSTED_OUTPUT_ENDPOINT',
                            value: 'https://toa:67890/api/run/test-run-id',
                        },
                    ],
                    restartPolicy: 'Never',
                },
            },
        },
    }
    it('should deploy the job successfully', async () => {
        const mockResponse = { status: 'Success' }
        vi.mocked(kube.apiCall).mockResolvedValue(mockResponse)

        await deployStudyContainer(runId, studyTitle, imageLocation)

        expect(console.log).toHaveBeenCalledWith('Creating Kubernetes job: research-container-test-run-id')
        expect(kube.apiCall).toHaveBeenCalledWith('batch', 'jobs', 'POST', mockJob)
        expect(console.log).toHaveBeenCalledWith(`${JSON.stringify(mockResponse)}`)
        expect(console.log).toHaveBeenCalledWith(`Successfully deployed ${studyTitle} with run id ${runId}`)
    })

    it('should handle deployment failure gracefully', async () => {
        const mockResponse = { status: 'Failure' }
        vi.mocked(kube.apiCall).mockResolvedValue(mockResponse)

        await deployStudyContainer(runId, studyTitle, imageLocation)

        expect(kube.apiCall).toHaveBeenCalledWith('batch', 'jobs', 'POST', mockJob)
        expect(console.error).toHaveBeenCalledWith(`Failed to deploy study container`)
    })

    it('should throw an error if apiCall rejects', async () => {
        const errorMessage = 'API Call Error'
        vi.mocked(kube.apiCall).mockRejectedValue(new Error(errorMessage))

        await expect(deployStudyContainer(runId, studyTitle, imageLocation)).rejects.toThrowError(
            `API Call Error: Failed to deploy ${studyTitle} with run id ${runId}`,
        )

        expect(kube.apiCall).toHaveBeenCalledWith('batch', 'jobs', 'POST', mockJob)

        expect(console.error).toHaveBeenCalledWith(
            `API Call Error: Failed to deploy ${studyTitle} with run id ${runId}. Cause: {}`,
        )
    })

    it('should handle empty response gracefully', async () => {
        const mockResponse = {}
        vi.mocked(kube.apiCall).mockResolvedValue(mockResponse)

        await deployStudyContainer(runId, studyTitle, imageLocation)

        expect(kube.apiCall).toHaveBeenCalledWith('batch', 'jobs', 'POST', mockJob)
        expect(console.error).toHaveBeenCalledWith(`Failed to deploy study container`)
    })
})
