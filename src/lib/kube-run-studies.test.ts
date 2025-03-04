import { describe, it, expect, vi, beforeEach } from 'vitest'
import { runK8sStudies, getJobs, deployStudyContainer } from './kube-run-studies'
import * as fs from 'fs'
import * as api from './api'
import { KubernetesJobsResponse } from './types'

// Mocking external functions
vi.mock('./api')
vi.mock('fs')

describe('runK8sStudies', () => {
    const managementAppMockData = {
        jobs: [
            { jobId: 'job1', title: 'Study 1', containerLocation: 'image1' },
            { jobId: 'job2', title: 'Study 2', containerLocation: 'image2' },
        ],
    }

    const toaGetRunsMockData = {
        jobs: [{ jobId: 'job1', result: 'success' }],
    }

    const getJobsMockData: KubernetesJobsResponse = {
        jobs: [
            {
                metadata: {
                    name: 'job1',
                    namespace: 'default',
                    labels: { instance: 'job1' },
                },
                spec: { selector: { matchLabels: { instance: 'job1' } } },
                status: {
                    active: 1,
                    startTime: '2023-04-01T00:00:00Z',
                },
            },
        ],
    }

    beforeEach(() => {
        // Clear all mocks before each test
        vi.clearAllMocks()
    })

    it('should call managementAppGetReadyStudiesRequest, toaGetJobsRequest, and getJobs', async () => {
        vi.mocked(api.managementAppGetReadyStudiesRequest).mockResolvedValue(managementAppMockData)
        vi.mocked(api.toaGetJobsRequest).mockResolvedValue(toaGetRunsMockData)
        vi.mocked(getJobs).mockResolvedValue(getJobsMockData)

        await runK8sStudies()

        expect(api.managementAppGetReadyStudiesRequest).toHaveBeenCalled()
        expect(api.toaGetJobsRequest).toHaveBeenCalled()
    })

    it('should deploy containers for jobs not already deployed', async () => {
        vi.mocked(api.managementAppGetReadyStudiesRequest).mockResolvedValue(managementAppMockData)
        vi.mocked(api.toaGetJobsRequest).mockResolvedValue(toaGetRunsMockData)

        await runK8sStudies()

        expect(deployStudyContainer).toHaveBeenCalledWith('job2', 'Study 2', 'image2')
        expect(deployStudyContainer).not.toHaveBeenCalledWith('job1', 'Study 1', 'image1')
    })

    it('should log the correct messages', async () => {
        vi.mocked(api.managementAppGetReadyStudiesRequest).mockResolvedValue(managementAppMockData)
        vi.mocked(api.toaGetJobsRequest).mockResolvedValue(toaGetRunsMockData)
        vi.mocked(getJobs).mockResolvedValue(getJobsMockData)

        const consoleSpy = vi.spyOn(console, 'log')

        await runK8sStudies()

        expect(consoleSpy).toHaveBeenCalledWith(
            `Found ${managementAppMockData.jobs.length} runs in management app. Run ids: ${managementAppMockData.jobs.map((job) => job.jobId)}`,
        )
        expect(consoleSpy).toHaveBeenCalledWith(
            `Found ${toaGetRunsMockData.jobs.length} runs with results in TOA. Run ids: ${toaGetRunsMockData.jobs.map((job) => job.jobId)}`,
        )
        expect(consoleSpy).toHaveBeenCalledWith(
            `Found ${getJobsMockData.jobs.length} deployments already deployed. Run ids: ${getJobsMockData.jobs.map((job) => job.spec.selector.matchLabels.instance)}`,
        )

        consoleSpy.mockRestore()
    })

    it('should handle no jobs in management app', async () => {
        const emptyManagementAppMockData = { jobs: [] }
        vi.mocked(api.managementAppGetReadyStudiesRequest).mockResolvedValue(emptyManagementAppMockData)
        vi.mocked(api.toaGetJobsRequest).mockResolvedValue(toaGetRunsMockData)
        vi.mocked(getJobs).mockResolvedValue(getJobsMockData)

        await runK8sStudies()

        expect(deployStudyContainer).not.toHaveBeenCalled()
    })

    it('should handle no jobs with results in TOA', async () => {
        const emptyToaGetRunsMockData = { jobs: [] }
        vi.mocked(api.managementAppGetReadyStudiesRequest).mockResolvedValue(managementAppMockData)
        vi.mocked(api.toaGetJobsRequest).mockResolvedValue(emptyToaGetRunsMockData)
        vi.mocked(getJobs).mockResolvedValue(getJobsMockData)

        await runK8sStudies()

        expect(deployStudyContainer).toHaveBeenCalledWith('job2', 'Study 2', 'image2')
        expect(deployStudyContainer).not.toHaveBeenCalledWith('job1', 'Study 1', 'image1')
    })
})
