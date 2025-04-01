import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import * as aws from './aws-run-studies'
import { runStudies } from './run-studies'
import { DockerEnclave } from './docker-enclave'
import { KubernetesEnclave } from './kube-enclave'

// Mocking the external functions
vi.mock('./aws-run-studies')
vi.mock('./kube-run-studies')

describe('runStudies', () => {
    const originalEnv = process.env

    beforeEach(() => {
        // Reset environment variables before each test
        process.env = { ...originalEnv }
        // Clear all mocks
        vi.clearAllMocks()
    })

    afterAll(() => {
        // Restore the original environment variables
        process.env = originalEnv
    })

    it('should call runAWSStudies when DEPLOYMENT_ENVIRONMENT is AWS', async () => {
        process.env.DEPLOYMENT_ENVIRONMENT = 'AWS'
        const options = { ignoreAWSJobs: false }

        await runStudies(options)

        expect(aws.runAWSStudies).toHaveBeenCalledWith(options)
    })

    it('should throw an error for unsupported DEPLOYMENT_ENVIRONMENT', async () => {
        process.env.DEPLOYMENT_ENVIRONMENT = 'UNKNOWN'
        const options = { ignoreAWSJobs: false }

        await expect(() => runStudies(options)).rejects.toThrow('Unsupported deployment environment: UNKNOWN')

        expect(aws.runAWSStudies).not.toHaveBeenCalled()
    })

    it('should pass the correct options to runAWSStudies when ignoreAWSJobs is true', async () => {
        process.env.DEPLOYMENT_ENVIRONMENT = 'AWS'
        const options = { ignoreAWSJobs: true }

        await runStudies(options)

        expect(aws.runAWSStudies).toHaveBeenCalledWith(options)
    })

    it('should call docker launchstudy when deployment environment is DOCKER', async () => {
        process.env.DEPLOYMENT_ENVIRONMENT = 'DOCKER'
        const dockerRunStudies = vi.spyOn(DockerEnclave.prototype, 'runStudies').mockImplementation(() => {
            return Promise.resolve()
        })
        await runStudies({ ignoreAWSJobs: false })
        expect(dockerRunStudies).toHaveBeenCalled()
    })

    it('should call kubernetes launchstudy when deployment environment is Kubernetes', async () => {
        process.env.DEPLOYMENT_ENVIRONMENT = 'KUBERNETES'
        const kubernetesRunStudies = vi.spyOn(KubernetesEnclave.prototype, 'runStudies').mockImplementation(() => {
            return Promise.resolve()
        })
        await runStudies({ ignoreAWSJobs: false })
        expect(kubernetesRunStudies).toHaveBeenCalled()
    })
})
