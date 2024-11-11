import jwt from 'jsonwebtoken'
import { ManagementAppGetRunnableStudiesResponse, TOAGetRunsResponse } from './types'

// Functions for interacting with the Management App
const generateToken = (): string => {
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
    const endpoint = process.env.MANAGEMENT_APP_BASE_URL + '/api/studies/runnable' // `http://localhost:4000/api/studies/runnable`
    const token = generateToken()
    const response = await fetch(endpoint, {
        method: 'GET',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
        },
    })

    const data = await response.json()
    return data
}

// Functions for interacting with the Trusted Output App
export const toaGetRunsRequest = async (): Promise<TOAGetRunsResponse> => {
    const endpoint = process.env.TOA_BASE_URL + '/api/runs' // `http://localhost:3002/api/runs`
    const token = Buffer.from(process.env.TOA_BASIC_AUTH || '').toString('base64')
    if (token.length === 0) {
        throw new Error('TOA token failed to generate')
    }

    const response = await fetch(endpoint, {
        method: 'GET',
        headers: {
            Authorization: `Basic ${token}`,
            'Content-Type': 'application/json',
        },
    })
    const data = await response.json()
    return data
}

// Other
export const filterManagmentAppRuns = (
    managementAppResponse: ManagementAppGetRunnableStudiesResponse,
    toaResponse: TOAGetRunsResponse,
    existingAwsRuns: string[],
): ManagementAppGetRunnableStudiesResponse => {
    // TODO: also filter out in-progress runs
    const runIdArray: string[] = toaResponse.runs.map((run) => run.runId) // flatten runsInTOA

    return {
        runs: managementAppResponse.runs.filter((run) => {
            return !runIdArray.includes(run.runId) && !existingAwsRuns.includes(run.runId)
        }),
    }
}
