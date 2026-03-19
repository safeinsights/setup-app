import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as api from './api'
import { managementAppGetReadyStudiesRequest, toaUpdateJobStatus } from './api'
import { Enclave } from './enclave'
import { ManagementAppGetReadyStudiesResponse, ManagementAppJob } from './types'

vi.mock('./api', () => ({
    managementAppGetReadyStudiesRequest: vi.fn(),
    toaUpdateJobStatus: vi.fn(),
}))

describe('Enclave', () => {
    let enclave: Enclave<ManagementAppJob>

    beforeEach(() => {
        enclave = new Enclave<ManagementAppJob>()
    })

    it('should run studies correctly', async () => {
        const mockBmaReadysResults: ManagementAppGetReadyStudiesResponse = {
            jobs: [
                {
                    jobId: 'jobId1',
                    title: 'title1',
                    containerLocation: 'repo1:tag1',
                    researcherId: 'testresearcherid',
                },
                {
                    jobId: 'jobId2',
                    title: 'title2',
                    containerLocation: 'repo1:tag2',
                    researcherId: 'testresearcherid',
                },
            ],
        }

        const mockRunningJobsInEnclave: ManagementAppJob[] = [
            { jobId: '2', title: 'title2', containerLocation: 'repo1:tag2', researcherId: 'testresearcherid' },
        ]

        vi.mocked(api.managementAppGetReadyStudiesRequest).mockResolvedValue(mockBmaReadysResults)

        const jobs = {
            jobs: [
                {
                    jobId: 'jobId1',
                    title: 'title1',
                    containerLocation: 'repo1:tag1',
                    researcherId: 'testresearcherid',
                },
            ],
        }

        enclave.filterJobsInEnclave = vi.fn().mockReturnValue(jobs)

        enclave.launchStudy = vi.fn()
        enclave.cleanup = vi.fn()
        enclave.getDeployedStudies = vi.fn().mockResolvedValue(mockRunningJobsInEnclave)

        await enclave.runStudies()

        expect(managementAppGetReadyStudiesRequest).toHaveBeenCalledOnce()
        expect(enclave.filterJobsInEnclave).toHaveBeenCalledWith(mockBmaReadysResults, mockRunningJobsInEnclave)
        expect(enclave.launchStudy).toHaveBeenCalledTimes(1)
        expect(enclave.launchStudy).toBeCalledWith(
            mockBmaReadysResults.jobs[0],
            `${process.env.TOA_BASE_URL}/api/job/jobId1`,
        )
        expect(toaUpdateJobStatus).toHaveBeenCalledTimes(1)
        expect(toaUpdateJobStatus).toHaveBeenCalledWith('jobId1', { status: 'JOB-PROVISIONING' })
        expect(enclave.cleanup).toHaveBeenCalledOnce()
    })
})
