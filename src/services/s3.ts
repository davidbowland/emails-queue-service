import { S3 } from 'aws-sdk'

import { emailBucket } from '../config'
import { EmailData } from '../util/message-processing'

const s3 = new S3({ apiVersion: '2006-03-01' })
export interface Attachment {
  [key: string]: { [key: string]: string | Buffer }
}

const getFromS3ThenDelete = (key: string) =>
  exports.getS3Object(key).then((content) => exports.deleteS3Object(key).then(() => content))

const getContentFromAttachment = (attachment: Attachment): Promise<string | Buffer> =>
  Promise.resolve(
    attachment.content.type === 'Buffer'
      ? Buffer.from(attachment.content.data)
      : getFromS3ThenDelete(attachment.content as unknown as string)
  )

const transformSingleAttachment = (attachment: Attachment) =>
  getContentFromAttachment(attachment).then((content) => ({
    ...attachment,
    content,
  }))

const transformAttachmentBuffers = (email: EmailData) =>
  email.attachments ? (email.attachments as Attachment[]).map(transformSingleAttachment) : []

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

/* Delete */

export const deleteS3Object = (key: string): Promise<S3.DeleteObjectOutput> =>
  s3.deleteObject({ Bucket: emailBucket, Key: key }).promise()
