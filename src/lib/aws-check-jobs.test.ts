import { vi, describe, it, expect, beforeEach } from 'vitest'
import { checkForAWSErroredJobs } from './aws-check-jobs'
import * as api from './api'
import * as aws from './aws'
import { ECSClient, TaskStopCode } from '@aws-sdk/client-ecs'

vi.mock('./api')
vi.mock('./aws')

describe('checkForErroredJobs()', () => {
    beforeEach(() => {
        vi.mocked(api.managementAppGetReadyStudiesRequest).mockResolvedValue({ jobs: [] })
        vi.mocked(aws.getAllTaskDefinitionsWithJobId).mockResolvedValue([
            {
                ResourceARN: 'run-finished',
                Tags: [{ Key: 'jobId', Value: 'run-finished' }],
            },
        ])
    })

    it('exits early if there are no tasks with jobId tag', async () => {
        vi.mocked(aws.getAllTasksWithJobId).mockResolvedValue([])

        const mockDescribeECSTasks = vi.mocked(aws.describeECSTasks)
        await checkForAWSErroredJobs()

        expect(mockDescribeECSTasks).not.toHaveBeenCalled()
        const deleteECSTaskDefinitionsCalls = vi.mocked(aws.deleteECSTaskDefinitions).mock.calls
        expect(deleteECSTaskDefinitionsCalls[0][1]).toEqual(['run-finished'])
    })
    it('makes call to TOA for task that fails to start', async () => {
        vi.mocked(aws.getAllTasksWithJobId).mockResolvedValue([
            {
                ResourceARN: 'arn1',
            },
            {
                ResourceARN: 'arn2',
            },
        ])

        const mockDescribeECSTasks = vi.mocked(aws.describeECSTasks)
        const mockToaUpdateJobStatus = vi.mocked(api.toaUpdateJobStatus)
        const mockTask = {
            stopCode: TaskStopCode.TASK_FAILED_TO_START,
            tags: [
                {
                    key: aws.JOB_ID_TAG_KEY,
                    value: 'jobId1',
                },
            ],
        }
        mockDescribeECSTasks.mockResolvedValue({
            tasks: [mockTask],
            $metadata: {},
        })

        await checkForAWSErroredJobs()

        expect(mockDescribeECSTasks).toHaveBeenCalledOnce()
        expect(mockDescribeECSTasks).toHaveBeenCalledWith(expect.any(ECSClient), 'MOCK_ECS_CLUSTER', ['arn1', 'arn2'])
        expect(mockToaUpdateJobStatus).toHaveBeenCalledOnce()
        expect(mockToaUpdateJobStatus).toHaveBeenLastCalledWith('jobId1', {
            status: 'JOB-ERRORED',
            message: 'Task failed to start',
        })
        expect(vi.mocked(aws.deleteECSTaskDefinitions)).toHaveBeenCalledOnce()
    })
    it('makes call to TOA for task that exits with non-zero exit code', async () => {
        vi.mocked(aws.getAllTasksWithJobId).mockResolvedValue([
            {
                ResourceARN: 'arn1',
            },
            {
                ResourceARN: 'arn2',
            },
        ])

        const mockDescribeECSTasks = vi.mocked(aws.describeECSTasks)
        const mockToaUpdateJobStatus = vi.mocked(api.toaUpdateJobStatus)
        const mockTask = {
            containers: [{ exitCode: 1 }],
            stopCode: TaskStopCode.ESSENTIAL_CONTAINER_EXITED,
            tags: [
                {
                    key: aws.JOB_ID_TAG_KEY,
                    value: 'jobId1',
                },
            ],
            taskArn: 'testArn',
            taskDefinitionArn: 'testTaskDefArn',
        }
        mockDescribeECSTasks.mockResolvedValue({
            tasks: [mockTask],
            $metadata: {},
        })
        vi.mocked(api.managementAppGetJobStatus).mockResolvedValue({
            status: 'teststatus',
        })

        await checkForAWSErroredJobs()

        expect(mockDescribeECSTasks).toHaveBeenCalledOnce()
        expect(mockDescribeECSTasks).toHaveBeenCalledWith(expect.any(ECSClient), 'MOCK_ECS_CLUSTER', ['arn1', 'arn2'])
        expect(mockToaUpdateJobStatus).toHaveBeenCalledOnce()
        expect(mockToaUpdateJobStatus).toHaveBeenLastCalledWith('jobId1', {
            status: 'JOB-ERRORED',
            message: 'Task container stopped with non-zero exit code',
        })
        expect(vi.mocked(aws.deleteECSTaskDefinitions)).toHaveBeenCalledOnce()
    })
    it('does not make call to TOA for task that exits with zero exit code', async () => {
        vi.mocked(aws.getAllTasksWithJobId).mockResolvedValue([
            {
                ResourceARN: 'arn1',
            },
            {
                ResourceARN: 'arn2',
            },
        ])

        const mockDescribeECSTasks = vi.mocked(aws.describeECSTasks)
        const mockToaUpdateJobStatus = vi.mocked(api.toaUpdateJobStatus)
        const mockTask = {
            containers: [{ exitCode: 0 }],
            stopCode: TaskStopCode.ESSENTIAL_CONTAINER_EXITED,
            tags: [
                {
                    key: aws.JOB_ID_TAG_KEY,
                    value: 'jobId1',
                },
            ],
        }
        mockDescribeECSTasks.mockResolvedValue({
            tasks: [mockTask],
            $metadata: {},
        })

        await checkForAWSErroredJobs()

        expect(mockDescribeECSTasks).toHaveBeenCalledOnce()
        expect(mockDescribeECSTasks).toHaveBeenCalledWith(expect.any(ECSClient), 'MOCK_ECS_CLUSTER', ['arn1', 'arn2'])
        expect(mockToaUpdateJobStatus).not.toHaveBeenCalled()
        expect(vi.mocked(aws.deleteECSTaskDefinitions)).toHaveBeenCalledOnce()
    })
    it('avoids duplicating calls to TOA for the same jobId', async () => {
        vi.mocked(aws.getAllTasksWithJobId).mockResolvedValue([
            {
                ResourceARN: 'arn1',
            },
            {
                ResourceARN: 'arn2',
            },
        ])

        const mockDescribeECSTasks = vi.mocked(aws.describeECSTasks)
        const mockToaUpdateJobStatus = vi.mocked(api.toaUpdateJobStatus)
        const mockTask = {
            containers: [{ exitCode: 1 }],
            stopCode: TaskStopCode.ESSENTIAL_CONTAINER_EXITED,
            tags: [
                {
                    key: aws.JOB_ID_TAG_KEY,
                    value: 'jobId1',
                },
            ],
            taskArn: 'testArn',
        }
        mockDescribeECSTasks.mockResolvedValue({
            tasks: [mockTask],
            $metadata: {},
        })
        vi.mocked(api.managementAppGetJobStatus).mockResolvedValue({
            status: 'JOB-ERRORED',
        })

        await checkForAWSErroredJobs()

        expect(mockToaUpdateJobStatus).not.toHaveBeenCalled()
        expect(vi.mocked(aws.deleteECSTaskDefinitions)).toHaveBeenCalledOnce()
    })
    it('behaves gracefully when describeECSTasks returns undefined tasks', async () => {
        vi.mocked(aws.getAllTasksWithJobId).mockResolvedValue([
            {
                ResourceARN: 'arn1',
            },
            {
                ResourceARN: 'arn2',
            },
        ])

        const mockDescribeECSTasks = vi.mocked(aws.describeECSTasks)
        const mockToaUpdateJobStatus = vi.mocked(api.toaUpdateJobStatus)

        mockDescribeECSTasks.mockResolvedValue({
            tasks: undefined,
            $metadata: {},
        })

        await checkForAWSErroredJobs()

        expect(mockDescribeECSTasks).toHaveBeenCalledOnce()
        expect(mockDescribeECSTasks).toHaveBeenCalledWith(expect.any(ECSClient), 'MOCK_ECS_CLUSTER', ['arn1', 'arn2'])
        expect(mockToaUpdateJobStatus).not.toHaveBeenCalled()
        expect(vi.mocked(aws.deleteECSTaskDefinitions)).toHaveBeenCalledOnce()
    })
    it('behaves gracefully if stopped task has no container data', async () => {
        vi.mocked(aws.getAllTasksWithJobId).mockResolvedValue([
            {
                ResourceARN: 'arn1',
            },
            {
                ResourceARN: 'arn2',
            },
        ])

        const mockDescribeECSTasks = vi.mocked(aws.describeECSTasks)
        const mockToaUpdateJobStatus = vi.mocked(api.toaUpdateJobStatus)
        const mockTask = {
            containers: undefined,
            stopCode: TaskStopCode.ESSENTIAL_CONTAINER_EXITED,
            tags: [
                {
                    key: aws.JOB_ID_TAG_KEY,
                    value: 'jobId1',
                },
            ],
        }
        mockDescribeECSTasks.mockResolvedValue({
            tasks: [mockTask],
            $metadata: {},
        })

        await checkForAWSErroredJobs()

        expect(mockDescribeECSTasks).toHaveBeenCalledOnce()
        expect(mockDescribeECSTasks).toHaveBeenCalledWith(expect.any(ECSClient), 'MOCK_ECS_CLUSTER', ['arn1', 'arn2'])
        expect(mockToaUpdateJobStatus).not.toHaveBeenCalled()
        expect(vi.mocked(aws.deleteECSTaskDefinitions)).toHaveBeenCalledOnce()
    })
})
