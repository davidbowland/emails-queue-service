#!/usr/bin/env bash

# Stop immediately on error
set -e

if [[ -z "$1" ]]; then
  $(./scripts/assumeDeveloperRole.sh)
fi

# Build from template

SAM_TEMPLATE=template.yaml
sam build --template ${SAM_TEMPLATE} --use-container

# Deploy build lambda

TESTING_ARTIFACTS_BUCKET=aws-sam-cli-managed-emails-queue-artifactsbucket-occwq1o9816t
TESTING_CLOUDFORMATION_EXECUTION_ROLE="arn:aws:iam::$AWS_ACCOUNT_ID:role/aws-sam-cli-managed-email-CloudFormationExecutionR-1XI44HO3NYW46"
TESTING_STACK_NAME=emails-queue-service-test
sam deploy --stack-name ${TESTING_STACK_NAME} \
           --capabilities CAPABILITY_IAM \
           --region us-east-1 \
           --s3-bucket ${TESTING_ARTIFACTS_BUCKET} \
           --no-fail-on-empty-changeset \
           --role-arn ${TESTING_CLOUDFORMATION_EXECUTION_ROLE} \
           --parameter-overrides "Environment=test"
