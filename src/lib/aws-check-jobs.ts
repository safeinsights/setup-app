import {
    managementAppGetJobStatus,
    managementAppGetReadyStudiesRequest,
    toaSendLogs,
    toaUpdateJobStatus,
} from '../lib/api'
import {
    deleteECSTaskDefinitions,
    describeECSTasks,
    getAllTasksWithJobId,
    getLogsForTask,
    JOB_ID_TAG_KEY,
} from '../lib/aws'
import { ensureValueWithError, filterOrphanTaskDefinitions } from '../lib/utils'
import { ECSClient, TaskStopCode } from '@aws-sdk/client-ecs'
import { ResourceGroupsTaggingAPIClient, ResourceTagMapping } from '@aws-sdk/client-resource-groups-tagging-api'
import 'dotenv/config'

async function cleanupTaskDefs(taskDefsWithJobId: ResourceTagMapping[], ecsClient: ECSClient) {
    // Garbage collect orphan task definitions
    const bmaResults = await managementAppGetReadyStudiesRequest()
    const orphanTaskDefinitions = filterOrphanTaskDefinitions(bmaResults, taskDefsWithJobId)
    console.log(`Found ${orphanTaskDefinitions.length} orphan task definitions to delete`)
    await deleteECSTaskDefinitions(ecsClient, orphanTaskDefinitions)
}

export async function checkForAWSErroredJobs(): Promise<void> {
    /**
     * We check for errored jobs exclusively using AWS state since the PUT semantics
     * of updating status via TOA should be idempotent. This reduces load on the BMA
     * while also keeping the logic here extremely simple
     */
    const ecsClient = new ECSClient()
    const taggingClient = new ResourceGroupsTaggingAPIClient()
    const cluster = ensureValueWithError(process.env.ECS_CLUSTER, 'Env var ECS_CLUSTER not found')

    const tasks = await getAllTasksWithJobId(taggingClient)

    const taskArns: string[] = []

    tasks.forEach((task) => {
        if (task.ResourceARN !== undefined) {
            taskArns.push(task.ResourceARN)
        }
    })

    if (taskArns.length == 0) {
        // There are no tasks to look into
        cleanupTaskDefs(tasks, ecsClient)
        return
    }

    const data = await describeECSTasks(ecsClient, cluster, taskArns)
    for (const job of data.tasks ?? []) {
        const maybeJobId = job.tags?.find((tag) => tag.key === JOB_ID_TAG_KEY)?.value
        const jobId = ensureValueWithError(maybeJobId, 'Could not find jobId in task tags')

        if (job.stopCode === TaskStopCode.TASK_FAILED_TO_START) {
            // NOTE: While job.stopReason provides useful information for devs / operators,
            // for now we're not passing that through since the AWS generated message may
            // be confusing to users
            await toaUpdateJobStatus(jobId, { status: 'JOB-ERRORED', message: 'Task failed to start' })
        }

        if (job.stopCode === TaskStopCode.ESSENTIAL_CONTAINER_EXITED) {
            // We only expect one container in practice today, but the following will
            // set a status error if any container in the task has a non-zero exit code
            for (const container of job.containers ?? []) {
                const maybeExitCode = container.exitCode
                if (maybeExitCode !== undefined && maybeExitCode !== 0) {
                    // Prevent sending logs if they have already been sent
                    const response = await managementAppGetJobStatus(jobId)
                    if (response.status === 'JOB-ERRORED') {
                        console.log(`Skipping log send for job ${jobId} as status in BMA is already ${response.status}`)
                        continue
                    }

                    // Send logs and update job status
                    const taskId = ensureValueWithError(job.taskArn?.split('/').at(-1))
                    const logs = await getLogsForTask(taskId, ensureValueWithError(job.taskDefinitionArn))

                    await toaUpdateJobStatus(jobId, {
                        status: 'JOB-ERRORED',
                        message: 'Task container stopped with non-zero exit code',
                    })

                    await toaSendLogs(jobId, logs)
                }
            }
        }
    }

    // Tidy AWS environment
    cleanupTaskDefs(tasks, ecsClient)
}
