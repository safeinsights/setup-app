import { runAWSStudies } from './aws-run-studies'
import { runK8sStudies } from './kube-run-studies'
export async function runStudies(options: { ignoreAWSJobs: boolean }): Promise<void> {
    const deploymentEnvironment = process.env.DEPLOYMENT_ENVIRONMENT || 'AWS'
    if (deploymentEnvironment === 'AWS') {
        await runAWSStudies(options)
    } else if (deploymentEnvironment === 'KUBERNETES') {
        // Implement K8S study execution here
        console.log('Running studies in Kubernetes environment')
        await runK8sStudies()
    } else {
        throw new Error(`Unsupported deployment environment: ${deploymentEnvironment}`)
    }
}
