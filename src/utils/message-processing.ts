import { SQSRecord } from 'aws-lambda'

import { MessageData } from '../types'

/* Body */

export const getDataFromRecord = (record: SQSRecord): MessageData => JSON.parse(record.body)
