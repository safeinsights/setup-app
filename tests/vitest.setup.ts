import { afterEach, beforeEach } from 'vitest'
import { getServiceAccountDir } from './unit.helpers'

const OLD_ENV = process.env

let serviceAccountDir: string = ''
beforeEach(async () => {
    serviceAccountDir = await getServiceAccountDir()
    console.log(`tmpDir: ${serviceAccountDir}`)
    process.env = {
        ...process.env,
        ECS_CLUSTER: 'MOCK_ECS_CLUSTER',
        BASE_TASK_DEFINITION_FAMILY: 'MOCK_BASE_TASK_DEF_FAMILY',
        VPC_SUBNETS: 'MOCK_VPC_SUBNETS,SUBNET',
        SECURITY_GROUP: 'MOCK_SG',
        MANAGEMENT_APP_BASE_URL: 'https://bma:12345',
        MANAGEMENT_APP_MEMBER_ID: 'openstax',
        TOA_BASE_URL: 'https://toa:67890',
        TOA_BASIC_AUTH: 'testusername:testpassword',
        MANAGEMENT_APP_PRIVATE_KEY: 'mockprivatekeyvalue',
        K8S_SERVICEACCOUNT_PATH: serviceAccountDir,
    }
})

afterEach(async () => {
    process.env = OLD_ENV
    delete process.env.K8S_SERVICEACCOUNT_PATH
})
