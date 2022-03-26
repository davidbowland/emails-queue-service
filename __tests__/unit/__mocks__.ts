import { EmailData, SQSRecord } from '@types'

export const attachmentBuffer = Buffer.from("What's up party people?")

export const attachment = {
  checksum: 'jytgbni87ytgbnjkuy',
  cid: 'ytghji87ytgbhj',
  content: {
    data: [...attachmentBuffer],
    type: 'Buffer',
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
  attachments: [attachment],
  from: 'A Person <email@address.com>',
  headers: {
    'Content-Type': 'text/html',
  },
  html: '<p>Hello, world</p>',
  inReplyTo: 'ytfghj6tghj',

  references: ['87ytgbnmnbgf', '876tghjhtyu'],
  replyTo: 'email@address.com',

  sender: 'A Person <email@address.com>',
  subject: 'Hi there!',
  text: 'Hello, world',
  to: ['Another Person <another@address.com>'],
}

export const record: SQSRecord = {
  attributes: {
    ApproximateFirstReceiveTimestamp: '1523232000001',
    ApproximateReceiveCount: '1',
    SenderId: '123456789012',
    SentTimestamp: '1523232000000',
  },
  awsRegion: 'us-east-1',
  body: JSON.stringify(email),
  eventSource: 'aws:sqs',
  eventSourceARN: 'arn:aws:sqs:us-east-1:123456789012:MyQueue',
  md5OfBody: '{{{md5_of_body}}}',
  messageAttributes: {},
  messageId: '19dd0b57-b21e-4ac1-bd88-01bbb068cb78',
  receiptHandle: 'MessageReceiptHandle',
}

export const event = { Records: [record] }

export const uuid = 'aaaaa-uuuuu-uuuuu-iiiii-ddddd'
