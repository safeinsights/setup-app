import fs from 'fs'
import { describe, expect, it } from 'vitest'
import { getKubeAPIServiceAccountToken, getNamespace, initHTTPSTrustStore } from './kube'
import { getServiceAccountDir } from '@/tests/unit.helpers'

beforeEach(async () => {
    process.env.K8S_SERVICEACCOUNT_PATH = getServiceAccountDir()
})
describe('getNamespace', () => {
    const filePath = `${process.env.K8S_SERVICEACCOUNT_PATH}/namespace`
    console.log(`${filePath}`)
    it('should read namespace from file and return trimmed value', () => {
        expect(fs.existsSync(filePath)).toBe(true)
        const result = getNamespace()
        expect(result).toBe('mock-namespace')
    })

    it('should throw an error if the namespace file does not exist', () => {
        delete process.env.K8S_SERVICEACCOUNT_PATH
        expect(fs.existsSync(filePath)).toBe(false)
        expect(() => getNamespace()).toThrow(`Namespace file not found at ${filePath}`)
    })
})

describe('getKubeAPIServiceAccountToken', () => {
    const filePath = `${process.env.K8S_SERVICEACCOUNT_PATH}/token`
    it('should read token from file and return trimmed value', () => {
        expect(fs.existsSync(filePath)).toBe(true)
        const result = getKubeAPIServiceAccountToken()
        expect(result).toBe('mock-token')
    })

    it('should throw an error if the token file does not exist', () => {
        delete process.env.K8S_SERVICEACCOUNT_PATH
        expect(fs.existsSync(filePath)).toBe(false)
        expect(() => getKubeAPIServiceAccountToken()).toThrow(`Token file not found at ${filePath}`)
    })
})

describe('initHTTPSTrustStore', () => {
    const filePath = `${process.env.K8S_SERVICEACCOUNT_PATH}/ca.crt`
    it('should initialize the https trust store', () => {
        expect(fs.existsSync(filePath)).toBe(true)
        expect(() => initHTTPSTrustStore).not.toThrow()
    })

    it('should throw an error if the certificate file does not exist', () => {
        delete process.env.K8S_SERVICEACCOUNT_PATH
        expect(fs.existsSync(filePath)).toBe(false)
        expect(() => initHTTPSTrustStore()).toThrow(`Certificate file not found at ${filePath}`)
    })
})
