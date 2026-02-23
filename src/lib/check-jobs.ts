import { checkForAWSErroredJobs } from './aws-check-jobs'
import { DockerEnclave } from './docker-enclave'
import { KubernetesEnclave } from './kube-enclave'

export const checkForErroredJobs = async (): Promise<void> => {
    /* v8 ignore start */
    const deploymentEnvironment = process.env.DEPLOYMENT_ENVIRONMENT ?? 'AWS'
    /* v8 ignore stop */
    if (deploymentEnvironment === 'AWS') {
        await checkForAWSErroredJobs()
    } else if (deploymentEnvironment === 'KUBERNETES') {
        console.log('Running Setup App in Kubernetes environment')
        /* v8 ignore next */
        await new KubernetesEnclave().checkForErroredJobs()
    } else if (deploymentEnvironment === 'DOCKER') {
        console.log('Running Setup App in Docker environment')
        await new DockerEnclave().checkForErroredJobs()
    } else {
        console.log('Running the setup app in an unsupported environment')
        throw new Error(`Unsupported deployment environment: ${deploymentEnvironment}`)
    }
}
