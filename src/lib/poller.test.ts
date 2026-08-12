import { afterEach, describe, expect, it, vi } from 'vitest'
import { createResilientCycle } from './poller'

describe('createResilientCycle', () => {
    afterEach(() => {
        vi.restoreAllMocks()
        vi.useRealTimers()
    })

    it('runs the wrapped cycle when ticked', async () => {
        const cycle = vi.fn().mockResolvedValue(undefined)
        const tick = createResilientCycle('runStudies', cycle)

        await tick()

        expect(cycle).toHaveBeenCalledTimes(1)
    })

    it('logs and does not reject when the cycle throws', async () => {
        const error = new Error('Received an unexpected 503 from management app')
        const cycle = vi.fn().mockRejectedValue(error)
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
        const tick = createResilientCycle('runStudies', cycle)

        await expect(tick()).resolves.toBeUndefined()
        expect(consoleError).toHaveBeenCalledWith(expect.stringContaining('runStudies cycle failed'), error)
    })

    it('skips overlapping ticks while a cycle is still running', async () => {
        let resolveCycle: () => void = () => {}
        const cycle = vi.fn().mockImplementation(
            () =>
                new Promise<void>((resolve) => {
                    resolveCycle = resolve
                }),
        )
        const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})
        const tick = createResilientCycle('runStudies', cycle)

        const first = tick() // starts the cycle; running = true
        const second = tick() // previous cycle still running -> skipped

        expect(cycle).toHaveBeenCalledTimes(1)
        expect(consoleWarn).toHaveBeenCalledWith(expect.stringContaining('Skipping runStudies cycle'))

        resolveCycle()
        await Promise.all([first, second])
        expect(cycle).toHaveBeenCalledTimes(1)

        // Once the previous cycle finished, a later tick is allowed to start again.
        const third = tick()
        expect(cycle).toHaveBeenCalledTimes(2)

        resolveCycle() // resolve the second invocation so nothing is left pending
        await third
    })

    it('keeps polling under setInterval after a cycle rejects', async () => {
        vi.useFakeTimers()
        const cycle = vi.fn().mockRejectedValueOnce(new Error('transient blip')).mockResolvedValue(undefined)
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
        const tick = createResilientCycle('runStudies', cycle)

        setInterval(tick, 1000)

        await vi.advanceTimersByTimeAsync(1000) // first tick rejects and is logged
        await vi.advanceTimersByTimeAsync(1000) // poller is still alive: second tick runs

        expect(cycle).toHaveBeenCalledTimes(2)
        // Exactly one error: the first tick's rejection was caught and logged, and
        // the second tick resolved cleanly. This is what proves it survived a *rejection*.
        expect(consoleError).toHaveBeenCalledTimes(1)
        expect(consoleError).toHaveBeenCalledWith(
            expect.stringContaining('runStudies cycle failed'),
            expect.objectContaining({ message: 'transient blip' }),
        )
    })
})
