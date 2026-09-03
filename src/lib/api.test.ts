import { describe, it, expect, vi } from 'vitest'
import path from 'path'
import {
    managementAppGetReadyStudiesRequest,
    managementAppGetJobStatus,
    resolveDockerTransport,
    toaSendLogs,
    toaUpdateJobStatus,
} from './api'
import jwt from 'jsonwebtoken'

const READABLE_SOCKET = path.join(__dirname, '../../tests/docker/test.sock')
const MISSING_SOCKET = '/nonexistent/docker.sock'

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

describe('managementAppGetJobStatus', () => {
    it('gets a job status from the management app', async () => {
        const mockSignToken = vi.fn().mockReturnValue('mocktokenvalue')
        global.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: 'TEST-STATUS' })))
        vi.spyOn(jwt, 'sign').mockImplementation(mockSignToken)

        expect(await managementAppGetJobStatus('jobId1234')).toEqual({ status: 'TEST-STATUS' })
    })
    it('errors if unexpected response', async () => {
        const mockSignToken = vi.fn().mockReturnValue('mocktokenvalue')
        global.fetch = vi.fn().mockResolvedValue(new Response('Test error', { status: 401 }))
        vi.spyOn(jwt, 'sign').mockImplementation(mockSignToken)

        await expect(managementAppGetJobStatus('jobId1234')).rejects.toThrow(
            'Received an unexpected 401 from management app',
        )
    })
})

describe('toaUpdateJobStatus', () => {
    it('should make a PUT request', async () => {
        global.fetch = vi.fn().mockResolvedValue(new Response())

        const result = await toaUpdateJobStatus('jobId1234', { status: 'JOB-ERRORED', message: 'Error message' })

        expect(global.fetch).toHaveBeenCalledWith('https://toa:67890/api/job/jobId1234', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ status: 'JOB-ERRORED', message: 'Error message' }),
        })

        expect(result).toEqual({ success: true })
    })

    it('should return appropriate value if response status is not success', async () => {
        global.fetch = vi.fn().mockResolvedValue(new Response('Authentication error', { status: 401 }))
        const result = await toaUpdateJobStatus('jobId1234', { status: 'JOB-ERRORED' })
        expect(result).toEqual({ success: false })
    })
})

describe('toaSendLogs', () => {
    it('should make a POST request with logs', async () => {
        global.fetch = vi.fn().mockResolvedValue(new Response())

        const mockLogs = [{ timestamp: 1, message: 'Test log message' }]

        const mockFormData = new FormData()
        mockFormData.append('logs', JSON.stringify(mockLogs))

        const result = await toaSendLogs('jobId456', mockLogs)
        expect(global.fetch).toHaveBeenCalledWith('https://toa:67890/api/job/jobId456/logs', {
            method: 'POST',
            body: mockFormData,
        })

        expect(result).toEqual({ success: true })
    })

    it('should notify on an error', async () => {
        global.fetch = vi.fn().mockResolvedValue(new Response('Error', { status: 500 }))

        const mockLogs = [{ timestamp: 2, message: 'Test log message' }]

        const result = await toaSendLogs('jobId456', mockLogs)

        expect(result).toEqual({ success: false })
    })
})

describe('resolveDockerTransport', () => {
    const PULL = 'images/create?fromImage=repo/image:tag'
    const CREATE = 'containers/create?name=rc-jobId1'

    it('uses the socket when it is readable, without TLS', () => {
        expect(resolveDockerTransport(READABLE_SOCKET, 'https', CREATE)).toMatchObject({
            useSocket: true,
            useTls: false,
        })
    })

    it('falls back to TLS over TCP when the socket is not readable', () => {
        expect(resolveDockerTransport(MISSING_SOCKET, 'https', CREATE)).toMatchObject({
            useSocket: false,
            useTls: true,
        })
    })

    it('sends registry credentials only when pulling an image', () => {
        expect(resolveDockerTransport(READABLE_SOCKET, 'https', PULL).sendRegistryAuth).toBe(true)
        expect(resolveDockerTransport(MISSING_SOCKET, 'https', PULL).sendRegistryAuth).toBe(true)
        expect(resolveDockerTransport(READABLE_SOCKET, 'https', CREATE).sendRegistryAuth).toBe(false)
    })

    it('tolerates a leading slash on the path', () => {
        expect(resolveDockerTransport(READABLE_SOCKET, 'https', `/${PULL}`).sendRegistryAuth).toBe(true)
    })

    it('refuses plaintext TCP without an explicit opt-in', () => {
        expect(() => resolveDockerTransport(MISSING_SOCKET, 'http', CREATE)).toThrow(
            'Refusing to reach the Docker Engine API over plaintext TCP',
        )
    })

    it('allows plaintext TCP when opted in, but withholds registry credentials', () => {
        process.env.DOCKER_API_ALLOW_INSECURE_HTTP = 'true'

        expect(resolveDockerTransport(MISSING_SOCKET, 'http', PULL)).toEqual({
            useSocket: false,
            useTls: false,
            sendRegistryAuth: false,
        })
    })
})
