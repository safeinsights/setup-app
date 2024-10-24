import jwt from 'jsonwebtoken'
import { ManagementAppResponse } from './types'

// Functions for interacting with the Management App
const generateToken = (): string => {
    const privateKey: string | undefined = process.env.MANAGEMENT_APP_PRIVATE_KEY
    const memberId = process.env.MANAGEMENT_APP_MEMBER_ID

    let token = ''
    if (privateKey && memberId) {
        token = jwt.sign({ iss: memberId }, privateKey, { algorithm: 'RS256' })
    }
    return token
}

export const managementAppRequest = async (): Promise<ManagementAppResponse> => {
    const endpoint = process.env.MANAGEMENT_APP_BASE_URL + '/api/studies/runnable' // `http://localhost:4000/api/studies/runnable`
    const token = generateToken()
    if (token.length === 0) {
        throw new Error('Failed to generate token')
    }
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
