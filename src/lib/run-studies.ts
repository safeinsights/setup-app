import { runAWSStudies } from './aws-run-studies'
import { runK8sStudies } from './kube-run-studies'
import { DockerEnclave } from './docker-enclave'
export async function runStudies(options: { ignoreAWSJobs: boolean }): Promise<void> {
    const deploymentEnvironment = process.env.DEPLOYMENT_ENVIRONMENT ?? 'AWS' /* v8 ignore next */
    if (deploymentEnvironment === 'AWS') {
        await runAWSStudies(options)
    } else if (deploymentEnvironment === 'KUBERNETES') {
        console.log('Running Setup App in Kubernetes environment')
        await runK8sStudies()
    } else if (deploymentEnvironment === 'DOCKER') {
        console.log('Running Setup App in Docker environment')
        await new DockerEnclave().runStudies()
    } else {
        throw new Error(`Unsupported deployment environment: ${deploymentEnvironment}`)
    }
}
