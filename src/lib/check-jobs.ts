import { checkForAWSErroredJobs} from './aws-check-jobs'
import { DockerEnclave } from './docker-enclave'

export async function checkForErroredJobs(): Promise<void> {
    const deploymentEnvironment = process.env.DEPLOYMENT_ENVIRONMENT ?? 'AWS' /* v8 ignore next */
    if (deploymentEnvironment === 'AWS') {
        await checkForAWSErroredJobs()
    } else if (deploymentEnvironment === 'DOCKER') {
        console.log('Running Setup App in Docker environment')
        await new DockerEnclave().checkForErroredJobs()
    } else {
        throw new Error(`Unsupported deployment environment: ${deploymentEnvironment}`)
    }
}
