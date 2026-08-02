# Project Guidelines

**Always commit changes** after completing work unless explicitly told not to.

This service is part of the `emails` project. It is an AWS Lambda service with an associated SQS FIFO queue pair.
It processes queued email messages from SQS, retrieves email content and attachments from S3, composes the final
email with nodemailer's `MailComposer`, sends it via AWS SES (`SendRawEmail` for outbound sends, `SendBounce` for
bounces), and cleans up the S3 content after a successful send. Infrastructure shared across the `emails` project
lives in a separate `emails-infrastructure` repo; most infrastructure here is domain-specific to this service (it
defines the SQS FIFO queues and the Lambda functions that process SQS events, not SES events directly).

Use functional programming style where practical, including dependency injection, avoiding mutating objects or
values, etc.

## Code Layout

- **src/handlers** — entry points into the lambdas, like controllers for SQS events. Always catch exceptions and
  log with `logError`; never let exceptions bubble up from handlers.
- **src/services** — services that interact with outside resources (the AWS SDK, nodemailer). Have side effects;
  only catch expected exceptions.
- **src/utils** — shared helper functions that are idempotent and have no side effects. Pure functions should not
  catch exceptions.
- **src/config.ts** — shared repository configuration. Environment variables should ALWAYS be read through config.
  `jest.setup-test-env.js` also needs to be updated when adding/changing environment variables.
- **src/types.ts** — all exported types or interfaces.
- **template.yaml** — infrastructure unique to this repository: the SQS FIFO queues and the Lambda functions that
  process them.
- **.github/workflows/pipeline.yaml** — the GitHub Actions deployment pipeline for this repository.
- **events/\*.json** — example event payloads for each handler, used by tests.
- **\_\_tests\_\_/unit/\_\_mocks\_\_.ts** — mock data that is shared or too large to reasonably live in a test file
  (> 25 lines). Use typing where possible.
- **\_\_tests\_\_/unit/\*\*/\*** — test files for everything executable in src/ (excluding config and types).
- **\_\_tests\_\_/tsconfig.json** — update `paths` here when adding a new directory within src/.

## Rules for Development

- Always analyze existing patterns in the file and repository and follow them exactly.
- Use arrow functions.
- All exported functions must specify explicit types for all inputs and return values.
- Imports from within the repository are relative (e.g. `../config`); the `@config`/`@events`/`@handlers`/
  `@services`/`@types`/`@utils` aliases only resolve under `__tests__/` (see `__tests__/tsconfig.json`).
- Never log PII — use sanitized identifiers (`log('Processing SQS message', { uuid })`, not the raw recipient
  address).
- Each SQS message carries a UUID that maps to S3 content; attachments may be either inline `Buffer` data or S3
  keys, both must be handled. FIFO ordering means messages are processed in order, and a failure on one message
  deliberately blocks the rest of the batch — see the fail-forward note under Security. Always delete the S3
  content only after a successful send.

## Testing Standards

**Jest clears all mocks automatically** (`clearMocks: true` in jest.config.ts). Never manually clear mocks.

**Mock state:** Set shared defaults in `beforeAll`. Override per-test with `mockReturnValueOnce` /
`mockResolvedValueOnce` / `mockRejectedValueOnce`. Never use `beforeEach`/`afterEach` — write a named `setup()`
function if repeated arrangement is needed and call it explicitly.

**Non-determinism:** Any function that uses `Date.now()`, `Math.random()`, or `crypto.randomUUID()` to produce a
value that affects test outcomes MUST accept it as an injectable parameter with a default:

```ts
// source
export const createThing = (input: Input, now = Date.now): Thing => ({ ...input, createdAt: now() })

// test
it('sets createdAt', () => {
  expect(createThing(input, () => 1_000_000).createdAt).toBe(1_000_000)
})
```

**Fake timers:** Use `jest.useFakeTimers()` in `beforeAll` (and `jest.useRealTimers()` in `afterAll`) when the code
under test calls `setTimeout`, `setInterval`, or `Date` internally without injection.

**No `if` statements in tests.** No live `Date.now()` or `Math.random()` calls in test bodies. No date arithmetic
that depends on the current wall-clock time. Never use `jest.spyOn` — use `jest.mocked` for type-safe mocking of
already-mocked modules instead. Every exported function is tested on its own with its own `describe` block. Every
SQS event should have a matching JSON fixture in `events/` (create one if missing).

**Deterministic above all.** A test that passes today and fails tomorrow is broken.

## Security

**IAM least privilege.** The send processor's `SESCrudPolicy` is broader than needed (send-only would suffice);
the bounce processor's `SESSendBouncePolicy` is already appropriately narrow. Avoid `Resource: "*"` in any new
policy statement.

**Dead-letter queues and fail-forward batch responses.** Each FIFO queue has a FIFO DLQ with `maxReceiveCount: 3`,
and both event sources declare `FunctionResponseTypes: [ReportBatchItemFailures]`. The handlers no longer swallow
processing errors: on a failure they call `logError` and return the failing record **and every record after it**
as `batchItemFailures`, then stop. That fail-forward shape is mandatory, not a convenience — `emails-queue-api`
publishes every message with a single static `MessageGroupId`, so SQS orders the entire queue, and reporting only
the failing record would let SQS delete the messages queued behind it while redelivering that one. Preserve this
when touching the handlers; per-record failure reporting would silently break ordering. The one deliberate
exception is the S3 delete that follows a successful send or bounce: its error is caught and logged so a retry can
never send the same mail twice, and the comment there explains why.

**A missing content object means already-sent, not failure.** Both processors treat `NoSuchKey`/`NotFound` on the
primary `queue/`/`queue-bounced/` object as work already done and return success for that record. The object is
written before its message is enqueued and the 14-day queue retention is shorter than the 30-day `queue/` lifecycle,
so it cannot expire under a live message — a miss can only mean an earlier invocation sent it and cleaned up before
returning its batch response. Failing the record instead would fail the batch forward on every retry and
dead-letter records that were never attempted. Any other fetch error must still propagate.

**Attachment keys are payload-controlled and constrained by shape.** `emails-email-api` validates only that
`attachment.content` is truthy, so the key arrives here untrusted. `isStoredOnS3` requires exactly three segments —
`attachments/{accountId}/{uuid}` or `queue/{uuid}/{id}`, the only shapes the two producers write. A key failing that
is treated as not-S3-stored, so it is neither fetched into an outbound email nor deleted.

The third segment is the point, not neatness: two-segment `queue/{uuid}` is where `emails-queue-api` stores a queued
email's entire plaintext, so admitting it would let a crafted payload attach another message wholesale and then
delete it — which the already-sent guard above reads as success, so that mail would silently never go out.

This is shape scoping, **not tenant scoping**. `attachments/{someone-elses-account}/{uuid}` still matches. Closing
that requires validation in `emails-email-api`, where the key is accepted; this is only the local guard.

**Attachments are deleted after the send, never during the fetch, and only if they were read.** `fetchContentFromS3`
returns the keys of the attachments it successfully fetched — not the keys the payload asked for — and deletes
nothing; the send handler deletes them next to the main object once `sendRawEmail` resolves. An attachment whose
fetch failed is dropped from the email, so deleting its object would destroy the only copy of something the code
just admitted it could not read; the bucket's lifecycle rules expire it regardless. Folding the delete back into the fetch looks like a tidy simplification and is not one — it destroys the
attachments before the message is safely sent, so a retry after a failed send delivers the email with its
attachments silently missing and the bytes gone for good. Relatedly, `isStoredOnS3` tests for a string rather than
negating the `Buffer` case so that key collection, which runs outside `transformAttachmentBuffers`' catch, cannot
throw on a malformed attachment and fail the whole message.

**OWASP Top 10.** Primary exposure for this Lambda: A05 Security Misconfiguration (IAM — scope actions to specific
resource ARNs, avoid broad `service:*` grants).
