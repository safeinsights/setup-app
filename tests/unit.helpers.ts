import fs from 'fs'
import os from 'os'
import path from 'path'
export * from './common.helpers'
export { fs, path }

export async function createTempDir() {
    const ostmpdir = os.tmpdir()
    const tmpdir = path.join(ostmpdir, 'unit-test-')
    return await fs.promises.mkdtemp(tmpdir)
}
