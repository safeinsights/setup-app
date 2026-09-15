import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as runStudiesModule from '../lib/run-studies'

vi.mock('../lib/run-studies')

describe('manual-run', () => {
    const originalArgv = process.argv

    beforeEach(() => {
        vi.resetModules()
    })

    afterEach(() => {
        process.argv = originalArgv
    })

    it('runs a cycle that respects existing AWS jobs by default', async () => {
        process.argv = ['node', 'manual-run.ts']

        await import('./manual-run')

        await vi.waitFor(() => expect(runStudiesModule.runStudies).toHaveBeenCalledWith({ ignoreAWSJobs: false }))
    })

    it('ignores existing AWS jobs when asked', async () => {
        process.argv = ['node', 'manual-run.ts', '--ignore-aws']

        await import('./manual-run')

        await vi.waitFor(() => expect(runStudiesModule.runStudies).toHaveBeenCalledWith({ ignoreAWSJobs: true }))
    })

    it('prints usage and exits for --help', async () => {
        process.argv = ['node', 'manual-run.ts', '--help']
        const exit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never)
        const log = vi.spyOn(console, 'log').mockImplementation(() => {})

        await import('./manual-run')

        await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(0))
        expect(log).toHaveBeenCalledWith(expect.stringContaining('Usage:'))
    })
})
