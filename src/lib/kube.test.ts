import { describe, expect, it } from 'vitest'
import fs from 'fs'
import { getNamespace, SERVICEACCOUNT_PATH } from './kube'

describe('Read Service account items', () => {
    const filePath = `${SERVICEACCOUNT_PATH}/namespace`
    it('should read namespace from file and return trimmed value', () => {
        expect(fs.existsSync(`${SERVICEACCOUNT_PATH}/namespace`)).toBe(true)
        const result = getNamespace()
        expect(result).toBe('mock-namespace')
    })

    // it('should throw an error if the namespace file does not exist', () => {
    //     fs.rmSync(filePath)
    //     expect(fs.existsSync(filePath)).toBe(false)
    //     expect(() => getNamespace()).toThrow(/Namespace file not found/)
    // })
})
