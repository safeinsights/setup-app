import { beforeEach, describe, expect, it, vi } from 'vitest'
import { checkForErroredJobs } from './check-jobs'
import { DockerEnclave } from './docker-enclave'

vi.mock('./docker-enclave')
vi.mock('./check-jobs')
vi.mock('./kube-enclave', async () => {
    const kubeEnclave = await import('./kube-enclave')
    return {
        ...kubeEnclave,
        KubernetesEnclave: class extends kubeEnclave.KubernetesEnclave {
            constructor() {
                super()
                this.checkForErroredJobs = vi.fn().mockImplementation(() => {
                    throw new Error('Method not implemented.')
                })
            }
        },
    }
})

describe('CheckForKubernetesErroredJobs', () => {
    beforeEach(async () => {
        process.env = {
            ...process.env,
            DEPLOYMENT_ENVIRONMENT: 'TEST',
        }
    })
    it('throw not Implemented error for Kubernetes', async () => {
        expect(() => checkForErroredJobs()).toThrow(`Method not implemented.`)
    })
})

describe('CheckForDockerErroredJobs', () => {
    beforeEach(async () => {
        process.env = {
            ...process.env,
            DEPLOYMENT_ENVIRONMENT: 'TEST',
        }
    })
    it('Docker - Check for error jobs', async () => {
        const { DockerEnclave: MockedDockerEnclave } = await import('./docker-enclave')
        const mocked = new MockedDockerEnclave()
        expect(mocked).toBeInstanceOf(DockerEnclave)
    })
})
