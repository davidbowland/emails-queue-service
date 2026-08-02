import { deleteAttachmentsFromS3, deleteContentFromS3, fetchContentFromS3, isMissingFromS3 } from '../services/s3'
import { generateEmailFromData, sendRawEmail } from '../services/ses'
import { EmailData, SQSBatchResponse, SQSEvent, SQSRecord } from '../types'
import { log, logError } from '../utils/logging'
import { getDataFromRecord } from '../utils/message-processing'

/* Queue processing */

// The content object is written before its message is enqueued, and the queue's 14-day
// retention is shorter than the bucket's 30-day queue/ lifecycle, so the object cannot expire
// underneath a live message. A missing object therefore means this message was already sent
// and its content cleaned up. That happens whenever an invocation dies after sending but
// before returning its batch response — SQS then redelivers the whole batch, including the
// records it already sent. Treating that as a failure would fail the batch forward on every
// retry and dead-letter records that were never attempted, so treat it as done instead.
const fetchQueuedContent = async (
  uuid: string,
): Promise<{ attachmentKeys: string[]; contents: EmailData } | undefined> => {
  try {
    return await fetchContentFromS3<EmailData>(uuid, 'queue')
  } catch (error: unknown) {
    if (!isMissingFromS3(error)) {
      throw error
    }
    logError(error)
    return undefined
  }
}

const processSingleMessage = async (record: SQSRecord): Promise<void> => {
  const data = getDataFromRecord(record)
  const queued = await fetchQueuedContent(data.uuid)
  if (queued === undefined) {
    return
  }

  const { attachmentKeys, contents } = queued
  const email = await generateEmailFromData(contents)
  await sendRawEmail(email)
  try {
    // The attachments are deleted here rather than when they are fetched so a retry after a
    // failed send still finds them and composes a complete email.
    await Promise.all([deleteContentFromS3(data.uuid), deleteAttachmentsFromS3(attachmentKeys)])
  } catch (error: unknown) {
    // The mail is already sent. Letting this bubble up would report the record as a
    // batch item failure and SQS would redeliver it, sending the email a second time.
    // This is the one error in this file that is swallowed on purpose; the orphaned objects
    // cost nothing because the bucket's lifecycle rules expire them anyway — 30 days under
    // queue/ for forwarded mail, 15 under attachments/ for mail composed here.
    logError(error)
  }
}

export const emailsToSendProcessorHandler = async (event: SQSEvent): Promise<SQSBatchResponse> => {
  log('Received payload', event)
  for (const [processed, record] of event.Records.entries()) {
    try {
      await processSingleMessage(record)
    } catch (error: unknown) {
      logError(error)
      // Every message on this queue shares one MessageGroupId, so SQS orders the whole
      // queue. Reporting only the failed record would let SQS delete the records behind
      // it while returning this one to the head of the queue, breaking that ordering.
      // Fail forward instead: stop here and return this record and all that follow.
      return {
        batchItemFailures: event.Records.slice(processed).map(({ messageId }) => ({ itemIdentifier: messageId })),
      }
    }
  }
  return { batchItemFailures: [] }
}
