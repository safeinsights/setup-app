import fs from 'fs'
import https from 'https'
import tls from 'tls'

const SERVICEACCOUNT_PATH = process.env.K8S_SERVICEACCOUNT_PATH || '/var/run/secrets/kubernetes.io/serviceaccount'

function apiCall(group: string, path: string, method: string, body?: any): Promise<any> {
    const namespace = getNamespace()
    const kubeAPIServer = process.env.K8S_APISERVER || `https://kubernetes.default.svc.cluster.local`
    const kubeAPIServerURL = `${kubeAPIServer}/apis/${group}/v1/namespaces/${namespace}/${path}`
    const kubeAPIServerAccountToken = getKubeAPIServiceAccountToken()
    initHTTPSTrustStore()
    console.log(`K8s: Making ${method} => ${kubeAPIServerURL}  :::Token(${kubeAPIServerAccountToken})`)
    const url = new URL(kubeAPIServerURL)
    const options: {
        hostname: string
        port: number | undefined
        path: string
        method: string
        headers: { [key: string]: string }
    } = {
        hostname: url.hostname,
        port: url.port ? parseInt(url.port, 10) : 443,
        path: url.pathname + url.search,
        method: method.toUpperCase(),
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${kubeAPIServerAccountToken}`,
        },
    }

    if (method.toUpperCase() === 'POST' && body) {
        options.headers['Content-Length'] = Buffer.byteLength(JSON.stringify(body)).toString()
    }

    return new Promise((resolve, reject) => {
        const req = https.request(options, (response) => {
            let data = ''

            response.on('data', (chunk) => {
                data += chunk
            })

            response.on('end', () => {
                try {
                    resolve(JSON.parse(data))
                } catch (error: any) {
                    reject(new Error(`Failed to parse JSON: ${error.message}`))
                }
            })
        })

        req.on('error', (error) => {
            console.error('K8s API => Error:', error)
            reject(error)
        })

        if (method.toUpperCase() === 'POST' && body) {
            req.write(JSON.stringify(body))
        }

        req.end()
    })
}

function getNamespace(): string {
    const namespaceFile = `${SERVICEACCOUNT_PATH}/namespace`
    if (!fs.existsSync(namespaceFile)) {
        throw new Error(`Namespace file not found at ${namespaceFile}`)
    }
    return fs.readFileSync(namespaceFile, 'utf8').trim()
}

function getKubeAPIServiceAccountToken(): string {
    const tokenFile = `${SERVICEACCOUNT_PATH}/token`
    if (!fs.existsSync(tokenFile)) {
        throw new Error(`Token file not found at ${tokenFile}`)
    }
    return fs.readFileSync(tokenFile, 'utf8').trim()
}

function initHTTPSTrustStore(): void {
    const certFile = `${SERVICEACCOUNT_PATH}/ca.crt`
    console.log(`SA: Initializing the K8s truststore using ${certFile}`)
    if (!fs.existsSync(certFile)) {
        throw new Error(`Certificate file not found at ${certFile}`)
    }
    https.globalAgent.options.ca = [...tls.rootCertificates, fs.readFileSync(certFile, 'utf8')]
}

export { apiCall, getNamespace }
