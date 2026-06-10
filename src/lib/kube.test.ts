import { getServiceAccountDir } from '@/tests/unit.helpers'
import * as fs from 'fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
    createKubernetesJob,
    DEFAULT_SERVICE_ACCOUNT_PATH,
    filterDeployments,
    getKubeAPIServiceAccountToken,
    getNamespace,
    initHTTPSTrustStore,
} from './kube'
import { CONTAINER_TYPES, KubernetesJob } from './types'

vi.mock('https', () => ({
    request: vi.fn(),
}))

describe('Get Service Account items', () => {
    beforeEach(async () => {
        process.env.K8S_SERVICEACCOUNT_PATH = getServiceAccountDir()
    })
    it('should read namespace from file and return trimmed value', () => {
        const filePath = `${process.env.K8S_SERVICEACCOUNT_PATH}/namespace`
        expect(fs.existsSync(filePath)).toBe(true)
        const result = getNamespace()
        expect(result).toBe('mock-namespace')
    })

    it('should throw an error if the namespace file does not exist', () => {
        const filePath = `${DEFAULT_SERVICE_ACCOUNT_PATH}/namespace`
        delete process.env.K8S_SERVICEACCOUNT_PATH
        expect(fs.existsSync(filePath)).toBe(false)
        expect(() => getNamespace()).toThrow(`Namespace file not found!`)
    })

    it('should read token from file and return trimmed value', () => {
        const filePath = `${process.env.K8S_SERVICEACCOUNT_PATH}/token`
        expect(fs.existsSync(filePath)).toBe(true)
        const result = getKubeAPIServiceAccountToken()
        expect(result).toBe('mock-token')
    })

    it('should throw an error if the token file does not exist', () => {
        const filePath = `${DEFAULT_SERVICE_ACCOUNT_PATH}/token`
        delete process.env.K8S_SERVICEACCOUNT_PATH
        expect(fs.existsSync(filePath)).toBe(false)
        expect(() => getKubeAPIServiceAccountToken()).toThrow(`Token file not found!`)
    })

    it('should initialize the https trust store', () => {
        const filePath = `${process.env.K8S_SERVICEACCOUNT_PATH}/ca.crt`
        expect(fs.existsSync(filePath)).toBe(true)
        expect(() => initHTTPSTrustStore).not.toThrow()
    })

    it('should throw an error if the certificate file does not exist', () => {
        const filePath = `${DEFAULT_SERVICE_ACCOUNT_PATH}/ca.crt`
        delete process.env.K8S_SERVICEACCOUNT_PATH
        expect(fs.existsSync(filePath)).toBe(false)
        expect(() => initHTTPSTrustStore()).toThrow(`Certificate file not found!`)
    })

    it('createKubernetesJob: should return a Kubernetes job object with the correct properties', () => {
        const imageLocation = 'my-image'
        const jobId = '1234567890'
        const studyTitle = 'My Study Title'
        const toaEndpointWithJobId = 'https://example.com/toa?job_id=1234567890'

        const job = createKubernetesJob(imageLocation, jobId, studyTitle, toaEndpointWithJobId)

        expect(job).toEqual({
            apiVersion: 'batch/v1',
            kind: 'Job',
            metadata: {
                name: `research-container-${jobId}`,
                namespace: getNamespace(),
                labels: {
                    app: `research-container-${jobId}`,
                    component: CONTAINER_TYPES.RESEARCH_CONTAINER,
                    'part-of': 'my_study_title',
                    instance: jobId,
                    'managed-by': CONTAINER_TYPES.SETUP_APP,
                },
            },
            spec: {
                template: {
                    metadata: {
                        labels: {
                            app: `research-container-${jobId}`,
                            component: CONTAINER_TYPES.RESEARCH_CONTAINER,
                            'part-of': 'my_study_title',
                            instance: jobId,
                            'managed-by': CONTAINER_TYPES.SETUP_APP,
                            role: 'toa-access',
                        },
                    },
                    spec: {
                        containers: [
                            {
                                name: `research-container-${jobId}`,
                                image: imageLocation,
                                ports: [],
                                env: [
                                    {
                                        name: 'TRUSTED_OUTPUT_ENDPOINT',
                                        value: toaEndpointWithJobId,
                                    },
                                ],
                            },
                        ],
                        restartPolicy: 'Never',
                        imagePullSecrets: [{ name: 'si-docker-config' }],
                    },
                },
            },
        })
    })

    it('createKubernetesJob: GCP path stamps serviceAccountName and injects BigQuery env', () => {
        process.env.RESEARCH_SERVICE_ACCOUNT = 'research-sa'
        process.env.GCP_PROJECT = 'my-project'
        process.env.BQ_DATASET = 'enclave_data_dev'
        process.env.BQ_TABLE = 'events'
        process.env.GCP_BILLING_PROJECT = 'billing-project'

        const job = createKubernetesJob('my-image', '42', 'Study', 'https://toa/42')
        const podSpec = job.spec.template.spec as {
            serviceAccountName?: string
            containers: Array<{ env: Array<{ name: string; value: string }> }>
        }

        expect(podSpec.serviceAccountName).toBe('research-sa')
        const env = podSpec.containers[0].env
        expect(env).toContainEqual({ name: 'TRUSTED_OUTPUT_ENDPOINT', value: 'https://toa/42' })
        expect(env).toContainEqual({ name: 'GCP_PROJECT', value: 'my-project' })
        expect(env).toContainEqual({ name: 'BQ_DATASET', value: 'enclave_data_dev' })
        expect(env).toContainEqual({ name: 'BQ_TABLE', value: 'events' })
        expect(env).toContainEqual({ name: 'GCP_BILLING_PROJECT', value: 'billing-project' })
    })

    it('createKubernetesJob: omits serviceAccountName and BigQuery env on the non-GCP path', () => {
        const job = createKubernetesJob('my-image', '42', 'Study', 'https://toa/42')
        const podSpec = job.spec.template.spec as {
            serviceAccountName?: string
            containers: Array<{ env: Array<{ name: string; value: string }> }>
        }

        expect(podSpec.serviceAccountName).toBeUndefined()
        expect(podSpec.containers[0].env).toEqual([{ name: 'TRUSTED_OUTPUT_ENDPOINT', value: 'https://toa/42' }])
    })

    it('filterDeployments: filters deployments by labels', () => {
        const deployments: KubernetesJob[] = [
            {
                metadata: {
                    name: 'test',
                    namespace: 'test',
                    labels: {
                        studyId: 'ABC123',
                        jobId: 'XYZ789',
                    },
                },
                spec: {
                    selector: {
                        matchLabels: {
                            studyId: 'ABC123',
                            jobId: 'XYZ789',
                        },
                    },
                    template: {
                        spec: {
                            containers: [
                                {
                                    name: 'ABC123',
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
                    name: 'test',
                    namespace: 'test',
                    labels: {
                        studyId: 'DEF456',
                        jobId: 'IJK123',
                    },
                },
                spec: {
                    selector: {
                        matchLabels: {
                            studyId: 'DEF456',
                            jobId: 'IJK123',
                        },
                    },
                    template: {
                        spec: {
                            containers: [
                                {
                                    name: 'DEF456',
                                },
                            ],
                        },
                    },
                },
                status: {
                    conditions: [
                        {
                            type: 'Completed',
                            status: 'True',
                        },
                    ],
                },
            },
        ]

        const filteredDeployments = filterDeployments(deployments, { studyId: 'ABC123', jobId: 'XYZ789' })

        expect(filteredDeployments).toHaveLength(1)
        expect(filteredDeployments[0].metadata.labels.studyId).toBe('ABC123')
    })

    it('filterDeployments: return empty if deployments is empty', () => {
        const deployments: KubernetesJob[] = []
        const filteredDeployments = filterDeployments(deployments, { studyId: 'ABC123', jobId: 'XYZ789' })

        expect(filteredDeployments).toHaveLength(0)
    })
})
