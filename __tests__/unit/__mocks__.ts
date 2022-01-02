import { EmailData, SQSRecord } from '@types'

export const attachmentBuffer = Buffer.from("What's up party people?")

export const attachment = {
  checksum: 'jytgbni87ytgbnjkuy',
  cid: 'ytghji87ytgbhj',
  content: {
    type: 'Buffer',
    data: [...attachmentBuffer],
  },
  contentDisposition: 'attachment',
  contentId: 'j7ytgbnjhgfdert',
  contentType: 'text/plain',
  filename: 'big.file',
  headers: {
    author: 'Shakespeare',
  },
  related: false,
  size: 32_000,
}

export const email: EmailData = {
  from: 'A Person <email@address.com>',
  sender: 'A Person <email@address.com>',
  to: ['Another Person <another@address.com>'],
  replyTo: 'email@address.com',
  inReplyTo: 'ytfghj6tghj',
  references: ['87ytgbnmnbgf', '876tghjhtyu'],
  subject: 'Hi there!',
  text: 'Hello, world',
  html: '<p>Hello, world</p>',
  headers: {
    'Content-Type': 'text/html',
  },
  attachments: [attachment],
}

export const record: SQSRecord = {
  messageId: '19dd0b57-b21e-4ac1-bd88-01bbb068cb78',
  receiptHandle: 'MessageReceiptHandle',
  body: JSON.stringify(email),
  attributes: {
    ApproximateReceiveCount: '1',
    SentTimestamp: '1523232000000',
    SenderId: '123456789012',
    ApproximateFirstReceiveTimestamp: '1523232000001',
  },
  messageAttributes: {},
  md5OfBody: '{{{md5_of_body}}}',
  eventSource: 'aws:sqs',
  eventSourceARN: 'arn:aws:sqs:us-east-1:123456789012:MyQueue',
  awsRegion: 'us-east-1',
}

export const event = { Records: [record] }

export const uuid = 'aaaaa-uuuuu-uuuuu-iiiii-ddddd'
