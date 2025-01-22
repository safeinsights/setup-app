import { runStudies } from '../lib/run-studies'

function poll(): void {
    console.log(`Polling management app at ${new Date()}`)

    runStudies({ ignoreAWSRuns: false })
}

// Poll once now and then every hour (3600000 ms)
poll()
setInterval(poll, 3600000)
