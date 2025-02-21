import { describe, it, expect } from 'vitest'
import { filterManagementAppJobs, filterOrphanTaskDefinitions, ensureValueWithError } from '../lib/utils'
import { ResourceTagMapping } from '@aws-sdk/client-resource-groups-tagging-api'
import { JOB_ID_TAG_KEY } from './aws'

describe('filterManagementAppJobs', () => {
    it('filters out jobs in the TOA', () => {
        const mockManagementAppResponse = {
            jobs: [
                {
                    jobId: 'not-in-TOA',
                    containerLocation: '',
                    title: '',
                },
                {
                    jobId: 'finished-job',
                    containerLocation: '',
                    title: '',
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
                },
                {
                    jobId: 'existing-job',
                    containerLocation: '',
                    title: '',
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
                },
                {
                    jobId: 'previously-run-but-still-pending',
                    containerLocation: '',
                    title: '',
                },
            ],
        }

        const mockTaskDefResources = [
            {
                jobId: 'not-yet-run',
                containerLocation: '',
                title: '',
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
