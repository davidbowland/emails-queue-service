import { S3 } from 'aws-sdk'

import { emailBucket } from '../config'
import { handleErrorWithDefault } from '../util/error-handling'
import { EmailData } from '../util/message-processing'

const s3 = new S3({ apiVersion: '2006-03-01' })
export interface Attachment {
  [key: string]: { [key: string]: string | Buffer }
}

const getContentFromAttachment = (attachment: Attachment) =>
  Promise.resolve(
    attachment.content.type === 'Buffer'
      ? Buffer.from(attachment.content.data)
      : exports
        .getS3Object(attachment.content as unknown as string)
        .then((content) => exports.deleteS3Object(attachment.content).then(() => content))
  )

const transformAttachmentBuffers = (email: EmailData) =>
  email.attachments
    ? (email.attachments as Attachment[]).map((attachment) =>
      getContentFromAttachment(attachment).then((content) => ({
        ...attachment,
        content,
      }))
    )
    : []

export const fetchContentFromS3 = (uuid: string): Promise<EmailData> =>
  exports
    .getS3Object(`queue/${uuid}`)
    .then(JSON.parse)
    .then((email: EmailData) =>
      Promise.all(transformAttachmentBuffers(email)).then((attachments) => ({
        ...email,
        attachments,
      }))
    )

export const deleteContentFromS3 = (uuid: string): Promise<S3.DeleteObjectOutput> =>
  exports.deleteS3Object(`queue/${uuid}`)

/* Get */

export const getS3Object = (key: string): Promise<string | Buffer> =>
  s3
    .getObject({ Bucket: emailBucket, Key: key })
    .promise()
    .then((result) => (result.Body ?? '') as string)
    .catch(handleErrorWithDefault(''))

/* Delete */

export const deleteS3Object = (key: string): Promise<S3.DeleteObjectOutput> =>
  s3.deleteObject({ Bucket: emailBucket, Key: key }).promise()
