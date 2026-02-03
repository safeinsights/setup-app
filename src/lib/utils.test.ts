import { ResourceTagMapping } from '@aws-sdk/client-resource-groups-tagging-api'
import { describe, expect, it } from 'vitest'
import { ensureValueWithError, filterManagementAppJobs, filterOrphanTaskDefinitions, sanitize } from '../lib/utils'
import { JOB_ID_TAG_KEY } from './aws'

describe('filterManagementAppJobs', () => {
    it('filters out jobs in the TOA', () => {
        const mockManagementAppResponse = {
            jobs: [
                {
                    jobId: 'not-in-TOA',
                    containerLocation: '',
                    title: '',
                    researcherId: 'testresearcherid',
                },
                {
                    jobId: 'finished-job',
                    containerLocation: '',
                    title: '',
                    researcherId: 'testresearcherid',
                },
            ],
        }
        const mockTOAResponse = { jobs: [{ jobId: 'finished-job' }] }
        expect(filterManagementAppJobs(mockManagementAppResponse, mockTOAResponse)).toStrictEqual({
            jobs: [
                {
                    jobId: 'not-in-TOA',
                    containerLocation: '',
                    title: '',
                    researcherId: 'testresearcherid',
                },
            ],
        })
    })
    it('filters out jobs from AWS', () => {
        const mockManagementAppResponse = {
            jobs: [
                {
                    jobId: 'not-in-AWS',
                    containerLocation: '',
                    title: '',
                    researcherId: 'testresearcherid',
                },
                {
                    jobId: 'existing-job',
                    containerLocation: '',
                    title: '',
                    researcherId: 'testresearcherid',
                },
            ],
        }
        const mockJobsFromAws: ResourceTagMapping[] = [{ Tags: [{ Key: JOB_ID_TAG_KEY, Value: 'existing-job' }] }]
        expect(filterManagementAppJobs(mockManagementAppResponse, { jobs: [] }, mockJobsFromAws)).toStrictEqual({
            jobs: [
                {
                    jobId: 'not-in-AWS',
                    containerLocation: '',
                    title: '',
                    researcherId: 'testresearcherid',
                },
            ],
        })
    })
})

describe('filterOrphanTaskDefinitions', () => {
    it('filters expected task definitions', () => {
        const mockManagementAppResponse = {
            jobs: [
                {
                    jobId: 'not-yet-job',
                    containerLocation: '',
                    title: '',
                    researcherId: 'testresearcherid',
                },
                {
                    jobId: 'previously-run-but-still-pending',
                    containerLocation: '',
                    title: '',
                    researcherId: 'testresearcherid',
                },
            ],
        }

        const mockTaskDefResources = [
            {
                jobId: 'not-yet-run',
                containerLocation: '',
                title: '',
                researcherId: 'testresearcherid',
            },
            {
                ResourceARN: 'arn1',
                Tags: [{ Key: 'jobId', Value: 'previously-run-but-still-pending' }],
            },
            {
                ResourceARN: 'arn2',
                Tags: [{ Key: 'jobId', Value: 'orphaned-job' }],
            },
        ]

        expect(filterOrphanTaskDefinitions(mockManagementAppResponse, mockTaskDefResources)).toStrictEqual(['arn2'])
    })
})

describe('ensureValueWithError', () => {
    it('makes sure values are defined', () => {
        expect(ensureValueWithError(10)).toBe(10)
    })

    it('responds with the given error message if values are undefined', () => {
        expect(() => ensureValueWithError(null, 'Custom message')).toThrowError('Custom message')
        expect(() => ensureValueWithError(undefined)).toThrowError('undefined value')
        expect(() => ensureValueWithError(null)).toThrowError('null value')
    })
})

describe('sanitize()', () => {
    it('returns the same string when no special chars are present', () => {
        const input = 'HelloWorld_123'
        expect(sanitize(input)).toBe(input)
    })

    it('replaces spaces with underscores', () => {
        expect(sanitize('Hello World')).toBe('Hello_World')
    })

    it('replaces punctuation and symbols with underscores', () => {
        expect(sanitize('foo@bar.com')).toBe('foo_bar_com')
        expect(sanitize('C++ > Java')).toBe('C_Java')
    })

    it('collapses multiple consecutive underscores into one', () => {
        const input = 'a  b!!c'
        const expected = 'a_b_c'
        expect(sanitize(input)).toBe(expected)
    })

    it('handles empty strings gracefully', () => {
        expect(sanitize('')).toBe('')
    })

    it('works with Unicode and emojis', () => {
        const input = '😀 hello 🌍!'
        const expected = '_hello_'
        expect(sanitize(input)).toBe(expected)
    })
})
