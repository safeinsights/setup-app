import { describe, it, expect, beforeEach, vi } from 'vitest'
import { managementAppRequest, toaRequest } from '../lib/utils'
import jwt from 'jsonwebtoken'

beforeEach(() => {
    process.env.MANAGEMENT_APP_PRIVATE_KEY = 'mockprivatekeyvalue'
    process.env.MANAGEMENT_APP_BASE_URL = 'http://bma:12345'
    process.env.TOA_BASE_URL = 'http://toa:67890'
    process.env.TOA_BASIC_AUTH = 'testusername:testpassword'
})

describe('managementAppRequest', () => {
    it('should generate a token and make a GET request', async () => {
        const mockSignToken = vi.fn().mockReturnValue('mocktokenvalue')
        const mockStudiesData = {
            runs: [
                {
                    runId: 'runId1',
                    studyId: 'studyId1',
                    containerLocation: 'repo1:tag1',
                },
                {
                    runId: 'runId2',
                    studyId: 'studyId2',
                    containerLocation: 'repo1:tag2',
                },
            ],
        }
        global.fetch = vi.fn().mockResolvedValue({
            json: async () => await Promise.resolve(mockStudiesData),
        })
        vi.spyOn(jwt, 'sign').mockImplementation(mockSignToken)

        const result = await managementAppRequest()

        expect(mockSignToken).toHaveBeenCalledOnce()
        expect(mockSignToken).toHaveBeenCalledWith({ iss: 'openstax' }, 'mockprivatekeyvalue', { algorithm: 'RS256' })
        expect(global.fetch).toHaveBeenCalledOnce()
        expect(global.fetch).toHaveBeenCalledWith('http://bma:12345/api/studies/runnable', {
            method: 'GET',
            headers: {
                Authorization: 'Bearer mocktokenvalue',
                'Content-Type': 'application/json',
            },
        })
        expect(result).toEqual(mockStudiesData)
    })

    it('should throw an error if the token generation fails', async () => {
        const mockSignToken = vi.fn().mockReturnValue('')
        vi.spyOn(jwt, 'sign').mockImplementation(mockSignToken)

        await expect(managementAppRequest()).rejects.toThrow('Managment App token failed to generate')
    })
})

describe('toaRequest', () => {
    it('should make a GET request', async () => {
        const mockTOAData = {
            runs: [{ runId: '1234' }],
        }
        global.fetch = vi.fn().mockResolvedValue({
            json: async () => await Promise.resolve(mockTOAData),
        })

        const result = await toaRequest()

        const mockToken = Buffer.from('testusername:testpassword').toString('base64')
        expect(global.fetch).toHaveBeenCalledWith('http://toa:67890/api/runs', {
            method: 'GET',
            headers: {
                Authorization: `Basic ${mockToken}`,
                'Content-Type': 'application/json',
            },
        })
        expect(result).toEqual(mockTOAData)
    })

    it('should error if token not found', async () => {
        process.env.TOA_BASIC_AUTH = ''
        await expect(toaRequest()).rejects.toThrow('TOA token failed to generate')
    })
})
