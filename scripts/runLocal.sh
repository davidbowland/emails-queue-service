#!/usr/bin/env bash

# Stop immediately on error
set -e

if [[ -z "$1" ]]; then
  $(./scripts/assumeDeveloperRole.sh)
fi

# Only install production modules
export NODE_ENV=production

# Build the project
SAM_TEMPLATE=template.yaml
sam build --template ${SAM_TEMPLATE}

# Start the service locally
export EMAIL_BUCKET=emails-service-storage
export EMAIL_REGION=us-east-1
sam local invoke --event events/event-sqs.json --parameter-overrides "Environment=test" --log-file local.log
