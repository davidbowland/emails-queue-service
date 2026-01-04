import { deleteContentFromS3, fetchContentFromS3 } from '../services/s3'
import { generateEmailFromData, sendRawEmail } from '../services/ses'
import { EmailData, SQSEvent, SQSHandler, SQSRecord } from '../types'
import { log, logError } from '../utils/logging'
import { getDataFromRecord } from '../utils/message-processing'

/* Queue processing */

const processSingleMessage = async (record: SQSRecord): Promise<void> => {
  const data = getDataFromRecord(record)
  const contents = await fetchContentFromS3<EmailData>(data.uuid, 'queue')
  const email = await generateEmailFromData(contents)
  await sendRawEmail(email)
  await deleteContentFromS3(data.uuid)
}

export const emailsToSendProcessorHandler: SQSHandler = async (event: SQSEvent): Promise<void> => {
  log('Received payload', event)
  for (const record of event.Records) {
    try {
      await processSingleMessage(record)
    } catch (error: unknown) {
      logError(error)
    }
  }
}
