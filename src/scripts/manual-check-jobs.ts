import { checkForErroredJobs } from '../lib/check-jobs'

// Wrap calls in a function to avoid layers of promise resolves
const main = async (): Promise<void> => {
    await checkForErroredJobs()
}

main()
