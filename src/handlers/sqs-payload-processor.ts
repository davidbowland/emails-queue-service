import { SQSEvent, SQSHandler, SQSRecord } from 'aws-lambda'

import { generateEmailFromData, sendRawEmail } from '../services/ses'
import { handleErrorNoDefault } from '../util/error-handling'
import { getDataFromRecord } from '../util/message-processing'

/* Queue processing */

export const processSingleMessage = (record: SQSRecord) =>
  getDataFromRecord(record).then((data) => generateEmailFromData(data.email).then((email) => sendRawEmail(email)))

export const sqsPayloadProcessorHandler: SQSHandler = (event: SQSEvent) =>
  event.Records.reduce(
    (previous, record) => previous.then(() => exports.processSingleMessage(record).catch(handleErrorNoDefault())),
    Promise.resolve(undefined)
  )
