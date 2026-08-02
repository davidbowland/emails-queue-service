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

// Attachments are only ever written at exactly three segments: attachments/{accountId}/{uuid}
// by emails-email-api when composing, queue/{uuid}/{id} by emails-inbound-service when
// forwarding. The key reaches us from the message payload and emails-email-api validates only
// that it is truthy, so anything else must not be acted on.
//
// The segment count is load-bearing, not tidiness. A two-segment queue/{uuid} is where
// emails-queue-api stores the entire plaintext of a queued email, so admitting it would let a
// crafted payload attach someone else's whole message to an outgoing email — and then delete
// it, which fetchQueuedContent reads as "already sent", so their mail would silently never go
// out. Requiring the third segment excludes those objects outright.
//
// This is prefix and shape scoping, NOT tenant scoping: attachments/{someone-elses-account}/
// {uuid} still matches. Closing that needs validation in emails-email-api, which is where the
// key is accepted in the first place.
const ATTACHMENT_KEY_PATTERN = /^(attachments|queue)\/[^/]+\/[^/]+$/

const isAllowedAttachmentKey = (key: string): boolean =>
  ATTACHMENT_KEY_PATTERN.test(key) && !key.split('/').includes('..')

// An S3-stored attachment carries its key as a plain string; an inline one carries
// { type: 'Buffer', data }. Testing for the string rather than negating the Buffer case
// keeps this total: a malformed attachment is simply not S3-stored, so collecting the
// attachment keys cannot throw. That matters because key collection happens outside
// transformAttachmentBuffers' catch, and a throw there would fail the whole message.
const isStoredOnS3 = (attachment: Attachment): boolean =>
  typeof attachment?.content === 'string' && isAllowedAttachmentKey(attachment.content)

const getAttachmentKey = (attachment: Attachment): string => attachment.content as unknown as string

const getContentFromAttachment = (attachment: Attachment): Promise<string | Buffer> => {
  if (typeof attachment?.content === 'string') {
    // Attachment declares content as the inline { type, data } shape, so a string narrows to
    // never here; the cast is the same one getAttachmentKey makes.
    const key = getAttachmentKey(attachment)
    // Say plainly that a key was refused. Falling through to the Buffer branch would reject
    // with an opaque TypeError, which reads as a malformed payload rather than a rejected
    // key. Only the leading segment is logged — the rest carries an account id.
    return isAllowedAttachmentKey(key)
      ? getS3Object(key)
      : Promise.reject(new Error(`Refused attachment key outside the permitted shape: ${key.split('/')[0]}/…`))
  }
  return Promise.resolve(Buffer.from(attachment.content.data))
}

const transformSingleAttachment = async (attachment: Attachment): Promise<AttachmentContent> => {
  const content = await getContentFromAttachment(attachment)
  return {
    ...attachment,
    content,
  }
}

interface TransformedAttachments {
  attachmentKeys: string[]
  attachments: AttachmentContent[]
}

// Collects the keys of the attachments it actually read, not the keys the payload asked
// for. An attachment whose fetch failed is dropped from the email, and deleting its object
// afterwards would destroy the only copy of something we just admitted we could not read.
// Leaving it in place costs nothing: the bucket's lifecycle rules expire it either way.
const transformAttachmentBuffers = async (attachments: Attachment[]): Promise<TransformedAttachments> =>
  attachments.reduce(
    (acc: Promise<TransformedAttachments>, curr: Attachment): Promise<TransformedAttachments> =>
      acc
        .then((prev) =>
          transformSingleAttachment(curr).then((attachment) => ({
            attachmentKeys: isStoredOnS3(curr) ? [...prev.attachmentKeys, getAttachmentKey(curr)] : prev.attachmentKeys,
            attachments: [...prev.attachments, attachment],
          })),
        )
        .catch((error) => {
          logError(error)
          return acc
        }),
    Promise.resolve({ attachmentKeys: [], attachments: [] }),
  )

/* Get */

// S3 reports a missing key as NoSuchKey on GetObject and NotFound on HeadObject.
export const isMissingFromS3 = (error: unknown): boolean =>
  error instanceof Error && (error.name === 'NoSuchKey' || error.name === 'NotFound')

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

// The attachment keys are returned alongside the contents rather than deleted here: the objects
// must survive until the mail has actually been sent, or a retry after a failed send composes the
// email without them. The caller deletes them once the send succeeds.
export const fetchContentFromS3 = async <T = any>(
  uuid: string,
  prefix: string = 'queue',
): Promise<{ attachmentKeys: string[]; contents: T }> => {
  const s3Data: Buffer = await getS3Object(`${prefix}/${uuid}`)
  const data = JSON.parse(s3Data.toString('utf-8'))

  // Array.isArray rather than a truthiness check: a payload whose attachments field is an
  // object or a string would throw out of reduce, and with one message group that failure
  // stalls every message behind it.
  if (Array.isArray(data.attachments)) {
    const { attachmentKeys, attachments } = await transformAttachmentBuffers(data.attachments)
    return {
      attachmentKeys,
      contents: {
        ...data,
        attachments,
      } as T,
    }
  }

  return { attachmentKeys: [], contents: data as T }
}

/* Delete */

const deleteS3Object = async (key: string): Promise<DeleteObjectOutput> => {
  const command = new DeleteObjectCommand({ Bucket: emailBucket, Key: key })
  return s3.send(command)
}

export const deleteContentFromS3 = (uuid: string, prefix: string = 'queue'): Promise<DeleteObjectOutput> =>
  deleteS3Object(`${prefix}/${uuid}`)

// Keys come from fetchContentFromS3 and are already fully qualified, unlike deleteContentFromS3's uuid
export const deleteAttachmentsFromS3 = (keys: string[]): Promise<DeleteObjectOutput[]> =>
  Promise.all(keys.map((key) => deleteS3Object(key)))
