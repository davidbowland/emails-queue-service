import { S3 } from 'aws-sdk'

import { Attachment, AttachmentContent, EmailData } from '../types'
import { emailBucket } from '../config'
import { xrayCapture } from '../utils/logging'

const s3 = xrayCapture(new S3({ apiVersion: '2006-03-01' }))

const getContentFromAttachment = (attachment: Attachment): Promise<string | Buffer> =>
  attachment.content.type === 'Buffer'
    ? Promise.resolve(Buffer.from(attachment.content.data))
    : exports.getS3Object(attachment.content as unknown as string)

const transformSingleAttachment = async (attachment: Attachment): Promise<AttachmentContent> => {
  const content = await getContentFromAttachment(attachment)
  return {
    ...attachment,
    content,
  }
}

const transformAttachmentBuffers = (email: EmailData): Promise<AttachmentContent>[] =>
  email.attachments ? (email.attachments as Attachment[]).map(transformSingleAttachment) : []

/* Get */

export const getS3Object = (key: string): Promise<string | Buffer> =>
  s3
    .getObject({ Bucket: emailBucket, Key: key })
    .promise()
    .then((result: any) => (result.Body ?? '') as string)

export const fetchContentFromS3 = async (uuid: string): Promise<EmailData> => {
  const s3Data = await exports.getS3Object(`queue/${uuid}`)
  const email = JSON.parse(s3Data)
  const attachments = await Promise.all(transformAttachmentBuffers(email))
  return {
    ...email,
    attachments,
  }
}

/* Delete */

export const deleteS3Object = (key: string): Promise<S3.DeleteObjectOutput> =>
  s3.deleteObject({ Bucket: emailBucket, Key: key }).promise()

export const deleteContentFromS3 = (uuid: string): Promise<S3.DeleteObjectOutput> =>
  exports.deleteS3Object(`queue/${uuid}`)
