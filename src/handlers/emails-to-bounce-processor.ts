import { deleteContentFromS3, fetchContentFromS3, isMissingFromS3 } from '../services/s3'
import { sendBounce } from '../services/ses'
import { BounceData, SQSBatchResponse, SQSEvent, SQSRecord } from '../types'
import { log, logError } from '../utils/logging'
import { getDataFromRecord } from '../utils/message-processing'

/* Bounce processing */

// See the matching note in emails-to-send-processor: a missing content object means this
// message was already bounced and cleaned up, so treat it as done rather than failing it
// forward. BatchSize is 1 here, so the blast radius is only this message, but the failure
// mode is identical.
const fetchQueuedBounce = async (uuid: string): Promise<BounceData | undefined> => {
  try {
    // Bounce payloads never carry attachments, so attachmentKeys is always empty here
    const { contents } = await fetchContentFromS3<BounceData>(uuid, 'queue-bounced')
    return contents
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
  const bounceData = await fetchQueuedBounce(data.uuid)
  if (bounceData === undefined) {
    return
  }

  const result = await sendBounce(bounceData.messageId, bounceData.recipients, bounceData.bounceSender, {
    bounceType: bounceData.bounceType,
  })

  log('Bounce sent successfully', {
    bounceMessageId: result.MessageId,
    messageId: bounceData.messageId,
    recipients: bounceData.recipients.length,
    uuid: data.uuid,
  })

  try {
    await deleteContentFromS3(data.uuid, 'queue-bounced')
  } catch (error: unknown) {
    // The bounce is already sent. Letting this bubble up would report the record as a
    // batch item failure and SQS would redeliver it, sending the bounce a second time.
    // This is the one error in this file that is swallowed on purpose; the orphaned
    // object is small and falls under the bucket's catch-all expiration rule.
    logError(error)
  }
}

export const emailsToBounceProcessorHandler = async (event: SQSEvent): Promise<SQSBatchResponse> => {
  log('Received bounce processing payload', event)
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
