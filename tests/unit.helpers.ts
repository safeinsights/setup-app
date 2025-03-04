import path from 'path'
export * from './common.helpers'
export { path }

export async function getServiceAccountDir() {
    return path.join(__dirname, 'service-account-files')
}
