import { describe, expect, it, vi } from 'vitest'
import * as api from './api'
import * as kube from './kube'
import { createKubernetesJob } from './kube'
import { KubernetesEnclave } from './kube-enclave'
import {
    CONTAINER_TYPES,
    KubernetesApiJobsResponse,
    KubernetesJob,
    KubernetesPod,
    ManagementAppGetReadyStudiesResponse,
    ManagementAppJob,
    TOAGetJobsResponse,
} from './types'

vi.mock('./kube')
vi.mock('./api')

describe('KubernetesEnclave', () => {
    it('filterJobsInEnclave should return jobs that are not in the enclave', () => {
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

        const runningJobsInEnclave: KubernetesJob[] = [
            {
                metadata: {
                    name: 'rc-1234567890',
                    namespace: 'test',
                    labels: {
                        app: 'rc-1234567890',
                        component: CONTAINER_TYPES.RESEARCH_CONTAINER,
                        'managed-by': CONTAINER_TYPES.SETUP_APP,
                        role: 'toa-access',
                        instance: '1234567890',
                    },
                },
                spec: {
                    selector: {
                        matchLabels: {
                            studyId: 'rc-1234567890',
                            jobId: '1234567890',
                        },
                    },
                    template: {
                        spec: {
                            containers: [
                                {
                                    name: 'rc-1234567890',
                                },
                            ],
                        },
                    },
                },
                status: {
                    conditions: [
                        {
                            type: 'Completed',
                            status: 'False',
                        },
                    ],
                },
            },
        ]

        const kubernetesEnclave = new KubernetesEnclave()
        const filteredJobs = kubernetesEnclave.filterJobsInEnclave(
            bmaReadysResults,
            toaGetJobsResult,
            runningJobsInEnclave,
        )

        expect(filteredJobs).toEqual({
            jobs: [
                {
                    jobId: '0987654321',
                    title: 'Test Job 2',
                    containerLocation: 'test/container-2',
                },
            ],
        })
    })

    it('filterJobsInEnclave should return all jobs if none are in the enclave', () => {
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

        const runningJobsInEnclave: KubernetesJob[] = []

        const kubernetesEnclave = new KubernetesEnclave()
        const filteredJobs = kubernetesEnclave.filterJobsInEnclave(
            bmaReadysResults,
            toaGetJobsResult,
            runningJobsInEnclave,
        )

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

    it('filterJobsInEnclave should return all jobs if none are in the enclave with mixed cases', () => {
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

        const runningJobsInEnclave: KubernetesJob[] = []

        const kubernetesEnclave = new KubernetesEnclave()
        const filteredJobs = kubernetesEnclave.filterJobsInEnclave(
            bmaReadysResults,
            toaGetJobsResult,
            runningJobsInEnclave,
        )

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

    it('launchStudy should call k8sApiCall with the correct path and data', async () => {
        const enclave = new KubernetesEnclave()

        const job = {
            containerLocation: 'my-image:latest',
            jobId: '123',
            title: 'My Study',
            toaEndpointWithJobId: 'http://example.com/job/123',
        }
        const kubeJob = {
            apiVersion: 'batch/v1',
            kind: 'Job',
            metadata: {
                name: 'research-container-123',
                namespace: 'default',
                labels: {
                    app: 'research-container-123',
                    component: CONTAINER_TYPES.RESEARCH_CONTAINER,
                    'part-of': 'my-study',
                    instance: '123',
                    'managed-by': CONTAINER_TYPES.SETUP_APP,
                },
            },
            spec: {
                template: {
                    metadata: {
                        labels: {
                            app: 'research-container-123',
                            component: CONTAINER_TYPES.RESEARCH_CONTAINER,
                            'part-of': 'my-study',
                            instance: '123',
                            'managed-by': CONTAINER_TYPES.SETUP_APP,
                            role: 'toa-access',
                        },
                    },
                    spec: {
                        containers: [
                            {
                                name: 'research-container-123',
                                image: 'my-image:latest',
                                ports: [],
                                env: [
                                    {
                                        name: 'TRUSTED_OUTPUT_ENDPOINT',
                                        value: 'http://example.com/job/123',
                                    },
                                ],
                            },
                        ],
                        restartPolicy: 'Never',
                        imagePullSecrets: [{ name: 'secret' }],
                    },
                },
            },
        }
        vi.mocked(api.k8sApiCall).mockResolvedValue({ status: 'Success', items: [] })
        vi.mocked(kube.createKubernetesJob).mockReturnValue(kubeJob)

        await enclave.launchStudy(job, job.toaEndpointWithJobId)

        expect(kube.createKubernetesJob).toHaveBeenCalledWith(
            'my-image:latest',
            '123',
            'My Study',
            'http://example.com/job/123',
        )
        expect(api.k8sApiCall).toHaveBeenCalledWith('batch', 'jobs', 'POST', kubeJob)
    })

    it('launchStudy should throw an error if the k8s API call fails', async () => {
        const enclave = new KubernetesEnclave()

        const job = {
            containerLocation: 'my-image:latest',
            jobId: '123',
            title: 'My Study',
            toaEndpointWithJobId: 'http://example.com/job/123',
        }
        vi.mocked(api.k8sApiCall).mockRejectedValueOnce(new Error('K8s API Call Error'))

        await expect(enclave.launchStudy(job, job.toaEndpointWithJobId)).rejects.toThrow('K8s API Call Error')
    })
    it('getRunningStudies should return an empty array if there are no jobs', async () => {
        const enclave = new KubernetesEnclave()
        const getAllStudiesInEnclave = vi.spyOn(enclave, 'getAllStudiesInEnclave').mockResolvedValue([])
        const filterDeployments = vi.mocked(kube.filterDeployments).mockReturnValue([])

        const result = await enclave.getDeployedStudies()

        expect(result).toEqual([])
        expect(getAllStudiesInEnclave).toHaveBeenCalledOnce()
        expect(filterDeployments).toHaveBeenCalledWith([], {
            component: CONTAINER_TYPES.RESEARCH_CONTAINER,
            'managed-by': CONTAINER_TYPES.SETUP_APP,
            role: 'toa-access',
        })
    })

    it('getRunningStudies should return a filtered array of jobs', async () => {
        const running: KubernetesJob = {
            metadata: {
                name: 'rc-1234567890',
                namespace: 'test',
                labels: {
                    app: 'rc-1234567890',
                    component: CONTAINER_TYPES.RESEARCH_CONTAINER,
                    'managed-by': CONTAINER_TYPES.SETUP_APP,
                    role: 'toa-access',
                },
            },
            spec: {
                selector: {
                    matchLabels: {
                        studyId: 'rc-1234567890',
                        jobId: '1234567890',
                    },
                },
                template: {
                    spec: {
                        containers: [
                            {
                                name: 'rc-1234567890',
                            },
                        ],
                    },
                },
            },
            status: {
                conditions: [
                    {
                        type: 'Completed',
                        status: 'False',
                    },
                ],
            },
        }
        const completed: KubernetesJob = {
            metadata: {
                name: 'rc-0987654321',
                namespace: 'test',
                labels: {
                    app: 'rc-0987654321',
                    component: CONTAINER_TYPES.RESEARCH_CONTAINER,
                    'managed-by': CONTAINER_TYPES.SETUP_APP,
                    role: 'toa-access',
                },
            },
            spec: {
                selector: {
                    matchLabels: {
                        studyId: 'rc-0987654321',
                        jobId: '0987654321',
                    },
                },
                template: {
                    spec: {
                        containers: [
                            {
                                name: 'rc-0987654321',
                            },
                        ],
                    },
                },
            },
            status: {
                conditions: [
                    {
                        type: 'Completed',
                        status: 'False',
                    },
                ],
            },
        }
        const jobs = [completed, running]

        const enclave = new KubernetesEnclave()
        const getAllStudiesInEnclave = vi.spyOn(enclave, 'getAllStudiesInEnclave').mockResolvedValue(jobs)
        const filterDeployments = vi.mocked(kube.filterDeployments).mockReturnValue([running])

        const result = await enclave.getDeployedStudies()

        expect(result).toEqual([running])
        expect(getAllStudiesInEnclave).toHaveBeenCalledOnce()
        expect(filterDeployments).toHaveBeenCalledWith(jobs, {
            component: CONTAINER_TYPES.RESEARCH_CONTAINER,
            'managed-by': CONTAINER_TYPES.SETUP_APP,
            role: 'toa-access',
        })
    })
    it('getAllStudiesInEnclave: should return an empty array if there are no jobs', async () => {
        const k8sApiCall = vi.mocked(api.k8sApiCall).mockResolvedValue({ items: [] })
        const enclave = new KubernetesEnclave()
        const jobs = await enclave.getAllStudiesInEnclave()

        expect(jobs).toEqual([])
        expect(k8sApiCall).toHaveBeenCalledWith('batch', 'jobs', 'GET')
    })
    it('getAllStudiesInEnclave: should return an empty array if an error occured', async () => {
        const k8sApiCall = vi.mocked(api.k8sApiCall).mockRejectedValue(new Error('Error'))
        const enclave = new KubernetesEnclave()
        const jobs = await enclave.getAllStudiesInEnclave()

        expect(jobs).toEqual([])
        expect(k8sApiCall).toHaveBeenCalledWith('batch', 'jobs', 'GET')
    })
    it('getAllStudiesInEnclave: should return a list of jobs if they exist', async () => {
        const jobs: KubernetesApiJobsResponse = {
            items: [
                {
                    metadata: {
                        name: 'rc-1234567890',
                        namespace: 'test',
                        labels: {
                            app: 'rc-1234567890',
                            component: CONTAINER_TYPES.RESEARCH_CONTAINER,
                            'managed-by': CONTAINER_TYPES.SETUP_APP,
                            role: 'toa-access',
                        },
                    },
                    spec: {
                        selector: {
                            matchLabels: {
                                studyId: 'rc-1234567890',
                                jobId: '1234567890',
                            },
                        },
                        template: {
                            spec: {
                                containers: [
                                    {
                                        name: 'rc-1234567890',
                                    },
                                ],
                            },
                        },
                    },
                    status: {
                        conditions: [
                            {
                                type: 'Completed',
                                status: 'False',
                            },
                        ],
                    },
                },
            ],
        }
        const k8sApiCall = vi.mocked(api.k8sApiCall).mockResolvedValue(jobs)
        const enclave = new KubernetesEnclave()
        const result = await enclave.getAllStudiesInEnclave()

        expect(k8sApiCall).toHaveBeenCalledWith('batch', 'jobs', 'GET')
        expect(result).toEqual(jobs.items)
    })
    it('launchStudy: should successfully deploy the study container', async () => {
        // Mock successful response
        const mockResponse = { status: 'Success', items: [] }
        const k8sApiCall = vi.mocked(api.k8sApiCall).mockResolvedValue(mockResponse)
        const enclave = new KubernetesEnclave()
        const job: ManagementAppJob = {
            jobId: '1234567890',
            title: 'Test Job 1',
            containerLocation: 'test/container-1',
        }
        const kubeJob = createKubernetesJob(job.containerLocation, job.jobId, job.title, '')
        await enclave.launchStudy(job, '')

        expect(k8sApiCall).toHaveBeenCalledWith('batch', 'jobs', 'POST', kubeJob)
    })

    it('cleanup: should delete completed jobs and their containers', async () => {
        const enclave = new KubernetesEnclave()
        const job: KubernetesJob = {
            metadata: {
                name: 'job-1',
                namespace: 'ns',
                labels: {
                    'managed-by': CONTAINER_TYPES.SETUP_APP,
                    component: CONTAINER_TYPES.RESEARCH_CONTAINER,
                    instance: '1234567890',
                },
            },
            spec: {
                selector: {
                    matchLabels: {
                        'managed-by': CONTAINER_TYPES.SETUP_APP,
                        component: CONTAINER_TYPES.RESEARCH_CONTAINER,
                        instance: '1234567890',
                    },
                },
                template: {
                    spec: {
                        containers: [{ name: 'research-container-1234567890' }],
                    },
                },
            },
            status: {
                conditions: [
                    {
                        type: 'Complete',
                        status: 'True',
                    },
                ],
            },
        }
        // Mock getAllStudiesInEnclave to return a list of jobs
        vi.spyOn(enclave, 'getAllStudiesInEnclave').mockResolvedValue([job])

        // Mock k8sApiCall to return a list of pods
        vi.mocked(api.k8sApiCall).mockResolvedValueOnce({
            items: [job],
        })

        // Mock k8sApiCall to delete pods and jobs
        vi.mocked(api.k8sApiCall).mockResolvedValue({ status: 'Success', items: [job] })

        await enclave.cleanup()
        expect(api.k8sApiCall).toBeCalledTimes(2)
    })

    it('cleanup: should not delete jobs that are not completed', async () => {
        const enclave = new KubernetesEnclave()
        const job: KubernetesJob = {
            metadata: {
                name: 'job-1',
                namespace: 'ns',
                labels: {
                    'managed-by': CONTAINER_TYPES.SETUP_APP,
                    component: CONTAINER_TYPES.RESEARCH_CONTAINER,
                    instance: '1234567890',
                },
            },
            spec: {
                selector: {
                    matchLabels: {
                        'managed-by': CONTAINER_TYPES.SETUP_APP,
                        component: CONTAINER_TYPES.RESEARCH_CONTAINER,
                        instance: '1234567890',
                    },
                },
                template: {
                    spec: {
                        containers: [{ name: 'research-container-1234567890' }],
                    },
                },
            },
            status: {
                conditions: [
                    {
                        type: 'Complete',
                        status: 'False',
                    },
                ],
            },
        }

        // Mock getAllStudiesInEnclave to return a list of jobs
        vi.spyOn(enclave, 'getAllStudiesInEnclave').mockResolvedValue([job])

        // Mock k8sApiCall to return a list of pods
        vi.mocked(api.k8sApiCall).mockResolvedValueOnce({
            items: [],
        })

        await enclave.cleanup()

        expect(api.k8sApiCall).not.toHaveBeenCalledWith(undefined, `pods/pod-1`, 'DELETE')
        expect(api.k8sApiCall).not.toHaveBeenCalledWith('batch', `jobs/job-1`, 'DELETE')
    })

    it('cleanup should not delete jobs that are not completed', async () => {
        const enclave = new KubernetesEnclave()
        const job: KubernetesJob = {
            metadata: {
                name: 'job-1',
                namespace: 'ns',
                labels: {
                    'managed-by': CONTAINER_TYPES.SETUP_APP,
                    component: CONTAINER_TYPES.RESEARCH_CONTAINER,
                    instance: '1234567890',
                },
            },
            spec: {
                selector: {
                    matchLabels: {
                        'managed-by': CONTAINER_TYPES.SETUP_APP,
                        component: CONTAINER_TYPES.RESEARCH_CONTAINER,
                        instance: '1234567890',
                    },
                },
                template: {
                    spec: {
                        containers: [{ name: 'research-container-1234567890' }],
                    },
                },
            },
            status: {
                conditions: [
                    {
                        type: 'Complete',
                        status: 'False',
                    },
                ],
            },
        }

        // Mock getAllStudiesInEnclave to return a list of jobs
        vi.spyOn(enclave, 'getAllStudiesInEnclave').mockResolvedValue([job])

        // Mock k8sApiCall to return a list of pods
        vi.mocked(api.k8sApiCall).mockResolvedValueOnce({
            items: [],
        })

        await enclave.cleanup()

        expect(api.k8sApiCall).not.toHaveBeenCalledWith(undefined, `pods/pod-1`, 'DELETE')
        expect(api.k8sApiCall).not.toHaveBeenCalledWith('batch', `jobs/job-1`, 'DELETE')
    })

    it('checkForErroredJobs should log an error message if a container exits with a non-zero exit code', async () => {
        const enclave = new KubernetesEnclave()

        const erroredJob: KubernetesJob = {
            metadata: {
                name: 'job-1',
                namespace: 'ns',
                labels: {
                    'managed-by': CONTAINER_TYPES.SETUP_APP,
                    component: CONTAINER_TYPES.RESEARCH_CONTAINER,
                    instance: '1234567890',
                },
            },
            spec: {
                selector: {
                    matchLabels: {
                        'managed-by': CONTAINER_TYPES.SETUP_APP,
                        component: CONTAINER_TYPES.RESEARCH_CONTAINER,
                        instance: '1234567890',
                    },
                },
                template: {
                    spec: {
                        containers: [{ name: 'research-container-1234567890' }],
                    },
                },
            },
            status: {
                conditions: [
                    {
                        type: 'Complete',
                        status: 'False',
                    },
                ],
            },
        }

        const erroredPod: KubernetesPod = {
            metadata: {
                name: 'pod-1',
                namespace: 'ns',
                labels: {
                    'managed-by': CONTAINER_TYPES.SETUP_APP,
                    component: CONTAINER_TYPES.RESEARCH_CONTAINER,
                    instance: '1234567890',
                },
            },
            status: {
                containerStatuses: [
                    {
                        ready: false,
                        started: false,
                        state: {
                            terminated: {
                                exitCode: 1,
                                reason: '',
                            },
                        },
                    },
                ],
            },
        }

        vi.spyOn(enclave, 'getAllStudiesInEnclave').mockResolvedValue([erroredJob])
        vi.mocked(api.k8sApiCall).mockResolvedValueOnce({
            items: [erroredPod],
        })

        const toaUpdateJobStatus = vi.fn()
        vi.mocked(api.toaUpdateJobStatus).mockImplementation(toaUpdateJobStatus)

        await enclave.checkForErroredJobs()

        expect(toaUpdateJobStatus).toHaveBeenCalledWith('1234567890', {
            status: 'JOB-ERRORED',
            message: `Container pod-1 exited with non 0 error code`,
        })
    })

    it('checkForErroredJobs should not log an error message if a container exits with a zero exit code', async () => {
        const enclave = new KubernetesEnclave()

        const successfulJob: KubernetesJob = {
            metadata: {
                name: 'job-1',
                namespace: 'ns',
                labels: {
                    'managed-by': CONTAINER_TYPES.SETUP_APP,
                    component: CONTAINER_TYPES.RESEARCH_CONTAINER,
                    instance: '1234567890',
                },
            },
            spec: {
                selector: {
                    matchLabels: {
                        'managed-by': CONTAINER_TYPES.SETUP_APP,
                        component: CONTAINER_TYPES.RESEARCH_CONTAINER,
                        instance: '1234567890',
                    },
                },
                template: {
                    spec: {
                        containers: [{ name: 'research-container-1234567890' }],
                    },
                },
            },
            status: {
                conditions: [
                    {
                        type: 'Complete',
                        status: 'False',
                    },
                ],
            },
        }

        const successfulPod: KubernetesPod = {
            metadata: {
                name: 'pod-1',
                namespace: 'ns',
                labels: {
                    'managed-by': CONTAINER_TYPES.SETUP_APP,
                    component: CONTAINER_TYPES.RESEARCH_CONTAINER,
                    instance: '1234567890',
                },
            },
            status: {
                containerStatuses: [
                    {
                        ready: false,
                        started: false,
                        state: {
                            terminated: {
                                exitCode: 1,
                                reason: '',
                            },
                        },
                    },
                ],
            },
        }

        vi.spyOn(enclave, 'getAllStudiesInEnclave').mockResolvedValue([successfulJob])
        vi.mocked(api.k8sApiCall).mockResolvedValueOnce({
            items: [successfulPod],
        })

        const toaUpdateJobStatus = vi.fn()
        vi.mocked(api.toaUpdateJobStatus).mockImplementation(toaUpdateJobStatus)

        await enclave.checkForErroredJobs()

        expect(toaUpdateJobStatus).toHaveBeenCalled()
    })

    it('checkForErroredJobs should handle an error when fetching jobs', async () => {
        const enclave = new KubernetesEnclave()

        vi.spyOn(enclave, 'getAllStudiesInEnclave').mockRejectedValue(new Error('Failed to fetch jobs'))

        await expect(enclave.checkForErroredJobs()).rejects.toThrow(
            `An error occurred while cleaning up environment: Error: Failed to fetch jobs`,
        )
    })

    it('checkForErroredJobs should handle an error when fetching pods', async () => {
        const enclave = new KubernetesEnclave()

        vi.spyOn(enclave, 'getAllStudiesInEnclave').mockResolvedValue([])
        vi.mocked(api.k8sApiCall).mockRejectedValueOnce(new Error('Failed to fetch pods'))

        await expect(enclave.checkForErroredJobs()).rejects.toThrow(
            'An error occurred while cleaning up environment: Error: Failed to fetch pods',
        )
    })
})
