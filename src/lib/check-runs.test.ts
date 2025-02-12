import { vi, describe, it, expect } from 'vitest'
import { checkForErroredRuns } from './check-runs'
import * as api from './api'
import * as aws from './aws'
import { ECSClient, TaskStopCode } from '@aws-sdk/client-ecs'

vi.mock('./api')
vi.mock('./aws')

describe('checkForErroredRuns()', () => {
    it('exits early if there are no tasks with runId tag', async () => {
        vi.mocked(aws.getAllTasksWithRunId).mockResolvedValue([])

        const mockDescribeECSTasks = vi.mocked(aws.describeECSTasks)
        await checkForErroredRuns()

        expect(mockDescribeECSTasks).not.toHaveBeenCalled()
    })
    it('makes call to TOA for task that fails to start', async () => {
        vi.mocked(aws.getAllTasksWithRunId).mockResolvedValue([
            {
                ResourceARN: 'arn1',
            },
            {
                ResourceARN: 'arn2',
            },
        ])

        const mockDescribeECSTasks = vi.mocked(aws.describeECSTasks)
        const mockToaUpdateRunStatus = vi.mocked(api.toaUpdateRunStatus)
        const mockTask = {
            stopCode: TaskStopCode.TASK_FAILED_TO_START,
            tags: [
                {
                    key: aws.RUN_ID_TAG_KEY,
                    value: 'runId1',
                },
            ],
        }
        mockDescribeECSTasks.mockResolvedValue({
            tasks: [mockTask],
            $metadata: {},
        })

        await checkForErroredRuns()

        expect(mockDescribeECSTasks).toHaveBeenCalledOnce()
        expect(mockDescribeECSTasks).toHaveBeenCalledWith(expect.any(ECSClient), 'MOCK_ECS_CLUSTER', ['arn1', 'arn2'])
        expect(mockToaUpdateRunStatus).toHaveBeenCalledOnce()
        expect(mockToaUpdateRunStatus).toHaveBeenLastCalledWith('runId1', {
            status: 'JOB-ERRORED',
            message: 'Task failed to start',
        })
    })
    it('makes call to TOA for task that exits with non-zero exit code', async () => {
        vi.mocked(aws.getAllTasksWithRunId).mockResolvedValue([
            {
                ResourceARN: 'arn1',
            },
            {
                ResourceARN: 'arn2',
            },
        ])

        const mockDescribeECSTasks = vi.mocked(aws.describeECSTasks)
        const mockToaUpdateRunStatus = vi.mocked(api.toaUpdateRunStatus)
        const mockTask = {
            containers: [{ exitCode: 1 }],
            stopCode: TaskStopCode.ESSENTIAL_CONTAINER_EXITED,
            tags: [
                {
                    key: aws.RUN_ID_TAG_KEY,
                    value: 'runId1',
                },
            ],
        }
        mockDescribeECSTasks.mockResolvedValue({
            tasks: [mockTask],
            $metadata: {},
        })

        await checkForErroredRuns()

        expect(mockDescribeECSTasks).toHaveBeenCalledOnce()
        expect(mockDescribeECSTasks).toHaveBeenCalledWith(expect.any(ECSClient), 'MOCK_ECS_CLUSTER', ['arn1', 'arn2'])
        expect(mockToaUpdateRunStatus).toHaveBeenCalledOnce()
        expect(mockToaUpdateRunStatus).toHaveBeenLastCalledWith('runId1', {
            status: 'JOB-ERRORED',
            message: 'Task container stopped with non-zero exit code',
        })
    })
    it('does not make call to TOA for task that exits with zero exit code', async () => {
        vi.mocked(aws.getAllTasksWithRunId).mockResolvedValue([
            {
                ResourceARN: 'arn1',
            },
            {
                ResourceARN: 'arn2',
            },
        ])

        const mockDescribeECSTasks = vi.mocked(aws.describeECSTasks)
        const mockToaUpdateRunStatus = vi.mocked(api.toaUpdateRunStatus)
        const mockTask = {
            containers: [{ exitCode: 0 }],
            stopCode: TaskStopCode.ESSENTIAL_CONTAINER_EXITED,
            tags: [
                {
                    key: aws.RUN_ID_TAG_KEY,
                    value: 'runId1',
                },
            ],
        }
        mockDescribeECSTasks.mockResolvedValue({
            tasks: [mockTask],
            $metadata: {},
        })

        await checkForErroredRuns()

        expect(mockDescribeECSTasks).toHaveBeenCalledOnce()
        expect(mockDescribeECSTasks).toHaveBeenCalledWith(expect.any(ECSClient), 'MOCK_ECS_CLUSTER', ['arn1', 'arn2'])
        expect(mockToaUpdateRunStatus).not.toHaveBeenCalled()
    })
    it('behaves gracefully when describeECSTasks returns undefined tasks', async () => {
        vi.mocked(aws.getAllTasksWithRunId).mockResolvedValue([
            {
                ResourceARN: 'arn1',
            },
            {
                ResourceARN: 'arn2',
            },
        ])

        const mockDescribeECSTasks = vi.mocked(aws.describeECSTasks)
        const mockToaUpdateRunStatus = vi.mocked(api.toaUpdateRunStatus)

        mockDescribeECSTasks.mockResolvedValue({
            tasks: undefined,
            $metadata: {},
        })

        await checkForErroredRuns()

        expect(mockDescribeECSTasks).toHaveBeenCalledOnce()
        expect(mockDescribeECSTasks).toHaveBeenCalledWith(expect.any(ECSClient), 'MOCK_ECS_CLUSTER', ['arn1', 'arn2'])
        expect(mockToaUpdateRunStatus).not.toHaveBeenCalled()
    })
    it('behaves gracefully if stopped task has no container data', async () => {
        vi.mocked(aws.getAllTasksWithRunId).mockResolvedValue([
            {
                ResourceARN: 'arn1',
            },
            {
                ResourceARN: 'arn2',
            },
        ])

        const mockDescribeECSTasks = vi.mocked(aws.describeECSTasks)
        const mockToaUpdateRunStatus = vi.mocked(api.toaUpdateRunStatus)
        const mockTask = {
            containers: undefined,
            stopCode: TaskStopCode.ESSENTIAL_CONTAINER_EXITED,
            tags: [
                {
                    key: aws.RUN_ID_TAG_KEY,
                    value: 'runId1',
                },
            ],
        }
        mockDescribeECSTasks.mockResolvedValue({
            tasks: [mockTask],
            $metadata: {},
        })

        await checkForErroredRuns()

        expect(mockDescribeECSTasks).toHaveBeenCalledOnce()
        expect(mockDescribeECSTasks).toHaveBeenCalledWith(expect.any(ECSClient), 'MOCK_ECS_CLUSTER', ['arn1', 'arn2'])
        expect(mockToaUpdateRunStatus).not.toHaveBeenCalled()
    })
})
