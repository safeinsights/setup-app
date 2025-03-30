import { getServiceAccountDir } from '@/tests/unit.helpers'
import * as fs from 'fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
    DEFAULT_SERVICE_ACCOUNT_PATH,
    getKubeAPIServiceAccountToken,
    getNamespace,
    initHTTPSTrustStore
} from './kube'

vi.mock('https', () => ({
    request: vi.fn(),
}))

describe('Get Service Account items', () => {
    beforeEach(async () => {
        process.env.K8S_SERVICEACCOUNT_PATH = getServiceAccountDir()
    })
    it('should read namespace from file and return trimmed value', () => {
        const filePath = `${process.env.K8S_SERVICEACCOUNT_PATH}/namespace`
        expect(fs.existsSync(filePath)).toBe(true)
        const result = getNamespace()
        expect(result).toBe('mock-namespace')
    })

    it('should throw an error if the namespace file does not exist', () => {
        const filePath = `${DEFAULT_SERVICE_ACCOUNT_PATH}/namespace`
        delete process.env.K8S_SERVICEACCOUNT_PATH
        expect(fs.existsSync(filePath)).toBe(false)
        expect(() => getNamespace()).toThrow(`Namespace file not found!`)
    })

    it('should read token from file and return trimmed value', () => {
        const filePath = `${process.env.K8S_SERVICEACCOUNT_PATH}/token`
        expect(fs.existsSync(filePath)).toBe(true)
        const result = getKubeAPIServiceAccountToken()
        expect(result).toBe('mock-token')
    })

    it('should throw an error if the token file does not exist', () => {
        const filePath = `${DEFAULT_SERVICE_ACCOUNT_PATH}/token`
        delete process.env.K8S_SERVICEACCOUNT_PATH
        expect(fs.existsSync(filePath)).toBe(false)
        expect(() => getKubeAPIServiceAccountToken()).toThrow(`Token file not found!`)
    })

    it('should initialize the https trust store', () => {
        const filePath = `${process.env.K8S_SERVICEACCOUNT_PATH}/ca.crt`
        expect(fs.existsSync(filePath)).toBe(true)
        expect(() => initHTTPSTrustStore).not.toThrow()
    })

    it('should throw an error if the certificate file does not exist', () => {
        const filePath = `${DEFAULT_SERVICE_ACCOUNT_PATH}/ca.crt`
        delete process.env.K8S_SERVICEACCOUNT_PATH
        expect(fs.existsSync(filePath)).toBe(false)
        expect(() => initHTTPSTrustStore()).toThrow(`Certificate file not found!`)
    })
})
