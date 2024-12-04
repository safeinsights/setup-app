import { beforeEach } from 'vitest'
import { describe, expect, it } from 'vitest'
import { mockClient } from 'aws-sdk-client-mock'
import {
    ECSClient,
    DescribeTaskDefinitionCommand,
    RegisterTaskDefinitionCommand,
    RunTaskCommand,
    DeleteTaskDefinitionsCommand,
    DeregisterTaskDefinitionCommand,
    TaskDefinitionStatus,
} from '@aws-sdk/client-ecs'
import {
    getECSTaskDefinition,
    getTaskDefinitionsWithRunId,
    getTaskResourcesByRunId,
    registerECSTaskDefinition,
    runECSFargateTask,
    RUN_ID_TAG_KEY,
    deleteECSTaskDefinitions,
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

describe('deleteECSTaskDefinitions', () => {
    it('should send expected AWS commands and respect current status', async () => {
        ecsMockClient
            .on(DescribeTaskDefinitionCommand, { taskDefinition: '1' })
            .resolves({ taskDefinition: { status: TaskDefinitionStatus.ACTIVE } })
        ecsMockClient
            .on(DescribeTaskDefinitionCommand, { taskDefinition: '2' })
            .resolves({ taskDefinition: { status: TaskDefinitionStatus.ACTIVE } })
        ecsMockClient
            .on(DescribeTaskDefinitionCommand, { taskDefinition: '3' })
            .resolves({ taskDefinition: { status: TaskDefinitionStatus.INACTIVE } })
        ecsMockClient
            .on(DescribeTaskDefinitionCommand, { taskDefinition: '4' })
            .resolves({ taskDefinition: { status: TaskDefinitionStatus.DELETE_IN_PROGRESS } })

        await deleteECSTaskDefinitions(new ECSClient(), ['1', '2', '3', '4'])

        expect(ecsMockClient.commandCalls(DeregisterTaskDefinitionCommand, { taskDefinition: '1' })).toHaveLength(1)
        expect(ecsMockClient.commandCalls(DeleteTaskDefinitionsCommand, { taskDefinitions: ['1'] })).toHaveLength(1)
        expect(ecsMockClient.commandCalls(DeregisterTaskDefinitionCommand, { taskDefinition: '2' })).toHaveLength(1)
        expect(ecsMockClient.commandCalls(DeleteTaskDefinitionsCommand, { taskDefinitions: ['2'] })).toHaveLength(1)
        expect(ecsMockClient.commandCalls(DeregisterTaskDefinitionCommand, { taskDefinition: '3' })).toHaveLength(0)
        expect(ecsMockClient.commandCalls(DeleteTaskDefinitionsCommand, { taskDefinitions: ['3'] })).toHaveLength(1)
        expect(ecsMockClient.commandCalls(DeregisterTaskDefinitionCommand, { taskDefinition: '4' })).toHaveLength(0)
        expect(ecsMockClient.commandCalls(DeleteTaskDefinitionsCommand, { taskDefinitions: ['4'] })).toHaveLength(0)
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
                    Key: RUN_ID_TAG_KEY,
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
                    Key: RUN_ID_TAG_KEY,
                },
            ],
            ResourceTypeFilters: ['ecs:task-definition'],
        }
        taggingMockClient.on(GetResourcesCommand, expectedCommandInput).resolves({})

        const res = await getTaskDefinitionsWithRunId(new ResourceGroupsTaggingAPIClient())
        expect(res).toStrictEqual({})
    })
})
