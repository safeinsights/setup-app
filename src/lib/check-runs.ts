import { toaUpdateRunStatus } from '../lib/api'
import { describeECSTasks, getAllTasksWithRunId, RUN_ID_TAG_KEY } from '../lib/aws'
import { ensureValueWithError } from '../lib/utils'
import { ECSClient, TaskStopCode } from '@aws-sdk/client-ecs'
import { ResourceGroupsTaggingAPIClient } from '@aws-sdk/client-resource-groups-tagging-api'
import 'dotenv/config'

export async function checkForErroredRuns(): Promise<void> {
    /**
     * We check for errored runs exclusively using AWS state since the PUT semantics
     * of updating status via TOA should be idempotent. This reduces load on the BMA
     * while also keeping the logic here extremely simple
     */
    const ecsClient = new ECSClient()
    const taggingClient = new ResourceGroupsTaggingAPIClient()
    const cluster = ensureValueWithError(process.env.ECS_CLUSTER, 'Env var ECS_CLUSTER not found')

    const tasks = await getAllTasksWithRunId(taggingClient)

    const taskArns: string[] = []

    tasks.forEach((task) => {
        if (task.ResourceARN !== undefined) {
            taskArns.push(task.ResourceARN)
        }
    })

    if (taskArns.length == 0) {
        // There are no tasks to look into
        return
    }

    const data = await describeECSTasks(ecsClient, cluster, taskArns)

    for (const run of data.tasks ?? []) {
        const maybeRunId = run.tags?.find((tag) => tag.key === RUN_ID_TAG_KEY)?.value
        const runId = ensureValueWithError(maybeRunId, 'Could not find runId in task tags')

        if (run.stopCode === TaskStopCode.TASK_FAILED_TO_START) {
            // NOTE: While run.stopReason provides useful information for devs / operators,
            // for now we're not passing that through since the AWS generated message may
            // be confusing to users
            await toaUpdateRunStatus(runId, { status: 'JOB-ERRORED', message: 'Task failed to start' })
        }

        if (run.stopCode === TaskStopCode.ESSENTIAL_CONTAINER_EXITED) {
            // We only expect one container in practice today, but the following will
            // set a status error if any container in the task has a non-zero exit code
            for (const container of run.containers ?? []) {
                const maybeExitCode = container.exitCode
                if (maybeExitCode !== undefined && maybeExitCode !== 0) {
                    await toaUpdateRunStatus(runId, {
                        status: 'JOB-ERRORED',
                        message: 'Task container stopped with non-zero exit code',
                    })
                }
            }
        }
    }
}
