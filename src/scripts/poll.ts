
const pollStudiesInterval = parseInt(process.env.POLL_STUDIES_INTERVAL_SECONDS ?? '30')
const pollForErroredJobsInterval = parseInt(process.env.POLL_ERRORED_JOBS_INTERVAL_SECONDS ?? '60')

console.log('Polling interval for studies:', pollStudiesInterval)
console.log('Polling interval for failed jobs:', pollForErroredJobsInterval)
function pollStudies(): void {
    // console.log(`Polling management app at ${new Date()}`)
    // runStudies({ ignoreAWSJobs: false })
}

function pollForErroredJobs(): void {
    // console.log(`Polling for errored jobs at ${new Date()}`)
    // checkForErroredJobs()
}

// Poll for studies every 10 minutes by default (for dev)
setInterval(pollStudies, pollStudiesInterval * 1000)

// Poll for errored tasks every 5 minutes by default
setInterval(pollForErroredJobs, pollForErroredJobsInterval * 1000)
