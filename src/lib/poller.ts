type Cycle = () => Promise<void>

// Wrap a polling cycle so that:
//   1. A rejection is caught and logged instead of terminating the process
//   2. A cycle that runs longer than its interval does not overlap itself.
//      Any overlapping tick is skipped and logged.
export function createResilientCycle(name: string, cycle: Cycle): () => Promise<void> {
    let running = false

    return async () => {
        if (running) {
            console.warn(`Skipping ${name} cycle: previous cycle is still running`)
            return
        }

        running = true
        try {
            await cycle()
        } catch (error) {
            console.error(`${name} cycle failed, continuing to poll:`, error)
        } finally {
            running = false
        }
    }
}
