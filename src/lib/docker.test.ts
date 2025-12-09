import { describe, expect, it, vi } from 'vitest'
import * as api from './api'
import { createContainerObject, filterContainers, pullContainer } from './docker'
import { CONTAINER_TYPES, DockerApiContainersResponse } from './types'
vi.mock('./api')

describe('docker', () => {
    it('pullContainer: should call dockerApiCall with the correct arguments', async () => {
        const imageLocation = 'my-image'
        const mockApiCall = vi.fn().mockResolvedValue([])
        vi.spyOn(api, 'dockerApiCall').mockImplementation(mockApiCall)
        await pullContainer(imageLocation)
        expect(mockApiCall).toHaveBeenCalledWith('POST', `images/create?fromImage=${imageLocation}`, undefined, true)
    })

    it('pullContainer: should return the response from dockerApiCall', async () => {
        vi.spyOn(api, 'dockerApiCall').mockResolvedValue([])

        const actualResponse = await pullContainer('my-image')

        expect(actualResponse).toEqual([])
    })

    it('pullContainer: should throw an error if dockerApiCall throws', async () => {
        const error = new Error('Docker API Call Error: Failed to pull container my-image. Cause: {}')
        vi.spyOn(api, 'dockerApiCall').mockRejectedValueOnce(error)

        await expect(pullContainer('my-image')).rejects.toThrow(error)
    })

    it('createContainerObject: should return a container object with the correct properties', () => {
        const imageLocation = 'my-image'
        const jobId = '1234567890'
        const studyTitle = 'My Study Title'
        const toaEndpointWithJobId = 'https://example.com/toa?job_id=1234567890'

        const container = createContainerObject(imageLocation, jobId, studyTitle, toaEndpointWithJobId)

        expect(container).toEqual({
            Image: imageLocation,
            Labels: {
                app: `research-container-${jobId}`,
                component: CONTAINER_TYPES.RESEARCH_CONTAINER,
                'part-of': 'my_study_title',
                instance: jobId,
                'managed-by': CONTAINER_TYPES.SETUP_APP,
            },
            Env: [
                `TRUSTED_OUTPUT_ENDPOINT=${toaEndpointWithJobId}`
            ],
        })
    })
    it('filterContainers: filters containers by state and labels', () => {
        const containers: DockerApiContainersResponse[] = [
            {
                Id: '1234567890',
                Image: 'test',
                ImageID: 'test',
                Names: ['test1'],
                Command: '',
                State: 'running',
                Status: 'running',
                Labels: {
                    studyId: 'ABC123',
                    jobId: 'XYZ789',
                },
            },
            {
                Id: '0987654321',
                Image: 'test',
                ImageID: 'test',
                Names: ['test2'],
                Command: '',
                State: 'exited',
                Status: 'errored',
                Labels: {
                    studyId: 'DEF456',
                    jobId: 'IJK123',
                },
            },
        ]
        const filteredContainers = filterContainers(containers, { studyId: 'ABC123', jobId: 'XYZ789' }, ['running'])

        expect(filteredContainers).toHaveLength(1)
        expect(filteredContainers[0].Id).toBe('1234567890')
    })
    it('filterContainers: return empty if containers is empty', () => {
        const containers: DockerApiContainersResponse[] = []
        const filteredContainers = filterContainers(containers, { studyId: 'ABC123', jobId: 'XYZ789' }, ['running'])
        expect(filteredContainers).toHaveLength(0)
    })
})
