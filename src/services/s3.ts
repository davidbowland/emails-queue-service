import {
  DeleteObjectCommand,
  DeleteObjectOutput,
  GetObjectCommand,
  GetObjectCommandOutput,
  S3Client,
} from '@aws-sdk/client-s3'
import { Readable } from 'stream'

import { emailBucket } from '../config'
import { Attachment, AttachmentContent } from '../types'
import { logError, xrayCapture } from '../utils/logging'

const s3 = xrayCapture(new S3Client({ apiVersion: '2006-03-01' }))

const getFromS3ThenDelete = async (key: string): Promise<string | Buffer> => {
  const content = await getS3Object(key)
  await deleteS3Object(key)
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

const transformAttachmentBuffers = async (attachments: Attachment[]): Promise<AttachmentContent[]> => {
  return attachments.reduce(
    (acc: Promise<AttachmentContent[]>, curr: Attachment): Promise<AttachmentContent[]> =>
      acc
        .then((prev) => transformSingleAttachment(curr).then((attachment) => prev.concat(attachment)))
        .catch((error) => {
          logError(error)
          return acc
        }),
    Promise.resolve([]),
  )
}

/* Get */

const readableToBuffer = (stream: Readable): Promise<Buffer> =>
  new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = []
    stream.on('data', (chunk) => chunks.push(chunk))
    stream.on('error', reject)
    stream.on('end', () => resolve(Buffer.concat(chunks)))
  })

const getS3Object = async (key: string): Promise<Buffer> => {
  const command = new GetObjectCommand({ Bucket: emailBucket, Key: key })
  const response: GetObjectCommandOutput = await s3.send(command)
  return readableToBuffer(response.Body as Readable)
}

export const fetchContentFromS3 = async <T = any>(uuid: string, prefix: string = 'queue'): Promise<T> => {
  const s3Data: Buffer = await getS3Object(`${prefix}/${uuid}`)
  const data = JSON.parse(s3Data.toString('utf-8'))

  if (data.attachments) {
    const attachments = await transformAttachmentBuffers(data.attachments)
    return {
      ...data,
      attachments,
    } as T
  }

  return data as T
}

/* Delete */

const deleteS3Object = async (key: string): Promise<DeleteObjectOutput> => {
  const command = new DeleteObjectCommand({ Bucket: emailBucket, Key: key })
  return s3.send(command)
}

export const deleteContentFromS3 = (uuid: string, prefix: string = 'queue'): Promise<DeleteObjectOutput> =>
  deleteS3Object(`${prefix}/${uuid}`)
