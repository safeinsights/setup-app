# SafeInsights Setup Application

## Development

?Currently images from this repo need to be manually pushed by a developer. This can be done by running the following script after setting appropriate AWS credentials:

```bash
$ ./deploy/push-ecr-image.sh
```

**NOTE:** The script attempts to auto-detect the target AWS region, but you may need to either set `AWS_REGION` in your environment or update your profile configuration with a `region` value.

### Developer testing

The `/scripts` dir contains two options for triggering the app to poll and run jobs. `poll` triggers every hour and is what runs on prod. To test manually, use `manual-run`.

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

-   `--ignore-aws`: provide if you do not want the setup app to filter out jobs that have previously been created in AWS, i.e. if you want to run the same job twice.
