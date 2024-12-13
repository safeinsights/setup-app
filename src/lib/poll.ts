import { runStudies } from './run-studies'

function poll(): void {
    // eslint-disable-next-line no-console
    console.log(`Polling management app at ${new Date()}`)

    runStudies({ignoreAWSRuns: false})
}

// Poll once now and then every hour (3600000 ms)
poll()
setInterval(poll, 3600000)
