import { describe, expect, it, vi } from 'vitest'
import * as api from './api'
import * as kube from './kube'
import { KubernetesEnclave } from './kube-enclave'
import {
    KubernetesApiJobsResponse,
    KubernetesJob,
    ManagementAppGetReadyStudiesResponse,
    TOAGetJobsResponse,
} from './types'

vi.mock('./kube')
vi.mock('./api')

describe('KubernetesEnclave', () => {
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

        const runningJobsInEnclave: KubernetesJob[] = [
            {
                metadata: {
                    name: 'rc-1234567890',
                    namespace: 'test',
                    labels: {
                        app: 'rc-1234567890',
                        component: 'research-container',
                        'managed-by': 'setup-app',
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
            {
                metadata: {
                    name: 'rc-0987654321',
                    namespace: 'test',
                    labels: {
                        app: 'rc-0987654321',
                        component: 'research-container',
                        'managed-by': 'setup-app',
                        role: 'toa-access',
                        instance: '0987654321',
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
            },
        ]

        const kubernetesEnclave = new KubernetesEnclave()
        const filteredJobs = kubernetesEnclave.filterJobsInEnclave(
            bmaReadysResults,
            toaGetJobsResult,
            runningJobsInEnclave,
        )

        expect(filteredJobs).toEqual({ jobs: [] })
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
                    component: 'research-container',
                    'part-of': 'my-study',
                    instance: '123',
                    'managed-by': 'setup-app',
                },
            },
            spec: {
                template: {
                    metadata: {
                        labels: {
                            app: 'research-container-123',
                            component: 'research-container',
                            'part-of': 'my-study',
                            instance: '123',
                            'managed-by': 'setup-app',
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
            component: 'research-container',
            'managed-by': 'setup-app',
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
                    component: 'research-container',
                    'managed-by': 'setup-app',
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
                    component: 'research-container',
                    'managed-by': 'setup-app',
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
            component: 'research-container',
            'managed-by': 'setup-app',
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
                            component: 'research-container',
                            'managed-by': 'setup-app',
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
})
