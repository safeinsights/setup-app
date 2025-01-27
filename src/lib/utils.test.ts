import { describe, it, expect } from 'vitest'
import { filterManagementAppRuns, filterOrphanTaskDefinitions, ensureValueWithError } from '../lib/utils'
import { ResourceTagMapping } from '@aws-sdk/client-resource-groups-tagging-api'
import { RUN_ID_TAG_KEY } from './aws'

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
        expect(filterManagementAppRuns(mockManagementAppResponse, mockTOAResponse)).toStrictEqual({
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
        const mockRunsFromAws: ResourceTagMapping[] = [{ Tags: [{ Key: RUN_ID_TAG_KEY, Value: 'existing-run' }] }]
        expect(filterManagementAppRuns(mockManagementAppResponse, { runs: [] }, mockRunsFromAws)).toStrictEqual({
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
