import { vi, describe, it, expect, beforeEach } from 'vitest'
import { runStudies } from './run-studies'
import * as api from './api'
import * as aws from './aws'
import { RUN_ID_TAG_KEY } from './aws'
import { ManagementAppGetRunnableStudiesResponse, TOAGetRunsResponse } from './types'

vi.mock('./api')
vi.mock('./aws')

const mockManagementAppResponseGenerator = (runIds: string[]): ManagementAppGetRunnableStudiesResponse => {
    const runs = []
    for (const runId of runIds) {
        runs.push({
            runId: runId,
            title: 'mockTitle',
            containerLocation: 'mockContainerLocation',
        })
    }
    return { runs }
}

// Tests
describe('runStudies()', () => {
    beforeEach(() => {
        const runId_inTOA = 'run-in-TOA'
        const runId_inAWS = 'running-in-AWS-env'
        const runId1 = 'to-be-run-1'
        const runId2 = 'to-be-run-2'
        const runId_toGarbageCollect = 'run-finished'

        // mock response from management app
        const mockManagementAppResponse = mockManagementAppResponseGenerator([runId1, runId_inTOA, runId_inAWS, runId2])
        // from TOA
        const mockTOAResponse: TOAGetRunsResponse = {
            // resolve from toaGetRunsRequest
            runs: [{ runId: runId_inTOA }],
        }

        const mockManagementAppApiCall = vi.mocked(api.managementAppGetRunnableStudiesRequest)
        mockManagementAppApiCall.mockResolvedValue(mockManagementAppResponse)

        const mockTOAApiCall = vi.mocked(api.toaGetRunsRequest)
        mockTOAApiCall.mockResolvedValue(mockTOAResponse)

        // Mock AWS API
        vi.mocked(aws.getAllTasksWithRunId).mockResolvedValue([])
        vi.mocked(aws.getAllTaskDefinitionsWithRunId).mockResolvedValue([
            {
                ResourceARN: runId_inAWS,
                Tags: [{ Key: RUN_ID_TAG_KEY, Value: runId_inAWS }],
            },
            {
                ResourceARN: runId_toGarbageCollect,
                Tags: [{ Key: RUN_ID_TAG_KEY, Value: runId_toGarbageCollect }],
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
            async (_client, _baseTaskDefinition, familyName: string, _toaEndpointWithRunId, _imageLocation, _tags) => {
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
        const mockToaUpdateRunStatus = vi.mocked(api.toaUpdateRunStatus)
        await runStudies({ ignoreAWSRuns: false })

        // Make sure calls to delete task definitions were made
        const deleteECSTaskDefinitionsCalls = vi.mocked(aws.deleteECSTaskDefinitions).mock.calls
        expect(deleteECSTaskDefinitionsCalls[0][1]).toEqual(['run-finished'])

        // Make sure calls to run tasks were made
        const runECSFargateTaskCalls = vi.mocked(aws.runECSFargateTask).mock.calls
        expect(runECSFargateTaskCalls.length).toBe(2)
        expect(runECSFargateTaskCalls[0]).toContain('MOCK_BASE_TASK_DEF_FAMILY-to-be-run-1-registered')
        expect(runECSFargateTaskCalls[1]).toContain('MOCK_BASE_TASK_DEF_FAMILY-to-be-run-2-registered')
        expect(mockToaUpdateRunStatus).toHaveBeenCalledTimes(2)
        expect(mockToaUpdateRunStatus).toHaveBeenNthCalledWith(1, 'to-be-run-1', {
            status: 'JOB-PROVISIONING',
        })
        expect(mockToaUpdateRunStatus).toHaveBeenNthCalledWith(2, 'to-be-run-2', {
            status: 'JOB-PROVISIONING',
        })
    })

    it('ignores AWS runs if ignoreAWS set to true', async () => {
        await runStudies({ ignoreAWSRuns: true })

        // Expect # of calls to be different
        const runECSFargateTaskCalls = vi.mocked(aws.runECSFargateTask).mock.calls
        expect(runECSFargateTaskCalls.length).toBe(3)
        expect(runECSFargateTaskCalls[0]).toContain('MOCK_BASE_TASK_DEF_FAMILY-to-be-run-1-registered')
        expect(runECSFargateTaskCalls[1]).toContain('MOCK_BASE_TASK_DEF_FAMILY-running-in-AWS-env-registered')
        expect(runECSFargateTaskCalls[2]).toContain('MOCK_BASE_TASK_DEF_FAMILY-to-be-run-2-registered')
    })
})
