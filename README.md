# SafeInsights Setup Application

## Development

Currently images from this repo need to be manually pushed by a developer. This can be done by running the following script after setting appropriate AWS credentials:

```bash
$ ./deploy/push-ecr-image.sh
```

**NOTE:** The script attempts to auto-detect the target AWS region, but you may need to either set `AWS_REGION` in your environment or update your profile configuration with a `region` value.

### Developer testing

Currently, the application polling loop does not perform any actual work. Instead, the application can be tested by invoking a `run-studies.ts` script either locally or in the deployed container on ECS Fargate.

#### Local testing steps

Create a `.env` file from the example and populate with valid values. Note that the AWS values can be easily referenced in a deployed stack per [these environment variables](https://github.com/safeinsights/iac/blob/601155a55785996f736b0ed207945a9535c19371/secure-enclave/stack.ts#L273-L276) in the active task / task definition:

```bash
$ cp .env.example .env
```

Run the script (make sure you have AWS credentials for your target region created):

```bash
$ npm install
$ npx tsx --env-file=.env ./src/lib/run-studies.ts
```
