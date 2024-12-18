import { beforeEach, afterEach } from 'vitest'

const OLD_ENV = process.env

beforeEach(() => {
    process.env = {
        ...process.env,
        ECS_CLUSTER: 'MOCK_ECS_CLUSTER',
        BASE_TASK_DEFINITION_FAMILY: 'MOCK_BASE_TASK_DEF_FAMILY',
        VPC_SUBNETS: 'MOCK_VPC_SUBNETS,SUBNET',
        SECURITY_GROUP: 'MOCK_SG',
        MANAGEMENT_APP_BASE_URL: 'http://bma:12345',
        MANAGEMENT_APP_MEMBER_ID: 'openstax',
        TOA_BASE_URL: 'http://toa:67890',
        TOA_BASIC_AUTH: 'testusername:testpassword',
        MANAGEMENT_APP_PRIVATE_KEY: 'mockprivatekeyvalue',
    }
})

afterEach(() => {
    process.env = OLD_ENV
})
