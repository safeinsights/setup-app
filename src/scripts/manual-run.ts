import { runStudies } from '../lib/run-studies'

// Wrap calls in a function to avoid layers of promise resolves
const main = async (): Promise<void> => {
    let ignoreAWSJobs = false
    if (process.argv.includes('--help')) {
        printHelp()
        process.exit(0)
    }
    if (process.argv.includes('--ignore-aws')) {
        console.log('Ignoring AWS existing jobs')
        ignoreAWSJobs = true
    }

    await runStudies({ ignoreAWSJobs: ignoreAWSJobs })
}

const printHelp = () => {
    console.log('Usage: npx tsx src/scripts/manual-run.ts')
    console.log('Options:')
    console.log('--help             Display this help message')
    console.log('--ignore-aws       Ignore AWS existing jobs and start a new job')
}

main()
