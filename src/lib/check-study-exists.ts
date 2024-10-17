import { GetResourcesCommand, ResourceGroupsTaggingAPIClient } from '@aws-sdk/client-resource-groups-tagging-api';

export async function checkForStudyTask(client: ResourceGroupsTaggingAPIClient, studyId: string): Promise<boolean> {
  const getResourcesCommand = new GetResourcesCommand({
      TagFilters: [
          {
              Key: 'studyId',
              Values: [studyId],
          },
      ],
      ResourceTypeFilters: ['ecs:task', 'ecs:task-definition'],
  })

  const taggedResources = await client.send(getResourcesCommand)

  if (taggedResources.ResourceTagMappingList?.length === 0) {
      return false
  }

  console.log(taggedResources.ResourceTagMappingList)

  return true
}
