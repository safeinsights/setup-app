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
import { KubernetesJob } from './types'

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
                    component: 'research-container',
                    'part-of': studyTitle.toLowerCase(),
                    instance: jobId,
                    'managed-by': 'setup-app',
                },
            },
            spec: {
                template: {
                    metadata: {
                        labels: {
                            app: `research-container-${jobId}`,
                            component: 'research-container',
                            'part-of': studyTitle.toLowerCase(),
                            instance: jobId,
                            'managed-by': 'setup-app',
                            role: 'toa-access',
                        },
                    },
                    spec: {
                        containers: [
                            {
                                name: `research-container-${jobId}`,
                                image: imageLocation,
                                ports: [],
                            },
                        ],
                        env: [
                            {
                                name: 'TRUSTED_OUTPUT_ENDPOINT',
                                value: toaEndpointWithJobId,
                            },
                        ],
                        restartPolicy: 'Never',
                    },
                },
            },
        })
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
                },
                status: {
                    active: 1,
                    startTime: 'startTime',
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
                },
                status: {
                    active: 0,
                    startTime: 'startTime',
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
