import { describe, it, expect, vi } from 'vitest'
import { managementAppGetReadyStudiesRequest, toaGetJobsRequest, toaUpdateJobStatus } from './api'
import jwt from 'jsonwebtoken'

describe('managementAppGetReadyStudiesRequest', () => {
    it('should generate a token and make a GET request', async () => {
        const mockSignToken = vi.fn().mockReturnValue('mocktokenvalue')
        const mockStudiesData = {
            jobs: [
                {
                    jobId: 'jobId1',
                    title: 'title1',
                    containerLocation: 'repo1:tag1',
                },
                {
                    jobId: 'jobId2',
                    title: 'title2',
                    containerLocation: 'repo1:tag2',
                },
            ],
        }
        global.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(mockStudiesData)))
        vi.spyOn(jwt, 'sign').mockImplementation(mockSignToken)

        const result = await managementAppGetReadyStudiesRequest()

        expect(mockSignToken).toHaveBeenCalledOnce()
        expect(mockSignToken).toHaveBeenCalledWith({ iss: 'openstax' }, 'mockprivatekeyvalue', {
            algorithm: 'RS256',
            expiresIn: 60,
        })
        expect(global.fetch).toHaveBeenCalledOnce()
        expect(global.fetch).toHaveBeenCalledWith('https://bma:12345/api/studies/ready', {
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

        await expect(managementAppGetReadyStudiesRequest()).rejects.toThrow('Managment App token failed to generate')
    })

    it('should throw an error if BMA response status is not success', async () => {
        const mockSignToken = vi.fn().mockReturnValue('mocktokenvalue')
        vi.spyOn(jwt, 'sign').mockImplementation(mockSignToken)

        global.fetch = vi.fn().mockResolvedValue(new Response('Authentication error', { status: 401 }))

        await expect(managementAppGetReadyStudiesRequest()).rejects.toThrow(
            'Received an unexpected 401 from management app: Authentication error',
        )
    })

    it('should throw an error if response structure is unexpected', async () => {
        const mockSignToken = vi.fn().mockReturnValue('mocktokenvalue')
        const mockStudiesData = {
            // The following job is missing title
            jobs: [
                {
                    jobId: 'jobId1',
                    containerLocation: 'repo1:tag1',
                },
            ],
        }
        global.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(mockStudiesData)))
        vi.spyOn(jwt, 'sign').mockImplementation(mockSignToken)

        await expect(managementAppGetReadyStudiesRequest()).rejects.toThrow(
            'Management app response does not match expected structure',
        )
    })
})

describe('toaGetJobsRequest', () => {
    it('should make a GET request', async () => {
        const mockTOAData = {
            jobs: [{ jobId: '1234' }],
        }
        global.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(mockTOAData)))

        const result = await toaGetJobsRequest()

        const mockToken = Buffer.from('testusername:testpassword').toString('base64')
        expect(global.fetch).toHaveBeenCalledWith('https://toa:67890/api/jobs', {
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
        await expect(toaGetJobsRequest()).rejects.toThrow('TOA token failed to generate')
    })

    it('should throw an error if response status is not success', async () => {
        global.fetch = vi.fn().mockResolvedValue(new Response('Authentication error', { status: 401 }))
        await expect(toaGetJobsRequest()).rejects.toThrow(
            'Received an unexpected 401 from trusted output app: Authentication error',
        )
    })

    it('should throw an error if response structure is unexpected', async () => {
        const mockTOAData = {
            // Job has unexpected type for jobId
            jobs: [{ jobId: 11 }],
        }
        global.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(mockTOAData)))

        await expect(toaGetJobsRequest()).rejects.toThrow(
            'Trusted output app response does not match expected structure',
        )
    })
})

describe('toaUpdateJobStatus', () => {
    it('should make a PUT request', async () => {
        global.fetch = vi.fn().mockResolvedValue(new Response())

        const result = await toaUpdateJobStatus('jobId1234', { status: 'JOB-ERRORED', message: 'Error message' })

        const mockToken = Buffer.from('testusername:testpassword').toString('base64')
        expect(global.fetch).toHaveBeenCalledWith('https://toa:67890/api/job/jobId1234', {
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
        await expect(toaUpdateJobStatus('jobId1234', { status: 'JOB-ERRORED' })).rejects.toThrow(
            'TOA token failed to generate',
        )
    })

    it('should return appropriate value if response status is not success', async () => {
        global.fetch = vi.fn().mockResolvedValue(new Response('Authentication error', { status: 401 }))
        const result = await toaUpdateJobStatus('jobId1234', { status: 'JOB-ERRORED' })
        expect(result).toEqual({ success: false })
    })
})
