import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as checkJobs from '../lib/check-jobs'
import * as runStudiesModule from '../lib/run-studies'

vi.mock('../lib/check-jobs')
vi.mock('../lib/run-studies')

describe('poll', () => {
    beforeEach(() => {
        vi.useFakeTimers()
        vi.resetModules()
    })

    afterEach(() => {
        vi.useRealTimers()
    })

    it('polls each cycle on its own configured interval', async () => {
        process.env.POLL_STUDIES_INTERVAL_SECONDS = '5'
        process.env.POLL_ERRORED_JOBS_INTERVAL_SECONDS = '7'

        await import('./poll')

        expect(runStudiesModule.runStudies).not.toHaveBeenCalled()

        await vi.advanceTimersByTimeAsync(5000)
        expect(runStudiesModule.runStudies).toHaveBeenCalledWith({ ignoreAWSJobs: false })
        expect(checkJobs.checkForErroredJobs).not.toHaveBeenCalled()

        await vi.advanceTimersByTimeAsync(2000)
        expect(checkJobs.checkForErroredJobs).toHaveBeenCalledOnce()
    })

    it('falls back to the default intervals', async () => {
        delete process.env.POLL_STUDIES_INTERVAL_SECONDS
        delete process.env.POLL_ERRORED_JOBS_INTERVAL_SECONDS

        await import('./poll')

        await vi.advanceTimersByTimeAsync(30_000)
        expect(runStudiesModule.runStudies).toHaveBeenCalledOnce()
        expect(checkJobs.checkForErroredJobs).not.toHaveBeenCalled()

        await vi.advanceTimersByTimeAsync(30_000)
        expect(checkJobs.checkForErroredJobs).toHaveBeenCalledOnce()
    })

    it('keeps polling after a cycle rejects', async () => {
        process.env.POLL_STUDIES_INTERVAL_SECONDS = '5'
        vi.mocked(runStudiesModule.runStudies).mockRejectedValue(new Error('BMA unreachable'))

        await import('./poll')

        await vi.advanceTimersByTimeAsync(5000)
        await vi.advanceTimersByTimeAsync(5000)

        expect(runStudiesModule.runStudies).toHaveBeenCalledTimes(2)
    })
})
