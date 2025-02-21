import { describe, it, expect, vi } from 'vitest'
import { managementAppGetRunnableStudiesRequest, toaGetRunsRequest, toaUpdateRunStatus } from './api'
import jwt from 'jsonwebtoken'

describe('managementAppGetRunnableStudiesRequest', () => {
    it('should generate a token and make a GET request', async () => {
        const mockSignToken = vi.fn().mockReturnValue('mocktokenvalue')
        const mockStudiesData = {
            runs: [
                {
                    runId: 'runId1',
                    title: 'title1',
                    containerLocation: 'repo1:tag1',
                },
                {
                    runId: 'runId2',
                    title: 'title2',
                    containerLocation: 'repo1:tag2',
                },
            ],
        }
        global.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(mockStudiesData)))
        vi.spyOn(jwt, 'sign').mockImplementation(mockSignToken)

        const result = await managementAppGetRunnableStudiesRequest()

        expect(mockSignToken).toHaveBeenCalledOnce()
        expect(mockSignToken).toHaveBeenCalledWith({ iss: 'openstax' }, 'mockprivatekeyvalue', { algorithm: 'RS256' })
        expect(global.fetch).toHaveBeenCalledOnce()
        expect(global.fetch).toHaveBeenCalledWith('http://bma:12345/api/studies/ready', {
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

        await expect(managementAppGetRunnableStudiesRequest()).rejects.toThrow('Managment App token failed to generate')
    })

    it('should throw an error if BMA response status is not success', async () => {
        const mockSignToken = vi.fn().mockReturnValue('mocktokenvalue')
        vi.spyOn(jwt, 'sign').mockImplementation(mockSignToken)

        global.fetch = vi.fn().mockResolvedValue(new Response('Authentication error', { status: 401 }))

        await expect(managementAppGetRunnableStudiesRequest()).rejects.toThrow(
            'Received an unexpected 401 from management app: Authentication error',
        )
    })

    it('should throw an error if response structure is unexpected', async () => {
        const mockSignToken = vi.fn().mockReturnValue('mocktokenvalue')
        const mockStudiesData = {
            // The following run is missing title
            runs: [
                {
                    runId: 'runId1',
                    containerLocation: 'repo1:tag1',
                },
            ],
        }
        global.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(mockStudiesData)))
        vi.spyOn(jwt, 'sign').mockImplementation(mockSignToken)

        await expect(managementAppGetRunnableStudiesRequest()).rejects.toThrow(
            'Management app response does not match expected structure',
        )
    })
})

describe('toaGetRunsRequest', () => {
    it('should make a GET request', async () => {
        const mockTOAData = {
            runs: [{ runId: '1234' }],
        }
        global.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(mockTOAData)))

        const result = await toaGetRunsRequest()

        const mockToken = Buffer.from('testusername:testpassword').toString('base64')
        expect(global.fetch).toHaveBeenCalledWith('http://toa:67890/api/jobs', {
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
        await expect(toaGetRunsRequest()).rejects.toThrow('TOA token failed to generate')
    })

    it('should throw an error if response status is not success', async () => {
        global.fetch = vi.fn().mockResolvedValue(new Response('Authentication error', { status: 401 }))
        await expect(toaGetRunsRequest()).rejects.toThrow(
            'Received an unexpected 401 from trusted output app: Authentication error',
        )
    })

    it('should throw an error if response structure is unexpected', async () => {
        const mockTOAData = {
            // Run has unexpected type for runId
            runs: [{ runId: 11 }],
        }
        global.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(mockTOAData)))

        await expect(toaGetRunsRequest()).rejects.toThrow(
            'Trusted output app response does not match expected structure',
        )
    })
})

describe('toaUpdateRunStatus', () => {
    it('should make a PUT request', async () => {
        global.fetch = vi.fn().mockResolvedValue(new Response())

        const result = await toaUpdateRunStatus('runId1234', { status: 'JOB-ERRORED', message: 'Error message' })

        const mockToken = Buffer.from('testusername:testpassword').toString('base64')
        expect(global.fetch).toHaveBeenCalledWith('http://toa:67890/api/job/runId1234', {
            method: 'PUT',
            headers: {
                Authorization: `Basic ${mockToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ status: 'JOB-ERRORED', message: 'Error message' }),
        })

        expect(result).toEqual({ success: true })
    })

    it('should error if token not found', async () => {
        process.env.TOA_BASIC_AUTH = ''
        await expect(toaUpdateRunStatus('runId1234', { status: 'JOB-ERRORED' })).rejects.toThrow(
            'TOA token failed to generate',
        )
    })

    it('should return appropriate value if response status is not success', async () => {
        global.fetch = vi.fn().mockResolvedValue(new Response('Authentication error', { status: 401 }))
        const result = await toaUpdateRunStatus('runId1234', { status: 'JOB-ERRORED' })
        expect(result).toEqual({ success: false })
    })
})
