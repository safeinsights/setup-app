import { describe, expect, it, vi } from 'vitest'
import * as api from './api'
import * as kube from './kube'
import { KubernetesEnclave } from './kube-enclave'
import { KubernetesJob } from './types'

vi.mock('./kube')
vi.mock('./api')

describe('KubernetesEnclave', () => {
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
                            },
                        ],
                        env: [
                            {
                                name: 'TRUSTED_OUTPUT_ENDPOINT',
                                value: 'http://example.com/job/123',
                            },
                        ],
                        restartPolicy: 'Never',
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

        const result = await enclave.getRunningStudies()

        expect(result).toEqual([{ items: [] }])
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
            },
            status: {
                active: 1,
                startTime: 'startTime',
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
            },
            status: {
                active: 0,
                startTime: 'startTime',
            },
        }
        const jobs = [completed, running]

        const enclave = new KubernetesEnclave()
        const getAllStudiesInEnclave = vi.spyOn(enclave, 'getAllStudiesInEnclave').mockResolvedValue([{ items: jobs }])
        const filterDeployments = vi.mocked(kube.filterDeployments).mockReturnValue([running])

        const result = await enclave.getRunningStudies()

        expect(result).toEqual([{ items: [running] }])
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

        expect(jobs).toEqual([{ items: [] }])
        expect(k8sApiCall).toHaveBeenCalledWith('batch', 'jobs', 'GET')
    })
    it('getAllStudiesInEnclave: should return a list of jobs if they exist', async () => {
        const jobs: KubernetesJob = {
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
            },
            status: {
                active: 1,
                startTime: 'startTime',
            },
        }

        const k8sApiCall = vi.mocked(api.k8sApiCall).mockResolvedValue(jobs)
        const enclave = new KubernetesEnclave()
        const result = await enclave.getAllStudiesInEnclave()

        expect(result).toEqual([jobs])
        expect(k8sApiCall).toHaveBeenCalledWith('batch', 'jobs', 'GET')
    })
})
