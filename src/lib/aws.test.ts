import { beforeEach } from 'vitest'
import { describe, expect, it } from 'vitest'
import { mockClient } from 'aws-sdk-client-mock'
import {
    ECSClient,
    DescribeTaskDefinitionCommand,
    RegisterTaskDefinitionCommand,
    RunTaskCommand,
} from '@aws-sdk/client-ecs'
import {
    getECSTaskDefinition,
    getTaskDefinitionsWithRunId,
    getTaskResourcesByRunId,
    registerECSTaskDefinition,
    runECSFargateTask,
} from './aws'
import { GetResourcesCommand, ResourceGroupsTaggingAPIClient } from '@aws-sdk/client-resource-groups-tagging-api'

const ecsMockClient = mockClient(ECSClient)
const taggingMockClient = mockClient(ResourceGroupsTaggingAPIClient)

beforeEach(() => {
    ecsMockClient.reset()
})

describe('getECSTaskDefinition', () => {
    it('should send DescribeTaskDefinitionCommand and return response', async () => {
        const expectedCommandInput = { taskDefinition: 'testtaskdef' }
        ecsMockClient.on(DescribeTaskDefinitionCommand, expectedCommandInput).resolves({})

        const res = await getECSTaskDefinition(new ECSClient(), 'testtaskdef')
        expect(res).toStrictEqual({})
    })
})

describe('registerECSTaskDefinition', () => {
    it('should send RegisterTaskDefinitionCommand and return response', async () => {
        const testTags = [{ key: 'testtagkey', value: 'testtagvalue' }]
        const testTaskDefinition = {
            containerDefinitions: [{ environment: [{ name: 'foo', value: 'bar' }] }],
            taskRoleArn: 'testTaskRoleArn',
            executionRoleArn: 'testexecutionRoleArn',
            networkMode: undefined,
            cpu: 'testCPU',
            memory: 'testMemory',
            requiresCompatibilities: undefined,
        }
        const expectedCommandInput = {
            family: 'testfamilyname',
            containerDefinitions: [
                {
                    image: 'testImageLocation',
                    environment: [
                        { name: 'foo', value: 'bar' },
                        { name: 'TRUSTED_OUTPUT_ENDPOINT', value: 'http://toa:port/api/run/runid' },
                    ],
                },
            ],
            taskRoleArn: 'testTaskRoleArn',
            executionRoleArn: 'testexecutionRoleArn',
            networkMode: undefined,
            cpu: 'testCPU',
            memory: 'testMemory',
            requiresCompatibilities: undefined,
            tags: testTags,
        }
        ecsMockClient.on(RegisterTaskDefinitionCommand, expectedCommandInput).resolves({})

        const res = await registerECSTaskDefinition(
            new ECSClient(),
            testTaskDefinition,
            'testfamilyname',
            'http://toa:port/api/run/runid',
            'testImageLocation',
            testTags,
        )
        expect(res).toStrictEqual({})
    })
})

describe('runECSFargateTask', () => {
    it('should send RunTaskCommand and return response', async () => {
        const testTags = [{ key: 'testtagkey', value: 'testtagvalue' }]
        const expectedCommandInput = {
            taskDefinition: 'testfamilyname',
            cluster: 'testcluster',
            networkConfiguration: {
                awsvpcConfiguration: {
                    subnets: ['testsubnet1', 'testsubnet2'],
                    securityGroups: ['sg1'],
                },
            },
            tags: testTags,
        }
        ecsMockClient.on(RunTaskCommand, expectedCommandInput).resolves({})

        const res = await runECSFargateTask(
            new ECSClient(),
            'testcluster',
            'testfamilyname',
            ['testsubnet1', 'testsubnet2'],
            ['sg1'],
            testTags,
        )
        expect(res).toStrictEqual({})
    })
})

describe('getTaskResourcesByRunId', () => {
    it('should send GetResourcesCommand and return response', async () => {
        const expectedCommandInput = {
            TagFilters: [
                {
                    Key: 'runId',
                    Values: ['testrun1234'],
                },
            ],
            ResourceTypeFilters: ['ecs:task', 'ecs:task-definition'],
        }
        taggingMockClient.on(GetResourcesCommand, expectedCommandInput).resolves({})

        const res = await getTaskResourcesByRunId(new ResourceGroupsTaggingAPIClient(), 'testrun1234')
        expect(res).toStrictEqual({})
    })
})

describe('getTaskDefinitionsWithRunId', () => {
    it('should send GetResourcesCommand and return response', async () => {
        const expectedCommandInput = {
            TagFilters: [
                {
                    Key: 'runId',
                },
            ],
            ResourceTypeFilters: ['ecs:task-definition'],
        }
        taggingMockClient.on(GetResourcesCommand, expectedCommandInput).resolves({})

        const res = await getTaskDefinitionsWithRunId(new ResourceGroupsTaggingAPIClient())
        expect(res).toStrictEqual({})
    })
})
