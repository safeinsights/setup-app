# SafeInsights Setup Application

## This application is responsible for:

- Polling the Management App for studies that are ready.
- Running the Research Container against Secure Enclave data sets.

## Development

Running the CD pipeline will deploy new images from this repo. To manually push the image, run the following script after setting appropriate AWS credentials:

```bash
$ ./deploy/push-ecr-image.sh
```

**NOTE:** The script attempts to auto-detect the target AWS region, but you may need to either set `AWS_REGION` in your environment or update your profile configuration with a `region` value.

### Developer testing

The `/scripts` dir contains two options for triggering the app to poll and run jobs. `poll` will run jobs at a set interval and is what runs on prod. To manually trigger a poll+run cycle, use `manual-run`.

#### Local testing steps

Create a `.env` file from the example and populate with valid values. Note that the AWS values can be easily referenced in a deployed stack per [these environment variables](https://github.com/safeinsights/iac/blob/601155a55785996f736b0ed207945a9535c19371/secure-enclave/stack.ts#L273-L276) in the active task / task definition:

```bash
$ cp .env.example .env
```

Run the script (make sure you have AWS credentials for your target region created):

```bash
$ npm install
$ npx tsx ./src/scripts/manual-run.ts
```

Options:

- `--ignore-aws`: provide if you do not want the setup app to filter out jobs that have previously been created in AWS, i.e. if you want to run the same job twice.

### Authentication with Management App

In `.env`, set the value of `MANAGEMENT_APP_PRIVATE_KEY` using key you set up to authenticate member routes on the [management app](https://github.com/safeinsights/management-app?tab=readme-ov-file#enclave-api-routes).


## Enclave Environments
### Architecture

The different enclave environments extend the generic `Enclave` class and implement the `IEnclave` interface. This design allows for flexibility and ease of extension when implementing new enclave environments.

Currently, the Docker and Kubernetes environments extend `Enclave` as `DockerEnclave` and `KubernetesEnclave`, respectively. Each environment has custom implementations for methods that deploy jobs, list, and filter containers. This approach enables a modular design where each environment can be maintained and updated independently without affecting other environments.

### Docker

The Setup App can be deployed in a Docker environment using the [docker-compose.yml](docker-compose.yml) file. The Docker engine API is used to perform various operations such as:

* Pulling images from private registries
* Listing and filtering containers
* Starting, stopping, and removing containers

#### Requirements

To start the Setup app using Docker, the following environment variables must be set:

* `DEPLOYMENT_ENVIRONMENT`: Set to `DOCKER` to indicate that the deployment is running in a Docker environment.
* `DOCKER_SOCKET`: Points to the path where the `docker.sock` file is mounted. This socket is used to build REST API requests to the Docker Engine.
* `DOCKER_API_HOST`: Specifies the host where the Docker Engine API is available.
* `DOCKER_API_PORT`: Indicates the port where the Docker Engine API is exposed.
* `DOCKER_API_VERSION`: Specifies the version of the Docker Engine API to use when building URLs for REST requests.
* `DOCKER_REGISTRY_AUTH`: A base64-encoded value used to authenticate against private registries.

#### Enabling the Docker Engine API (Development)

To access the Docker Engine API, you need to enable it. The process varies depending on your environment:

**Mac OS:**

You can use `socat` to expose the Docker socket and create a listening port:
```bash
    socat TCP-LISTEN:2375,reuseaddr,fork UNIX-CONNECT:/var/run/docker.sock
```
This command listens for incoming connections on port 2375 and forwards them to the local Docker socket.

For more information, refer to the Stack Overflow question [here](https://stackoverflow.com/questions/39411126/access-docker-daemon-remote-api-on-docker-for-mac).

**Linux Environment:**

To start the Docker daemon with a specific host and port:

1. Find the current configuration file (usually `/etc/docker/daemon.json`).
2. Add or modify the `hosts` property to specify the listening host and port:
```json
{
  "hosts": ["tcp://localhost:2375"]
}
```
3. Restart the Docker daemon.

For more information, refer to the Docker documentation [here](https://docs.docker.com/engine/daemon/remote-access/).

**Important Note:**

When exposing the Docker Engine API on a remote port, only accept connections from localhost to prevent unauthorized access.

To obtain the Registry token for private registries:

```bash
TOKEN=$(aws ecr get-authorization-token --output text --query 'authorizationData[].authorizationToken')
```
This command retrieves an authorization token that can be used to authenticate with private Docker registries.


### Usage

To start the container using [docker-compose.yml](docker-compose.yml), run the following command
```bash
docker-compose -f docker-compose.yml up -d
```
This command starts the container in detached mode, which means it runs in the background.

In order to stop and remove the container, use:
```bash
docker-compose -f docker-compose.yml down 
```

Please Remember to set the required environment variables (e.g., `DEPLOYMENT_ENVIRONMENT`, `DOCKER_SOCKET`, etc.) before starting the container.
