import { vi, describe, it, expect, beforeEach } from 'vitest'
import { runStudies } from './run-studies'
import * as api from './api'
import * as aws from './aws'
import { GetResourcesCommandOutput } from '@aws-sdk/client-resource-groups-tagging-api'
import { RUN_ID_TAG_KEY } from './aws'
import { ManagementAppGetRunnableStudiesResponse, TOAGetRunsResponse } from './types'

vi.mock('./api')
vi.mock('./aws')

const mockManagementAppResponseGenerator = (runIds: string[]): ManagementAppGetRunnableStudiesResponse => {
    let runs = []
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

        // Mock response when querying for a resource with the given run ids
        vi.mocked(aws.getTaskResourcesByRunId).mockImplementation(
            async (_, runId: string): Promise<GetResourcesCommandOutput> => {
                if (runId === runId_inAWS) {
                    // indicate the run is present
                    return {
                        $metadata: {},
                        ResourceTagMappingList: [{}],
                    }
                } else {
                    // indicate there is no resource with the given run ID
                    return {
                        $metadata: {},
                        ResourceTagMappingList: [],
                    }
                }
            },
        )

        // Mock getAllTaskDefinitionsWithRunId
        vi.mocked(aws.getAllTaskDefinitionsWithRunId).mockResolvedValue({
            $metadata: {},
            ResourceTagMappingList: [
                {
                    ResourceARN: runId_inAWS,
                    Tags: [{ Key: RUN_ID_TAG_KEY, Value: runId_inAWS }],
                },
                {
                    ResourceARN: runId_toGarbageCollect,
                    Tags: [{ Key: RUN_ID_TAG_KEY, Value: runId_toGarbageCollect }],
                },
            ],
        })

        // Mock getECSTaskDefinition
        vi.mocked(aws.getECSTaskDefinition).mockImplementation(async (_, taskDefinition: string) => {
            return {
                $metadata: {},
                taskDefinition: {
                    family: `${taskDefinition}`,
                },
            }
        })

        // Mock registerECSTaskDefinition
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

    it('makes calls to update the AWS environment: launch studies & garbage collect', async () => {
        await runStudies({ ignoreAWSRuns: false })

        // Make sure calls to delete task definitions were made
        const deleteECSTaskDefinitionsCalls = vi.mocked(aws.deleteECSTaskDefinitions).mock.calls
        expect(deleteECSTaskDefinitionsCalls[0][1]).toEqual(['run-finished'])

        // Make sure calls to run tasks were made
        const runECSFargateTaskCalls = vi.mocked(aws.runECSFargateTask).mock.calls
        expect(runECSFargateTaskCalls.length).toBe(2)
        expect(runECSFargateTaskCalls[0]).toContain('MOCK_BASE_TASK_DEF_FAMILY-to-be-run-1-registered')
        expect(runECSFargateTaskCalls[1]).toContain('MOCK_BASE_TASK_DEF_FAMILY-to-be-run-2-registered')
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
