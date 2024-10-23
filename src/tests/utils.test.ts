import { describe, it, expect, beforeEach, vi } from 'vitest'
import { managementAppRequest } from '../lib/utils'
import jwt from 'jsonwebtoken'

beforeEach(() => {
    process.env.MANAGEMENT_APP_PRIVATE_KEY = 'mockprivatekeyvalue'
    process.env.MANAGEMENT_APP_BASE_URL = 'http://bma:12345'
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

        expect(managementAppRequest()).rejects.toThrow('Failed to generate token')
    })
})
