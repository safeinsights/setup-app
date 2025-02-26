import { checkForErroredJobs } from '../lib/check-jobs'
import { runStudies } from '../lib/run-studies'

const pollIntervall: number = Number(process.env.POLL_INTERVALL) || 3600000
function pollStudies(): void {
    console.log(`Polling management app at ${new Date()}`)

    runStudies({ ignoreAWSJobs: false })
}

function pollForErroredJobs(): void {
    console.log(`Polling AWS for errored jobs at ${new Date()}`)
    checkForErroredJobs()
}

// Poll for studies once now and then every PollIntervall ms
pollStudies()
setInterval(pollStudies, pollIntervall)

// Poll for errored tasks every pollIntervall ms
setInterval(pollForErroredJobs, pollIntervall)
