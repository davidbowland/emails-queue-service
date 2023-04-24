import {
  DeleteObjectCommand,
  DeleteObjectOutput,
  GetObjectCommand,
  GetObjectCommandOutput,
  S3Client,
} from '@aws-sdk/client-s3'

import { Attachment, AttachmentContent, EmailData } from '../types'
import { emailBucket } from '../config'
import { Readable } from 'stream'
import { xrayCapture } from '../utils/logging'

const s3 = xrayCapture(new S3Client({ apiVersion: '2006-03-01' }))

const getFromS3ThenDelete = async (key: string): Promise<string | Buffer> => {
  const content = await exports.getS3Object(key)
  await exports.deleteS3Object(key)
  return content
}

const getContentFromAttachment = (attachment: Attachment): Promise<string | Buffer> =>
  attachment.content.type === 'Buffer'
    ? Promise.resolve(Buffer.from(attachment.content.data))
    : getFromS3ThenDelete(attachment.content as unknown as string)

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

const readableToBuffer = (stream: Readable): Promise<Buffer> =>
  new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = []
    stream.on('data', (chunk) => chunks.push(chunk))
    stream.on('error', reject)
    stream.on('end', () => resolve(Buffer.concat(chunks)))
  })

export const getS3Object = async (key: string): Promise<Buffer> => {
  const command = new GetObjectCommand({ Bucket: emailBucket, Key: key })
  const response: GetObjectCommandOutput = await s3.send(command)
  return readableToBuffer(response.Body as Readable)
}

export const fetchContentFromS3 = async (uuid: string): Promise<EmailData> => {
  const s3Data: Buffer = await exports.getS3Object(`queue/${uuid}`)
  const email = JSON.parse(s3Data.toString('utf-8'))
  const attachments = await Promise.all(transformAttachmentBuffers(email))
  return {
    ...email,
    attachments,
  }
}

/* Delete */

export const deleteS3Object = async (key: string): Promise<DeleteObjectOutput> => {
  const command = new DeleteObjectCommand({ Bucket: emailBucket, Key: key })
  return s3.send(command)
}

export const deleteContentFromS3 = (uuid: string): Promise<DeleteObjectOutput> =>
  exports.deleteS3Object(`queue/${uuid}`)
