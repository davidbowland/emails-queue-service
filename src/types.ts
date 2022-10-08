export * from 'aws-lambda'

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
