import { checkForErroredJobs } from '../lib/check-runs'
import { runStudies } from '../lib/run-studies'

function pollStudies(): void {
    console.log(`Polling management app at ${new Date()}`)

    runStudies({ ignoreAWSJobs: false })
}

function pollForErroredJobs(): void {
    console.log(`Polling AWS for errored jobs at ${new Date()}`)
    checkForErroredJobs()
}

// Poll for studies once now and then every hour (3600000 ms)
pollStudies()
setInterval(pollStudies, 3600000)

// Poll for errored tasks every 5 minutes (300000 ms)
setInterval(pollForErroredJobs, 300000)
