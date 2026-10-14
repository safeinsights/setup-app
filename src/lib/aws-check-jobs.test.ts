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
        expect(vi.mocked(aws.deleteECSTaskDefinitions)).toHaveBeenCalledOnce()
        const deleteECSTaskDefinitionsCalls = vi.mocked(aws.deleteECSTaskDefinitions).mock.calls
        expect(deleteECSTaskDefinitionsCalls[0][1]).toEqual(['run-finished'])
    })

    it('still cleans up task definitions and rethrows when listing tasks fails', async () => {
        const lookupError = new Error('tagging API unavailable')
        vi.mocked(aws.getAllTasksWithJobId).mockRejectedValue(lookupError)

        await expect(checkForAWSErroredJobs()).rejects.toBe(lookupError)

        expect(vi.mocked(aws.describeECSTasks)).not.toHaveBeenCalled()
        expect(vi.mocked(aws.deleteECSTaskDefinitions)).toHaveBeenCalledOnce()
        expect(vi.mocked(aws.deleteECSTaskDefinitions)).toHaveBeenCalledWith(expect.any(ECSClient), ['run-finished'])
    })

    it('still cleans up task definitions and rethrows when describing tasks fails', async () => {
        const lookupError = new Error('ECS unavailable')
        vi.mocked(aws.getAllTasksWithJobId).mockResolvedValue([{ ResourceARN: 'arn1' }, { ResourceARN: 'arn2' }])
        vi.mocked(aws.describeECSTasks).mockRejectedValue(lookupError)

        await expect(checkForAWSErroredJobs()).rejects.toBe(lookupError)

        expect(vi.mocked(aws.describeECSTasks)).toHaveBeenCalledOnce()
        expect(vi.mocked(api.toaUpdateJobStatus)).not.toHaveBeenCalled()
        expect(vi.mocked(aws.deleteECSTaskDefinitions)).toHaveBeenCalledOnce()
        expect(vi.mocked(aws.deleteECSTaskDefinitions)).toHaveBeenCalledWith(expect.any(ECSClient), ['run-finished'])
    })

    it('rethrows the original lookup error and logs the cleanup error when both fail', async () => {
        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
        const lookupError = new Error('ECS unavailable')
        const cleanupError = new Error('management app unavailable')
        vi.mocked(aws.getAllTasksWithJobId).mockResolvedValue([{ ResourceARN: 'arn1' }])
        vi.mocked(aws.describeECSTasks).mockRejectedValue(lookupError)
        vi.mocked(api.managementAppGetReadyStudiesRequest).mockRejectedValue(cleanupError)

        await expect(checkForAWSErroredJobs()).rejects.toBe(lookupError)

        expect(vi.mocked(api.managementAppGetReadyStudiesRequest)).toHaveBeenCalledOnce()
        expect(vi.mocked(aws.deleteECSTaskDefinitions)).not.toHaveBeenCalled()
        expect(consoleErrorSpy).toHaveBeenCalledWith(
            expect.stringContaining('Failed to clean up task definitions. Cause: Error: management app unavailable'),
        )
    })

    it('propagates a cleanup failure when the lookup succeeds', async () => {
        const cleanupError = new Error('delete failed')
        vi.mocked(aws.getAllTasksWithJobId).mockResolvedValue([])
        vi.mocked(aws.deleteECSTaskDefinitions).mockRejectedValue(cleanupError)

        await expect(checkForAWSErroredJobs()).rejects.toBe(cleanupError)

        expect(vi.mocked(aws.deleteECSTaskDefinitions)).toHaveBeenCalledOnce()
    })

    it('does not look up or clean up anything when a required env var is missing', async () => {
        delete process.env.ECS_CLUSTER

        await expect(checkForAWSErroredJobs()).rejects.toThrow('Env var ECS_CLUSTER not found')

        expect(vi.mocked(aws.getAllTasksWithJobId)).not.toHaveBeenCalled()
        expect(vi.mocked(aws.getAllTaskDefinitionsWithJobId)).not.toHaveBeenCalled()
        expect(vi.mocked(aws.deleteECSTaskDefinitions)).not.toHaveBeenCalled()
    })

    it('only looks at tasks and task definitions from our own management app', async () => {
        vi.mocked(aws.getAllTasksWithJobId).mockResolvedValue([])

        await checkForAWSErroredJobs()

        expect(vi.mocked(aws.getAllTasksWithJobId)).toHaveBeenCalledWith(
            expect.anything(),
            'https://bma:12345=openstax',
        )
        expect(vi.mocked(aws.getAllTaskDefinitionsWithJobId)).toHaveBeenCalledWith(
            expect.anything(),
            'https://bma:12345=openstax',
        )
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
        expect(vi.mocked(aws.getLogsForTask)).toHaveBeenCalledWith('testArn', 'jobId1')
        expect(vi.mocked(aws.deleteECSTaskDefinitions)).toHaveBeenCalledOnce()
    })
    it('still reports JOB-ERRORED, and keeps going, when log retrieval fails', async () => {
        vi.mocked(aws.getAllTasksWithJobId).mockResolvedValue([{ ResourceARN: 'arn1' }, { ResourceARN: 'arn2' }])

        const mockToaUpdateJobStatus = vi.mocked(api.toaUpdateJobStatus)
        const erroredTask = (jobId: string, taskArn: string) => ({
            containers: [{ exitCode: 1 }],
            stopCode: TaskStopCode.ESSENTIAL_CONTAINER_EXITED,
            tags: [{ key: aws.JOB_ID_TAG_KEY, value: jobId }],
            taskArn,
        })
        vi.mocked(aws.describeECSTasks).mockResolvedValue({
            tasks: [erroredTask('jobId1', 'testArn1'), erroredTask('jobId2', 'testArn2')],
            $metadata: {},
        })
        vi.mocked(api.managementAppGetJobStatus).mockResolvedValue({ status: 'teststatus' })
        const testLogs = [{ timestamp: 42, message: 'test log message' }]
        vi.mocked(aws.getLogsForTask)
            .mockRejectedValueOnce(new Error('log group not found'))
            .mockResolvedValue(testLogs)

        await checkForAWSErroredJobs()

        // The failing job is still marked errored, and the second job is unaffected
        expect(mockToaUpdateJobStatus).toHaveBeenCalledTimes(2)
        expect(mockToaUpdateJobStatus).toHaveBeenNthCalledWith(1, 'jobId1', {
            status: 'JOB-ERRORED',
            message: 'Task container stopped with non-zero exit code',
        })
        expect(mockToaUpdateJobStatus).toHaveBeenNthCalledWith(2, 'jobId2', {
            status: 'JOB-ERRORED',
            message: 'Task container stopped with non-zero exit code',
        })
        expect(vi.mocked(api.toaSendLogs)).toHaveBeenCalledOnce()
        expect(vi.mocked(api.toaSendLogs)).toHaveBeenCalledWith('jobId2', testLogs)
        expect(vi.mocked(aws.deleteECSTaskDefinitions)).toHaveBeenCalledOnce()
    })
    it('keeps going when a task has no jobId tag', async () => {
        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
        vi.mocked(aws.getAllTasksWithJobId).mockResolvedValue([{ ResourceARN: 'arn1' }, { ResourceARN: 'arn2' }])

        const mockToaUpdateJobStatus = vi.mocked(api.toaUpdateJobStatus)
        vi.mocked(aws.describeECSTasks).mockResolvedValue({
            tasks: [
                {
                    containers: [{ exitCode: 1 }],
                    stopCode: TaskStopCode.ESSENTIAL_CONTAINER_EXITED,
                    tags: [],
                    taskArn: 'testArn1',
                },
                {
                    containers: [{ exitCode: 1 }],
                    stopCode: TaskStopCode.ESSENTIAL_CONTAINER_EXITED,
                    tags: [{ key: aws.JOB_ID_TAG_KEY, value: 'jobId2' }],
                    taskArn: 'testArn2',
                },
            ],
            $metadata: {},
        })
        vi.mocked(api.managementAppGetJobStatus).mockResolvedValue({ status: 'teststatus' })

        await expect(checkForAWSErroredJobs()).resolves.toBeUndefined()

        expect(mockToaUpdateJobStatus).toHaveBeenCalledOnce()
        expect(mockToaUpdateJobStatus).toHaveBeenCalledWith('jobId2', {
            status: 'JOB-ERRORED',
            message: 'Task container stopped with non-zero exit code',
        })
        expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to process ECS task'))
        expect(vi.mocked(aws.deleteECSTaskDefinitions)).toHaveBeenCalledOnce()
    })
    it('keeps going when fetching job status from the management app fails', async () => {
        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
        vi.mocked(aws.getAllTasksWithJobId).mockResolvedValue([{ ResourceARN: 'arn1' }, { ResourceARN: 'arn2' }])

        const mockToaUpdateJobStatus = vi.mocked(api.toaUpdateJobStatus)
        const erroredTask = (jobId: string, taskArn: string) => ({
            containers: [{ exitCode: 1 }],
            stopCode: TaskStopCode.ESSENTIAL_CONTAINER_EXITED,
            tags: [{ key: aws.JOB_ID_TAG_KEY, value: jobId }],
            taskArn,
        })
        vi.mocked(aws.describeECSTasks).mockResolvedValue({
            tasks: [erroredTask('jobId1', 'testArn1'), erroredTask('jobId2', 'testArn2')],
            $metadata: {},
        })
        vi.mocked(api.managementAppGetJobStatus)
            .mockRejectedValueOnce(new Error('management app unavailable'))
            .mockResolvedValue({ status: 'teststatus' })

        await expect(checkForAWSErroredJobs()).resolves.toBeUndefined()

        expect(mockToaUpdateJobStatus).toHaveBeenCalledOnce()
        expect(mockToaUpdateJobStatus).toHaveBeenCalledWith('jobId2', {
            status: 'JOB-ERRORED',
            message: 'Task container stopped with non-zero exit code',
        })
        expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to process ECS task'))
        expect(vi.mocked(aws.deleteECSTaskDefinitions)).toHaveBeenCalledOnce()
    })
    it('keeps going when updating job status in TOA fails', async () => {
        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
        vi.mocked(aws.getAllTasksWithJobId).mockResolvedValue([{ ResourceARN: 'arn1' }, { ResourceARN: 'arn2' }])

        const mockToaUpdateJobStatus = vi.mocked(api.toaUpdateJobStatus)
        const failedToStartTask = (jobId: string) => ({
            stopCode: TaskStopCode.TASK_FAILED_TO_START,
            tags: [{ key: aws.JOB_ID_TAG_KEY, value: jobId }],
        })
        vi.mocked(aws.describeECSTasks).mockResolvedValue({
            tasks: [failedToStartTask('jobId1'), failedToStartTask('jobId2')],
            $metadata: {},
        })
        mockToaUpdateJobStatus.mockRejectedValueOnce(new Error('TOA unavailable'))

        await expect(checkForAWSErroredJobs()).resolves.toBeUndefined()

        expect(mockToaUpdateJobStatus).toHaveBeenCalledTimes(2)
        expect(mockToaUpdateJobStatus).toHaveBeenNthCalledWith(1, 'jobId1', {
            status: 'JOB-ERRORED',
            message: 'Task failed to start',
        })
        expect(mockToaUpdateJobStatus).toHaveBeenNthCalledWith(2, 'jobId2', {
            status: 'JOB-ERRORED',
            message: 'Task failed to start',
        })
        expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to process ECS task'))
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
