import { ResourceTagMapping } from '@aws-sdk/client-resource-groups-tagging-api'
import { describe, expect, it } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import {
    ensureValueWithError,
    filterManagementAppJobs,
    filterOrphanTaskDefinitions,
    hasReadWritePermissions,
    toManagementAppTagValue,
    sanitize,
} from '../lib/utils'
import { JOB_ID_TAG_KEY } from './aws'

describe('filterManagementAppJobs', () => {
    it('returns all jobs when no AWS filters provided', () => {
        const mockManagementAppResponse = {
            jobs: [
                {
                    jobId: 'job-1',
                    containerLocation: '',
                    title: '',
                    researcherId: 'testresearcherid',
                },
                {
                    jobId: 'job-2',
                    containerLocation: '',
                    title: '',
                    researcherId: 'testresearcherid',
                },
            ],
        }
        expect(filterManagementAppJobs(mockManagementAppResponse)).toStrictEqual(mockManagementAppResponse)
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
        expect(filterManagementAppJobs(mockManagementAppResponse, mockJobsFromAws)).toStrictEqual({
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

describe('toManagementAppTagValue', () => {
    it('joins the url and the member id', () => {
        expect(toManagementAppTagValue('https://bma:12345', 'openstax')).toBe('https://bma:12345=openstax')
    })

    it('strips trailing slashes from the url', () => {
        expect(toManagementAppTagValue('https://bma:12345/', 'openstax')).toBe('https://bma:12345=openstax')
        expect(toManagementAppTagValue('https://bma:12345///', 'openstax')).toBe('https://bma:12345=openstax')
    })

    it('distinguishes members sharing a management app', () => {
        expect(toManagementAppTagValue('https://bma:12345', 'member-1')).not.toBe(
            toManagementAppTagValue('https://bma:12345', 'member-2'),
        )
    })

    it('keeps characters that AWS allows in a tag value', () => {
        expect(toManagementAppTagValue('https://bma-1.example.com:12345/a_b@c+d', 'member.1')).toBe(
            'https://bma-1.example.com:12345/a_b@c+d=member.1',
        )
    })

    it('replaces characters that AWS disallows in a tag value', () => {
        expect(toManagementAppTagValue('https://bma:12345/x?a=1&b=2', 'openstax')).toBe(
            'https://bma:12345/x_a=1_b=2=openstax',
        )
        expect(toManagementAppTagValue('https://user%name:p^ss@bma#frag', 'mem*ber')).toBe(
            'https://user_name:p_ss@bma_frag=mem_ber',
        )
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

describe('hasReadWritePermissions', () => {
    it('returns true for a file the process can read and write', () => {
        expect(hasReadWritePermissions(path.join(__dirname, '../../tests/service-account-files/token'))).toBe(true)
    })

    it('returns false when the file does not exist', () => {
        expect(hasReadWritePermissions('/nonexistent/docker.sock')).toBe(false)
    })

    // Root bypasses the permission bits, so this can only be asserted as an unprivileged user
    it.skipIf(process.getuid?.() === 0)('returns false for a readable file that cannot be written', () => {
        const readOnly = path.join(os.tmpdir(), `setup-app-readonly-${process.pid}`)
        fs.writeFileSync(readOnly, '')
        fs.chmodSync(readOnly, 0o444)

        try {
            expect(hasReadWritePermissions(readOnly)).toBe(false)
        } finally {
            fs.unlinkSync(readOnly)
        }
    })
})
