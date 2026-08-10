import { launchStudy } from '../lib/aws-run-studies'
import { ensureValueWithError } from '../lib/utils'
import { ECSClient } from '@aws-sdk/client-ecs'

const main = async (): Promise<void> => {
    const ecsClient = new ECSClient()

    // Get vals from env vars set in IaC
    const cluster = ensureValueWithError(process.env.ECS_CLUSTER, 'Env var ECS_CLUSTER not found')
    const baseTaskDefinition = ensureValueWithError(
        process.env.BASE_TASK_DEFINITION_FAMILY,
        'Env var BASE_TASK_DEFINITION_FAMILY not found',
    )
    const subnets = ensureValueWithError(process.env.VPC_SUBNETS, 'Env var VPC_SUBNETS not found')
    const securityGroup = ensureValueWithError(process.env.SECURITY_GROUP, 'Env var SECURITY_GROUP not found')

    // Launch the study
    await launchStudy(
        ecsClient,
        cluster,
        baseTaskDefinition,
        subnets.split(','),
        securityGroup,
        'N/A', // no need to supply correct TOA endpoint
        'test-job-id',
        // URL to container built from files in `../../rc-code/` directory:
        'harbor.safeinsights.org/openstax/code-builds/dev:2025-10-17-16-31-40',
        'Exec-able container',
    )
}

main()
