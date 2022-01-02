import { S3 } from 'aws-sdk'

import { deleteContentFromS3, fetchContentFromS3 } from '../services/s3'
import { generateEmailFromData, sendErrorEmail, sendRawEmail } from '../services/ses'
import { SQSBatchResponse, SQSEvent, SQSHandler, SQSRecord } from '../types'
import { log } from '../utils/logging'
import { getDataFromRecord } from '../utils/message-processing'

/* Queue processing */

export const processSingleMessage = (record: SQSRecord): Promise<S3.DeleteObjectOutput> =>
  getDataFromRecord(record).then((data) =>
    fetchContentFromS3(data.uuid)
      .then(generateEmailFromData)
      .then(sendRawEmail)
      .then(() => deleteContentFromS3(data.uuid))
  )

export const sqsPayloadProcessorHandler: SQSHandler = (event: SQSEvent): Promise<SQSBatchResponse> =>
  log('Received payload', event).then(() =>
    event.Records.reduce(
      // Process emails one at a time, in order
      (previous, record) =>
        previous.then(() => exports.processSingleMessage(record).catch((error) => sendErrorEmail(event, error))),
      Promise.resolve(undefined)
    )
  )
