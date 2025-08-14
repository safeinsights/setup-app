import { describe, expect, it, vi } from 'vitest'
import * as acj from './aws-check-jobs'
import { checkForErroredJobs } from './check-jobs'
import { DockerEnclave } from './docker-enclave'
import { KubernetesEnclave } from './kube-enclave'

vi.mock('./aws-check-jobs')
describe('checkForErroredJobs', () => {
    it('should call checkForAWSErroredJobs when deployment environment is AWS', async () => {
        process.env.DEPLOYMENT_ENVIRONMENT = 'AWS'
        const checkForAWSErroredJobsMock = vi.mocked(acj.checkForAWSErroredJobs)
        await checkForErroredJobs()
        expect(checkForAWSErroredJobsMock).toHaveBeenCalled()
    })
    it('should call docker error check when deployment environment is DOCKER', async () => {
        process.env.DEPLOYMENT_ENVIRONMENT = 'DOCKER'
        const checkForDockerErroredJobsMock = vi.spyOn(DockerEnclave.prototype, 'checkForErroredJobs')
        await checkForErroredJobs()
        expect(checkForDockerErroredJobsMock).toHaveBeenCalled()
    })

    it('should call kubernetes error check when deployment environment is Kubernetes', async () => {
        process.env.DEPLOYMENT_ENVIRONMENT = 'KUBERNETES'
        const checkForKubernetesErroredJobsMock = vi.spyOn(KubernetesEnclave.prototype, 'checkForErroredJobs')
        await expect(checkForErroredJobs()).rejects.toThrow('Namespace file not found!')
        expect(checkForKubernetesErroredJobsMock).toHaveBeenCalled()
    })
    it('should throw an error when deployment environment is unsupported', async () => {
        process.env.DEPLOYMENT_ENVIRONMENT = 'TEST'
        await expect(checkForErroredJobs()).rejects.toThrow('Unsupported deployment environment: TEST')
    })
})
