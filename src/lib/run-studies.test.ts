import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import * as aws from './aws-run-studies'
import * as kube from './kube-run-studies'
import { runStudies } from './run-studies'

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
        expect(kube.runK8sStudies).not.toHaveBeenCalled()
    })

    it('should call runK8sStudies when DEPLOYMENT_ENVIRONMENT is KUBERNETES', async () => {
        process.env.DEPLOYMENT_ENVIRONMENT = 'KUBERNETES'
        const options = { ignoreAWSJobs: false }

        await runStudies(options)

        expect(kube.runK8sStudies).toHaveBeenCalled()
        expect(aws.runAWSStudies).not.toHaveBeenCalled()
    })

    it('should throw an error for unsupported DEPLOYMENT_ENVIRONMENT', async () => {
        process.env.DEPLOYMENT_ENVIRONMENT = 'UNKNOWN'
        const options = { ignoreAWSJobs: false }

        await expect(() => runStudies(options)).rejects.toThrow('Unsupported deployment environment: UNKNOWN')

        expect(aws.runAWSStudies).not.toHaveBeenCalled()
        expect(kube.runK8sStudies).not.toHaveBeenCalled()
    })

    it('should pass the correct options to runAWSStudies when ignoreAWSJobs is true', async () => {
        process.env.DEPLOYMENT_ENVIRONMENT = 'AWS'
        const options = { ignoreAWSJobs: true }

        await runStudies(options)

        expect(aws.runAWSStudies).toHaveBeenCalledWith(options)
        expect(kube.runK8sStudies).not.toHaveBeenCalled()
    })
})
