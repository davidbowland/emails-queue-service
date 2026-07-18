# Steering for emails-queue-service

## Description

The repository is part of a larger project called `emails`. It is an AWS Lambda with associated resources including an SQS FIFO queue.

Its purpose is to process queued email messages from SQS, retrieve email content and attachments from S3, compose the final email using nodemailer, send it via AWS SES, and clean up the S3 content after successful delivery.

## Code Layout

**src/handlers**

- Entry points into this lambda, like controllers for SQS events
- Always catch exceptions and log with `logError` - never let exceptions bubble up from handlers

**src/services**

- Services that interact with outside resources
- Have side-effects
- Only catch expected exceptions

**src/utils**

- Shared helper functions that are idempotent
- Have no side-effects
- Pure functions should not catch exceptions

**src/config.ts**

- Shared repository configurations
- Environment variables should ALWAYS be read through config
- jest.setup-test-env.js also needs to be updated when updating environment variables

**src/types.ts**

- ALL types or interfaces that are exported

**template.yaml**

- Infrastructure unique to this repository
- Infrastructure shared in the `emails` project is located in a separate `emails-infrastructure` repository, but most infrastructure should be domain-specific
- Defines the SQS FIFO queues and Lambda functions that process SQS events (not SES events directly)

**.github/workflows/pipeline.yaml**

- Definition of the GitHub Actions deployment script for this repository

**events/\*.json**

- Each handler has a json event file as an example of its input
- These files are used by tests

\***\*tests**/unit/**mocks**.ts\*\*

- Mock data that is either shared or too large to reasonably be within a test file (> 25 lines)
- Use typing, when possible, to ensure data is complete

\***\*tests**/unit/\*\*/\*\*\*

- Test files for all files in the src/ directory that are executable (excluding config and types)

\***\*tests**/tsconfig.json\*\*

- If adding a new directory within src/, `paths` in tsconfig need to be updated

## Rules for Development

- ALWAYS analyze existing patterns in the file and repository and follow them EXACTLY
- Use functional programming, when possible
- Use arrow functions
- **All exported functions must specify explicit types for all inputs and return values**
- Imports from within the repository should be relative (`../config`)
- When finished with changes, ALWAYS `npm run test` and ensure tests are passing with adequate coverage and ALWAYS `npm run typecheck` to ensure typing is sufficient
- Use comments to explain WHY rather than WHAT, and use them sparingly

### Queue Processing Considerations

- **Message Processing**: Each SQS message contains a UUID that maps to S3 content
- **Attachment Handling**: Attachments can be either Buffer data or S3 keys - handle both cases
- **Error Isolation**: Failed messages should not prevent other messages from processing
- **Resource Cleanup**: Always delete S3 content after successful email sending
- **FIFO Queue**: Messages are processed in order, but failures don't block subsequent messages

### Type Safety Requirements

```typescript
// All exported functions must have explicit types for parameters and return values:
export const getAccount = async (id: string): Promise<Account | null> => {
  // Implementation
}
```

### Logging Standards

Use the logging utilities from `src/utils/logging.ts`:

```typescript
// Logging Levels and Usage:
// - log(): For informational messages (queue processing, email sending)
// - logError(): For exceptions that require admin attention

// Examples:
log('Processing SQS message', { messageId, uuid })
log('Email sent successfully', { uuid, messageId })
logError('Failed to process queued email', { uuid, error: error.message })

// NEVER log PII - use sanitized identifiers:
log('Processing email', { uuid: 'email-123' }) // Good
log('Processing email', { to: 'user@domain.com' }) // BAD - PII

// Always include context objects for structured logging
// Use X-Ray tracing for AWS service calls via xrayCapture()
```

### Error Handling Patterns

```typescript
// 1. Handler Level - Always catch and log, never throw:
export const emailsToSendProcessorHandler = async (event: SQSEvent): Promise<void> => {
  for (const record of event.Records) {
    try {
      await processSingleMessage(record)
    } catch (error: unknown) {
      logError(error) // This logs the error for admin attention
      // Continue processing other records
    }
  }
}

// 2. Utility Level - Pure functions should not catch:
export const getDataFromRecord = (record: SQSRecord): MessageData => {
  // Let parsing errors bubble up naturally
  return JSON.parse(record.body)
}
```

### X-Ray Tracing Patterns

```typescript
// Always wrap AWS clients with xrayCapture:
const s3 = xrayCapture(new S3Client({ apiVersion: '2006-03-01' }))
const ses = xrayCapture(new SESClient({ apiVersion: '2010-12-01', region: emailRegion }))

// X-Ray automatically traces AWS SDK calls when clients are wrapped with xrayCapture
```

## Rules for Testing

- ALWAYS analyze existing patterns in the file and repository and follow them EXACTLY
- **ALL TESTS MUST BE DETERMINISTIC** (no randomness, conditionals, or time-dependent values)
- Use comments to explain WHY rather than WHAT, and use them sparingly
- Paths like `@handlers/` are defined in **tests**/tsconfig.json to access files in src/
- Every event from AWS should have a matching JSON file in events/ (if not, create one)
- Jest is configured to clear mocks after each test -- NEVER CALL jest.clearAllMocks()
- NEVER use beforeEach or afterEach -- use shared setup/teardown functions defined within the test and invoke them in each test
- EXCLUSIVELY use `mock...Once` in tests and `mock...` (without Once) in beforeAll
- Use jest.mocked for type-safe mocking
- NEVER use jest.spyOn
- Every exported function should be tested on its own with its own describe block

### Deterministic Testing Requirements

```typescript
// BAD - Non-deterministic:
const timestamp = Date.now()
const randomId = Math.random().toString()
const conditionalValue = Math.random() > 0.5 ? 'a' : 'b'

// GOOD - Deterministic:
const fixedTimestamp = 1640995200000 // Use fixed values
const testId = 'test-message-id-123'
const expectedValue = 'a' // Use consistent test data
```

### AWS SDK v3 Mocking Patterns

```typescript
// For AWS SDK v3 clients, mock the client constructor and commands:
const mockSend = jest.fn()
jest.mock('@aws-sdk/client-ses', () => ({
  SESClient: jest.fn(() => ({
    send: (...args) => mockSend(...args),
  })),
  SendRawEmailCommand: jest.fn().mockImplementation((x) => x),
}))

// Always mock the xrayCapture utility:
jest.mock('@utils/logging', () => ({
  log: jest.fn(),
  logError: jest.fn(),
  xrayCapture: jest.fn().mockImplementation((x) => x),
}))

// In tests, use mockSend to control behavior:
beforeAll(() => {
  mockSend.mockResolvedValue({ Body: 'expected-result' })
})

// For specific test cases:
mockSend.mockResolvedValueOnce({/* specific response */})
mockSend.mockRejectedValueOnce(new Error('AWS error'))
```

### Service Mocking Patterns

For mocking imports NOT initialized on load like other services:

```typescript
import * as sesService from '@services/ses'

const emailBuffer = Buffer.from('email content')

beforeAll(() => {
  jest.mocked(sesService).generateEmailFromData.mockResolvedValue(emailBuffer)
})
```

For mocking nodemailer (initialized on load):

```typescript
const mockBuild = jest.fn()
const mockCompile = jest.fn()
jest.mock('nodemailer/lib/mail-composer', () =>
  jest.fn().mockImplementation(() => ({
    compile: () => mockCompile(),
  })),
)

beforeAll(() => {
  mockCompile.mockReturnValue({ build: mockBuild })
})
```
