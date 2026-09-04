import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as checkJobs from '../lib/check-jobs'

vi.mock('../lib/check-jobs')

describe('manual-check-jobs', () => {
    beforeEach(() => {
        vi.resetModules()
    })

    it('runs a single errored jobs check', async () => {
        await import('./manual-check-jobs')

        await vi.waitFor(() => expect(checkJobs.checkForErroredJobs).toHaveBeenCalledOnce())
    })
})
