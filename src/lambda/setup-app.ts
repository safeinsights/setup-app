import { Handler, Context } from 'aws-lambda'
import { runStudies } from '../lib/run-studies'
import { checkForErroredJobs } from '../lib/check-jobs'

export interface LambdaEvent {
    action?: 'run-studies' | 'check-errored-jobs' | 'both'
    ignoreAWSJobs?: boolean
}

export interface LambdaResponse {
    statusCode: number
    message?: string
    body?: string
    error?: string
    timestamp: string
    requestId: string
    remainingTimeInMillis?: number
}

export const handler: Handler<LambdaEvent, LambdaResponse> = async (event: LambdaEvent, context: Context): Promise<LambdaResponse> => {
    console.log('SetupApp Lambda started', { 
        event,
        requestId: context.awsRequestId,
        remainingTimeInMillis: context.getRemainingTimeInMillis()
    })
    
    try {
        const action = event?.action || 'both'
        const ignoreAWSJobs = event?.ignoreAWSJobs || false

        console.log(`Executing action: ${action}`)

        if (action === 'run-studies' || action === 'both') {
            console.log('Running studies...')
            await runStudies({ ignoreAWSJobs })
            console.log('Studies completed')
        }

        if (action === 'check-errored-jobs' || action === 'both') {
            console.log('Checking for errored jobs...')
            await checkForErroredJobs()
            console.log('Errored jobs check completed')
        }

        const response: LambdaResponse = {
            statusCode: 200,
            message: `SetupApp Lambda execution completed successfully: ${action}`,
            timestamp: new Date().toISOString(),
            requestId: context.awsRequestId,
            remainingTimeInMillis: context.getRemainingTimeInMillis()
        }

        console.log('SetupApp Lambda execution completed', response)
        return response

    } catch (error) {
        console.error('SetupApp Lambda execution failed:', error)
        
        return {
            statusCode: 500,
            error: 'SetupApp Lambda execution failed',
            message: error instanceof Error ? error.message : 'Unknown error',
            timestamp: new Date().toISOString(),
            requestId: context.awsRequestId
        }
    }
}