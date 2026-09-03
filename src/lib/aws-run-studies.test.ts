import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as api from './api'
import * as aws from './aws'
import { JOB_ID_TAG_KEY, MANAGEMENT_APP_TAG_KEY, RESEARCHER_ID_TAG_KEY } from './aws'
import { runAWSStudies } from './aws-run-studies'
import { ManagementAppGetReadyStudiesResponse } from './types'

vi.mock('./api')
vi.mock('./aws')

const mockManagementAppResponseGenerator = (jobIds: string[]): ManagementAppGetReadyStudiesResponse => {
    const jobs = []
    for (const jobId of jobIds) {
        jobs.push({
            jobId: jobId,
            researcherId: 'mockResearcherId',
            title: 'mockTitle',
            containerLocation: 'mockContainerLocation',
        })
    }
    return { jobs }
}

// Tests
describe('runStudies()', () => {
    beforeEach(() => {
        const jobId_inAWS = 'running-in-AWS-env'
        const jobId1 = 'to-be-run-1'
        const jobId2 = 'to-be-run-2'

        // mock response from management app
        const mockManagementAppResponse = mockManagementAppResponseGenerator([jobId1, jobId_inAWS, jobId2])

        const mockManagementAppApiCall = vi.mocked(api.managementAppGetReadyStudiesRequest)
        mockManagementAppApiCall.mockResolvedValue(mockManagementAppResponse)

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
            async (
                _client,
                _baseTaskDefinition,
                familyName: string,
                _toaEndpointWithJobId,
                _imageLocation,
                _logStreamPrefix,
                _tags,
            ) => {
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

        // Both the task definition and the task are tagged with our management app,
        // which is what scopes the AWS lookups to this enclave
        const expectedTags = [
            { key: JOB_ID_TAG_KEY, value: 'to-be-run-1' },
            { key: RESEARCHER_ID_TAG_KEY, value: 'mockResearcherId' },
            { key: MANAGEMENT_APP_TAG_KEY, value: 'https://bma:12345=openstax' },
        ]
        expect(vi.mocked(aws.registerECSTaskDefinition).mock.calls[0]).toContainEqual(expectedTags)
        expect(runECSFargateTaskCalls[0]).toContainEqual(expectedTags)

        // Both lookups are scoped to our own management app
        expect(vi.mocked(aws.getAllTasksWithJobId)).toHaveBeenCalledWith(
            expect.anything(),
            'https://bma:12345=openstax',
        )
        expect(vi.mocked(aws.getAllTaskDefinitionsWithJobId)).toHaveBeenCalledWith(
            expect.anything(),
            'https://bma:12345=openstax',
        )
        expect(mockToaUpdateJobStatus).toHaveBeenCalledTimes(2)
        expect(mockToaUpdateJobStatus).toHaveBeenNthCalledWith(1, 'to-be-run-1', {
            status: 'JOB-PROVISIONING',
        })
        expect(mockToaUpdateJobStatus).toHaveBeenNthCalledWith(2, 'to-be-run-2', {
            status: 'JOB-PROVISIONING',
        })
    })

    it('reports a failed job and continues launching the rest of the cycle', async () => {
        const mockToaUpdateJobStatus = vi.mocked(api.toaUpdateJobStatus)

        // Fail the middle job only, so we cover both a preceding and a following job
        vi.mocked(aws.registerECSTaskDefinition).mockImplementation(
            async (_client, _baseTaskDefinition, familyName: string) => {
                if (familyName.includes('running-in-AWS-env')) {
                    throw new Error('AWS throttled RegisterTaskDefinition')
                }
                return {
                    $metadata: {},
                    taskDefinition: {
                        family: `${familyName}-registered`,
                    },
                }
            },
        )

        await expect(runAWSStudies({ ignoreAWSJobs: true })).resolves.toBeUndefined()

        // The jobs either side of the failure still launched
        const runECSFargateTaskCalls = vi.mocked(aws.runECSFargateTask).mock.calls
        expect(runECSFargateTaskCalls.length).toBe(2)
        expect(runECSFargateTaskCalls[0]).toContain('MOCK_BASE_TASK_DEF_FAMILY-to-be-run-1-registered')
        expect(runECSFargateTaskCalls[1]).toContain('MOCK_BASE_TASK_DEF_FAMILY-to-be-run-2-registered')

        // The failure is reported to the TOA without leaking the AWS message
        expect(mockToaUpdateJobStatus).toHaveBeenCalledTimes(3)
        expect(mockToaUpdateJobStatus).toHaveBeenNthCalledWith(1, 'to-be-run-1', { status: 'JOB-PROVISIONING' })
        expect(mockToaUpdateJobStatus).toHaveBeenNthCalledWith(2, 'running-in-AWS-env', {
            status: 'JOB-ERRORED',
            message: 'Failed to launch job',
        })
        expect(mockToaUpdateJobStatus).toHaveBeenNthCalledWith(3, 'to-be-run-2', { status: 'JOB-PROVISIONING' })
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
