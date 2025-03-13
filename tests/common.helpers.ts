import fs from 'fs'
import path from 'path'

export function createServiceAccountFiles(tmpDir: string) {
    const namespacePath = path.join(tmpDir, 'namespace')
    const tokenPath = path.join(tmpDir, 'token')
    const certFile = path.join(tmpDir, 'ca.crt')
    try {
        if (!fs.existsSync(namespacePath)) fs.writeFileSync(namespacePath, 'mock-namespace')
        if (!fs.existsSync(tokenPath)) fs.writeFileSync(tokenPath, 'mock-token')
        if (!fs.existsSync(certFile)) fs.writeFileSync(certFile, 'mock-cert')
    } catch (err) {
        console.error(`Error creating service account files: ${err}`)
    }
}

export const IS_CI = !!process.env.CI
