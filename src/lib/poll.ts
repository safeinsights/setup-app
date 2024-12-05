import { runStudies } from './run-studies'

function poll(): void {
    console.log(`Polling management app at ${new Date()}`)

    runStudies(false)
}

// Poll once now and then every hour (3600000 ms)
poll()
setInterval(poll, 3600000)
