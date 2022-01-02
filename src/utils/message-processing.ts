import { SQSRecord } from 'aws-lambda'

import { MessageData } from '../types'

/* Body */

export const getDataFromRecord = (record: SQSRecord): Promise<MessageData> =>
  new Promise((resolve) => resolve(JSON.parse(record.body)))
