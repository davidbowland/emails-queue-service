import { SQSRecord } from 'aws-lambda'

import { handleErrorWithDefault } from './error-handling'

export interface EmailData {
  [key: string]: unknown
}

export interface MessageData {
  email?: EmailData
}

/* Body */

export const getDataFromRecord = (record: SQSRecord): Promise<MessageData> =>
  new Promise((resolve) => resolve(JSON.parse(record.body))).catch(handleErrorWithDefault({}))
