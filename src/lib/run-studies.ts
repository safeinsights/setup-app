import { runAWSStudies } from './aws-run-studies'
import { KubernetesEnclave } from './kube-enclave'
import { DockerEnclave } from './docker-enclave'
export async function runStudies(options: { ignoreAWSJobs: boolean }): Promise<void> {
    /* v8 ignore start */
    const deploymentEnvironment = process.env.DEPLOYMENT_ENVIRONMENT ?? 'AWS'
    /* v8 ignore stop */
    if (deploymentEnvironment === 'AWS') {
        await runAWSStudies(options)
    } else if (deploymentEnvironment === 'KUBERNETES') {
        console.log('Running Setup App in Kubernetes environment')
        await new KubernetesEnclave().runStudies()
    } else if (deploymentEnvironment === 'DOCKER') {
        console.log('Running Setup App in Docker environment')
        await new DockerEnclave().runStudies()
    } else {
        throw new Error(`Unsupported deployment environment: ${deploymentEnvironment}`)
    }
}
