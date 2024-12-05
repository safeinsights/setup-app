import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
    managementAppGetRunnableStudiesRequest,
    toaGetRunsRequest,
    filterManagmentAppRuns,
    filterOrphanTaskDefinitions,
} from '../lib/utils'
import jwt from 'jsonwebtoken'

beforeEach(() => {
    process.env.MANAGEMENT_APP_PRIVATE_KEY = 'mockprivatekeyvalue'
    process.env.MANAGEMENT_APP_BASE_URL = 'http://bma:12345'
    process.env.MANAGEMENT_APP_MEMBER_ID = 'openstax'
    process.env.TOA_BASE_URL = 'http://toa:67890'
    process.env.TOA_BASIC_AUTH = 'testusername:testpassword'
})

describe('managementAppGetRunnableStudiesRequest', () => {
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
        global.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(mockStudiesData)))
        vi.spyOn(jwt, 'sign').mockImplementation(mockSignToken)

        const result = await managementAppGetRunnableStudiesRequest()

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
})

describe('toaGetRunsRequest', () => {
    it('should make a GET request', async () => {
        const mockTOAData = {
            runs: [{ runId: '1234' }],
        }
        global.fetch = vi.fn().mockResolvedValue({
            json: async () => await Promise.resolve(mockTOAData),
        })

        const result = await toaGetRunsRequest()

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
        await expect(toaGetRunsRequest()).rejects.toThrow('TOA token failed to generate')
    })
})

describe('filterManagementAppRuns', () => {
    it('filters out runs in the TOA', () => {
        const mockManagementAppResponse = {
            runs: [
                {
                    runId: 'not-in-TOA',
                    containerLocation: '',
                    title: '',
                },
                {
                    runId: 'finished-run',
                    containerLocation: '',
                    title: '',
                },
            ],
        }
        const mockTOAResponse = { runs: [{ runId: 'finished-run' }] }
        expect(filterManagmentAppRuns(mockManagementAppResponse, mockTOAResponse, [])).toStrictEqual({
            runs: [
                {
                    runId: 'not-in-TOA',
                    containerLocation: '',
                    title: '',
                },
            ],
        })
    })
    it('filters out runs from AWS', () => {
        const mockManagementAppResponse = {
            runs: [
                {
                    runId: 'not-in-AWS',
                    containerLocation: '',
                    title: '',
                },
                {
                    runId: 'existing-run',
                    containerLocation: '',
                    title: '',
                },
            ],
        }
        expect(filterManagmentAppRuns(mockManagementAppResponse, { runs: [] }, ['existing-run'])).toStrictEqual({
            runs: [
                {
                    runId: 'not-in-AWS',
                    containerLocation: '',
                    title: '',
                },
            ],
        })
    })
})

describe('filterOrphanTaskDefinitions', () => {
    it('filters expected task definitions', () => {
        const mockManagementAppResponse = {
            runs: [
                {
                    runId: 'not-yet-run',
                    containerLocation: '',
                    title: '',
                },
                {
                    runId: 'previously-run-but-still-pending',
                    containerLocation: '',
                    title: '',
                },
            ],
        }

        const mockTaskDefResources = [
            {
                runId: 'not-yet-run',
                containerLocation: '',
                title: '',
            },
            {
                ResourceARN: 'arn1',
                Tags: [{ Key: 'runId', Value: 'previously-run-but-still-pending' }],
            },
            {
                ResourceARN: 'arn2',
                Tags: [{ Key: 'runId', Value: 'orphaned-run' }],
            },
        ]

        expect(filterOrphanTaskDefinitions(mockManagementAppResponse, mockTaskDefResources)).toStrictEqual(['arn2'])
    })
})
