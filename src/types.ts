import { BounceType } from '@aws-sdk/client-ses'

export * from 'aws-lambda'
export { BounceType } from '@aws-sdk/client-ses'

export interface Attachment {
  [key: string]: AttachmentContent
}

export interface AttachmentContent {
  [key: string]: string | Buffer
}

export interface EmailData {
  [key: string]: unknown
}

export interface MessageData {
  uuid: string
}

export interface BounceOptions {
  bounceType?: BounceType
}

export interface BounceData {
  messageId: string
  recipients: string[]
  bounceSender: string
  bounceType?: BounceType
}
