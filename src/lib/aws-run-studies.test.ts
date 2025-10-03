import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as api from './api'
import * as aws from './aws'
import { JOB_ID_TAG_KEY } from './aws'
import { runAWSStudies } from './aws-run-studies'
import { ManagementAppGetReadyStudiesResponse, TOAGetJobsResponse } from './types'

vi.mock('./api')
vi.mock('./aws')

const mockManagementAppResponseGenerator = (jobIds: string[]): ManagementAppGetReadyStudiesResponse => {
    const jobs = []
    for (const jobId of jobIds) {
        jobs.push({
            jobId: jobId,
            title: 'mockTitle',
            containerLocation: 'mockContainerLocation',
        })
    }
    return { jobs }
}

// Tests
describe('runStudies()', () => {
    beforeEach(() => {
        const jobId_inTOA = 'job-in-TOA'
        const jobId_inAWS = 'running-in-AWS-env'
        const jobId1 = 'to-be-run-1'
        const jobId2 = 'to-be-run-2'

        // mock response from management app
        const mockManagementAppResponse = mockManagementAppResponseGenerator([jobId1, jobId_inTOA, jobId_inAWS, jobId2])
        // from TOA
        const mockTOAResponse: TOAGetJobsResponse = {
            // resolve from toaGetJobsRequest
            jobs: [{ jobId: jobId_inTOA }],
        }

        const mockManagementAppApiCall = vi.mocked(api.managementAppGetReadyStudiesRequest)
        mockManagementAppApiCall.mockResolvedValue(mockManagementAppResponse)

        const mockTOAApiCall = vi.mocked(api.toaGetJobsRequest)
        mockTOAApiCall.mockResolvedValue(mockTOAResponse)

        // Mock AWS API
        vi.mocked(aws.getAllTasksWithJobId).mockResolvedValue([])
        vi.mocked(aws.getAllTaskDefinitionsWithJobId).mockResolvedValue([
            {
                ResourceARN: jobId_inAWS,
                Tags: [{ Key: JOB_ID_TAG_KEY, Value: jobId_inAWS }],
            },
        ])

        vi.mocked(aws.getECSTaskDefinition).mockImplementation(async (_, taskDefinition: string) => {
            return {
                $metadata: {},
                taskDefinition: {
                    family: `${taskDefinition}`,
                },
            }
        })

        vi.mocked(aws.registerECSTaskDefinition).mockImplementation(
            async (_client, _baseTaskDefinition, familyName: string, _toaEndpointWithJobId, _imageLocation, _tags) => {
                return {
                    $metadata: {},
                    taskDefinition: {
                        family: `${familyName}-registered`,
                    },
                }
            },
        )
    })

    it('makes calls to update the AWS environment (launch studies & garbage collect) as well as TOA', async () => {
        const mockToaUpdateJobStatus = vi.mocked(api.toaUpdateJobStatus)
        await runAWSStudies({ ignoreAWSJobs: false })

        // Make sure calls to run tasks were made
        const runECSFargateTaskCalls = vi.mocked(aws.runECSFargateTask).mock.calls
        expect(runECSFargateTaskCalls.length).toBe(2)
        expect(runECSFargateTaskCalls[0]).toContain('MOCK_BASE_TASK_DEF_FAMILY-to-be-run-1-registered')
        expect(runECSFargateTaskCalls[1]).toContain('MOCK_BASE_TASK_DEF_FAMILY-to-be-run-2-registered')
        expect(mockToaUpdateJobStatus).toHaveBeenCalledTimes(2)
        expect(mockToaUpdateJobStatus).toHaveBeenNthCalledWith(1, 'to-be-run-1', {
            status: 'JOB-PROVISIONING',
        })
        expect(mockToaUpdateJobStatus).toHaveBeenNthCalledWith(2, 'to-be-run-2', {
            status: 'JOB-PROVISIONING',
        })
    })

    it('ignores AWS jobs if ignoreAWS set to true', async () => {
        await runAWSStudies({ ignoreAWSJobs: true })

        // Expect # of calls to be different
        const runECSFargateTaskCalls = vi.mocked(aws.runECSFargateTask).mock.calls
        expect(runECSFargateTaskCalls.length).toBe(3)
        expect(runECSFargateTaskCalls[0]).toContain('MOCK_BASE_TASK_DEF_FAMILY-to-be-run-1-registered')
        expect(runECSFargateTaskCalls[1]).toContain('MOCK_BASE_TASK_DEF_FAMILY-running-in-AWS-env-registered')
        expect(runECSFargateTaskCalls[2]).toContain('MOCK_BASE_TASK_DEF_FAMILY-to-be-run-2-registered')
    })
})
