import { SQSEvent, SQSHandler, SQSRecord } from 'aws-lambda'

import { generateEmailFromData, sendRawEmail } from '../services/ses'
import { getDataFromRecord } from '../util/message-processing'

/* Queue processing */

export const processSingleMessage = (record: SQSRecord) =>
  getDataFromRecord(record).then((data) => generateEmailFromData(data.email).then((email) => sendRawEmail(email)))

export const sqsPayloadProcessorHandler: SQSHandler = (event: SQSEvent) => {
  // All log statements are written to CloudWatch by default. For more information, see
  // https://docs.aws.amazon.com/lambda/latest/dg/nodejs-prog-model-logging.html
  console.info(JSON.stringify(event))
  return Promise.all(event.Records.map((record) => exports.processSingleMessage(record))).then(() => undefined)
}
