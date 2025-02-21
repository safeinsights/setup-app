import jwt from 'jsonwebtoken'
import {
    ManagementAppGetRunnableStudiesResponse,
    TOAGetRunsResponse,
    isManagementAppGetRunnableStudiesResponse,
    isTOAGetRunsResponse,
} from './types'

// Functions for interacting with the Management App
const generateManagementAppToken = (): string => {
    const privateKey: string | undefined = process.env.MANAGEMENT_APP_PRIVATE_KEY
    const memberId = process.env.MANAGEMENT_APP_MEMBER_ID

    let token = ''
    if (privateKey && memberId) {
        token = jwt.sign({ iss: memberId }, privateKey, { algorithm: 'RS256' })
    }
    if (token.length === 0) {
        throw new Error('Managment App token failed to generate')
    }
    return token
}

export const managementAppGetRunnableStudiesRequest = async (): Promise<ManagementAppGetRunnableStudiesResponse> => {
    const endpoint = process.env.MANAGEMENT_APP_BASE_URL + '/api/studies/ready'
    const token = generateManagementAppToken()
    console.log('BMA: Fetching runnable studies ...')
    const response = await fetch(endpoint, {
        method: 'GET',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
        },
    })

    if (!response.ok) {
        throw new Error(`Received an unexpected ${response.status} from management app: ${await response.text()}`)
    }

    const data = await response.json()
    if (!isManagementAppGetRunnableStudiesResponse(data)) {
        throw new Error('Management app response does not match expected structure')
    }
    console.log('BMA: Data received!')

    return data
}

// Functions for interacting with the Trusted Output App
const generateTOAToken = (): string => {
    const token = Buffer.from(process.env.TOA_BASIC_AUTH || '').toString('base64')
    if (token.length === 0) {
        throw new Error('TOA token failed to generate')
    }
    return token
}

export const toaGetRunsRequest = async (): Promise<TOAGetRunsResponse> => {
    const endpoint = process.env.TOA_BASE_URL + '/api/jobs'
    const token = generateTOAToken()

    console.log('TOA: Fetching runs ...')
    const response = await fetch(endpoint, {
        method: 'GET',
        headers: {
            Authorization: `Basic ${token}`,
            'Content-Type': 'application/json',
        },
    })

    if (!response.ok) {
        throw new Error(`Received an unexpected ${response.status} from trusted output app: ${await response.text()}`)
    }

    const data = await response.json()
    if (!isTOAGetRunsResponse(data)) {
        throw new Error('Trusted output app response does not match expected structure')
    }
    console.log('TOA: Data received!')

    return data
}

export const toaUpdateRunStatus = async (
    runId: string,
    data: { status: 'JOB-PROVISIONING' } | { status: 'JOB-ERRORED'; message?: string },
): Promise<{ success: boolean }> => {
    const endpoint = `${process.env.TOA_BASE_URL}/api/job/${runId}`
    const token = generateTOAToken()

    console.log(`TOA: Updating run ${runId} status with ${JSON.stringify(data)} ...`)
    const response = await fetch(endpoint, {
        method: 'PUT',
        headers: {
            Authorization: `Basic ${token}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
    })

    if (!response.ok) {
        console.log(`TOA: Status update for run ${runId} FAILED!: ${await response.text()}`)
        return { success: false }
    }

    console.log(`TOA: Status update for run ${runId} succeeded!`)
    return { success: true }
}
