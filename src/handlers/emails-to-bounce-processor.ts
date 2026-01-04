import { deleteContentFromS3, fetchContentFromS3 } from '../services/s3'
import { sendBounce } from '../services/ses'
import { BounceData, SQSEvent, SQSHandler, SQSRecord } from '../types'
import { log, logError } from '../utils/logging'
import { getDataFromRecord } from '../utils/message-processing'

/* Bounce processing */

const processSingleMessage = async (record: SQSRecord): Promise<void> => {
  const data = getDataFromRecord(record)
  const bounceData = await fetchContentFromS3<BounceData>(data.uuid, 'queue-bounced')

  const result = await sendBounce(bounceData.messageId, bounceData.recipients, bounceData.bounceSender, {
    bounceType: bounceData.bounceType,
  })

  log('Bounce sent successfully', {
    bounceMessageId: result.MessageId,
    messageId: bounceData.messageId,
    recipients: bounceData.recipients.length,
    uuid: data.uuid,
  })

  await deleteContentFromS3(data.uuid, 'queue-bounced')
}

export const emailsToBounceProcessorHandler: SQSHandler = async (event: SQSEvent): Promise<void> => {
  log('Received bounce processing payload', event)
  for (const record of event.Records) {
    try {
      await processSingleMessage(record)
    } catch (error: unknown) {
      logError(error)
    }
  }
}
