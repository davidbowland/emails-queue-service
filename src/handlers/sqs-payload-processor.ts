import { SQSEvent, SQSHandler, SQSRecord } from 'aws-lambda'

import { deleteContentFromS3, fetchContentFromS3 } from '../services/s3'
import { generateEmailFromData, sendRawEmail } from '../services/ses'
import { handleErrorNoDefault } from '../util/error-handling'
import { getDataFromRecord } from '../util/message-processing'

/* Queue processing */

export const processSingleMessage = (record: SQSRecord) =>
  getDataFromRecord(record).then((data) =>
    fetchContentFromS3(data.uuid)
      .then(generateEmailFromData)
      .then(sendRawEmail)
      .then(() => deleteContentFromS3(data.uuid))
  )

export const sqsPayloadProcessorHandler: SQSHandler = (event: SQSEvent) => (
  console.log('Received payload', event),
  event.Records.reduce(
    // Process emails one at a time, in order
    (previous, record) => previous.then(() => exports.processSingleMessage(record).catch(handleErrorNoDefault())),
    Promise.resolve(undefined)
  )
)
