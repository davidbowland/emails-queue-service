# Lambdas for Email Queue Service

Lambdas for email queue service, which processes and sends the outbound SQS queue. Emails can be sent or bounced.

## Setup

The `developer` role is required to deploy this project.

### Node / NPM

1. [Node](https://nodejs.org/en/)
1. [NPM](https://www.npmjs.com/)

### AWS Credentials

To run locally, [AWS CLI](https://aws.amazon.com/cli/) is required in order to assume a role with permission to update resources. Install AWS CLI with:

```brew
brew install awscli
```

If file `~/.aws/credentials` does not exist, create it and add a default profile:

```toml
[default]
aws_access_key_id=<YOUR_ACCESS_KEY_ID>
aws_secret_access_key=<YOUR_SECRET_ACCESS_KEY>
region=us-east-1
```

If necessary, generate a [new access key ID and secret access key](https://docs.aws.amazon.com/general/latest/gr/aws-sec-cred-types.html#access-keys-and-secret-access-keys).

Add a `developer` profile to the same credentials file:

```toml
[developer]
role_arn=arn:aws:iam::<account number>:role/developer
source_profile=default
mfa_serial=<YOUR_MFA_ARN>
region=us-east-1
```

If necessary, retrieve the ARN of the primary MFA device attached to the default profile:

```bash
aws iam list-mfa-devices --query 'MFADevices[].SerialNumber' --output text
```

### SSM Parameters

The dead-letter queue alarm topic emails the address stored in SSM Parameter Store. CloudFormation
resolves it at **deploy time** — `template.yaml`'s `AlertEmailAddressPath` parameter is an
`AWS::SSM::Parameter::Value<String>` — so no Lambda reads SSM, no function needs `ssm:GetParameter`,
and nothing here changes at runtime.

**The parameter must exist before every deploy, including the first**, or CloudFormation fails while
resolving it — delete it later and every subsequent change set fails on an otherwise healthy stack.

Use the address that is already subscribed. A matching value changes nothing and sends no confirmation
email; any difference makes CloudFormation delete the confirmed subscription and create an unconfirmed
one, and dead-letter alarms go nowhere until someone clicks the link. Check what is subscribed first:

```bash
aws sns list-subscriptions --region us-east-1 \
  --query "Subscriptions[?contains(TopicArn, 'emails-queue-service')].[TopicArn,Endpoint,SubscriptionArn]" \
  --output table
```

Then create one parameter per environment. SSM parameters are region-scoped and must live in the
region the stack deploys to:

```bash
aws ssm put-parameter --type String --region us-east-1 \
  --name /emails-queue-service/alert-email-address \
  --value you@example.com

aws ssm put-parameter --type String --region us-east-1 \
  --name /emails-queue-service-test/alert-email-address \
  --value you@example.com
```

Add `--overwrite` to change an existing value. A change takes effect on the next deploy: CloudFormation
reads the parameter when it builds the change set, not continuously.

The type is `String`, not `SecureString`: CloudFormation SSM parameter types accept only `String` and
`StringList`. An email address for alarm mail is not a credential, so nothing is lost.

This repo provisions only its own `/emails-queue-service*/` paths. The **shared** `/emails/*`
parameters are provisioned from `emails-email-api` — do not write them from here, or two places can
disagree about the same value.

## Developing Locally

### Unit Tests

[Jest](https://jestjs.io/) tests are run automatically on commit and push. If the test coverage threshold is not met, the push will fail. See `jest.config.ts` for coverage threshold.

Manually run tests with:

```bash
npm run test
```

### Prettier / Linter

Both [Prettier](https://prettier.io/) and [ESLint](https://eslint.org/) are executed on commit. Manually prettify and lint code with:

```bash
npm run lint
```

### Deploying to Production

Deployment is handled by the GitHub Actions pipeline (`.github/workflows/pipeline.yaml`). On every push, unit tests run first. Pushes to `master` then `sam build` (esbuild, bundling each handler) and `sam package` the stack, deploy it to the testing account, and finally deploy the same packaged template to production. Feature branches instead build and deploy directly to the single shared `emails-queue-service-test` stack (not a stack unique to the branch — concurrent feature branches overwrite whatever was deployed there previously). After a successful production deploy, a final job bumps the package version and pushes the tag.

To build and deploy manually (requires the `developer` role, see Setup above). Nothing needs to be exported: the dead-letter queue alarm address comes from SSM Parameter Store (see [SSM Parameters](#ssm-parameters)), and `npm run deploy` targets the `emails-queue-service-test` stack:

```bash
npm run deploy
```

## Additional Documentation

- [AWS Lambda](https://aws.amazon.com/lambda/)

- [ESLint](https://eslint.org/)

- [Jest](https://jestjs.io/)

- [Prettier](https://prettier.io/)
