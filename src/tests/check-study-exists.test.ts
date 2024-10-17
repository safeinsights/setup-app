import { mockClient } from 'aws-sdk-client-mock'
import { GetResourcesCommand, ResourceGroupsTaggingAPIClient } from '@aws-sdk/client-resource-groups-tagging-api';
import { beforeEach } from 'vitest';
import { checkForStudyTask } from '@/lib/check-study-exists';
import { describe, expect, test, vi} from 'vitest'

const taggingClientMock = mockClient(ResourceGroupsTaggingAPIClient)

beforeEach(() => {
  taggingClientMock.reset()
})

// Tests

describe('checkForStudyTask', () => {
  test('finds a task', async () => {
    taggingClientMock.on(GetResourcesCommand).resolves({
      ResourceTagMappingList: [
        {
          ResourceARN: "resourceARN-1",
          Tags: [ {Key: "studyId", Value: "study1"} ],
        }
      ]
    })
    const consoleLogSpy = vi.spyOn(console, 'log')
    const studyTask = await checkForStudyTask(new ResourceGroupsTaggingAPIClient, 'study1')
    expect(studyTask).toBe(true)
    expect(consoleLogSpy).toHaveBeenCalledWith([
      {
        "ResourceARN": "resourceARN-1",
        "Tags": [{
            "Key": "studyId",
            "Value": "study1",
          },
        ],
      },
    ])
  })

  test('if no task', async () => {
    taggingClientMock.on(GetResourcesCommand).resolves({
      ResourceTagMappingList: []
    })
    const studyTask = await checkForStudyTask(new ResourceGroupsTaggingAPIClient, 'study1')
    expect(studyTask).toBe(false)
  })
})
