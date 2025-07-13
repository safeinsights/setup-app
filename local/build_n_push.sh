#!/bin/bash
DOCKER_AUTH_FILE="$1"
HARBOR_USERNAME=$(jq -r ".username" "$DOCKER_AUTH_FILE")
HARBOR_PASSWORD=$(jq -r ".password" "$DOCKER_AUTH_FILE")
SERVER_ENDPOINT=$(jq -r ".serveraddress" "$DOCKER_AUTH_FILE")
echo "$HARBOR_PASSWORD" | docker login "$SERVER_ENDPOINT" --username "$HARBOR_USERNAME" --password-stdin

JOB_ID="$2"

docker buildx build  -t harbor.safeinsights.org/openstax/code-builds/dev:$JOB_ID  ./local
# docker push harbor.safeinsights.org/openstax/code-builds/dev:$JOB_ID


### Example of use case

# ./local/build_n_push.sh local/docker-auth.local 01973642-3c76-7540-b474-6b62b6151246
