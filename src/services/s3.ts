import { S3 } from 'aws-sdk'

import { emailBucket } from '../config'
import { Attachment, AttachmentContent, EmailData } from '../types'

const s3 = new S3({ apiVersion: '2006-03-01' })

const getFromS3ThenDelete = async (key: string): Promise<string | Buffer> => {
  const content = await exports.getS3Object(key)
  await exports.deleteS3Object(key)
  return content
}

const getContentFromAttachment = (attachment: Attachment): Promise<string | Buffer> =>
  attachment.content.type === 'Buffer'
    ? Promise.resolve(Buffer.from(attachment.content.data))
    : getFromS3ThenDelete(attachment.content as unknown as string)

const transformSingleAttachment = (attachment: Attachment): Promise<AttachmentContent> =>
  getContentFromAttachment(attachment).then((content) => ({
    ...attachment,
    content,
  }))

const transformAttachmentBuffers = (email: EmailData): Promise<AttachmentContent>[] =>
  email.attachments ? (email.attachments as Attachment[]).map(transformSingleAttachment) : []

/* Get */

export const getS3Object = (key: string): Promise<string | Buffer> =>
  s3
    .getObject({ Bucket: emailBucket, Key: key })
    .promise()
    .then((result) => (result.Body ?? '') as string)

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

/* Delete */

export const deleteS3Object = (key: string): Promise<S3.DeleteObjectOutput> =>
  s3.deleteObject({ Bucket: emailBucket, Key: key }).promise()

export const deleteContentFromS3 = (uuid: string): Promise<S3.DeleteObjectOutput> =>
  exports.deleteS3Object(`queue/${uuid}`)
