import { runStudies } from '../lib/run-studies'

// Wrap calls in a function to avoid layers of promise resolves
const main = async (): Promise<void> => {
    let ignoreAWSRuns = false
    if (process.argv.includes('--help')) {
        printHelp()
        process.exit(0)
    }
    if (process.argv.includes('--ignore-aws')) {
        console.log('Ignoring AWS existing runs')
        ignoreAWSRuns = true
    }

    await runStudies({ ignoreAWSRuns: ignoreAWSRuns })
}

const printHelp = () => {
    console.log('Usage: npx tsx run-studies.ts')
    console.log('Options:')
    console.log('--help             Display this help message')
    console.log('--ignore-aws       Ignore AWS existing runs and start a new run')
}

main()
