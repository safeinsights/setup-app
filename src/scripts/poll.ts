import { runStudies } from '../lib/run-studies'

const pollIntervall: number = Number(process.env.POLL_INTERVALL) || 3600000
function poll(): void {
    console.log(`Polling management app at ${new Date()}`)

    runStudies({ ignoreAWSRuns: false })
}

// Poll once now and then every hour (3600000 ms)
poll()
setInterval(poll, pollIntervall)
