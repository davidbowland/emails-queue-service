import { DeleteObjectCommand } from '@aws-sdk/client-s3'

import { attachmentBuffer, email, uuid } from '../__mocks__'
import { emailBucket } from '@config'
import { deleteAttachmentsFromS3, deleteContentFromS3, fetchContentFromS3, isMissingFromS3 } from '@services/s3'

const mockSend = jest.fn()
jest.mock('@aws-sdk/client-s3', () => ({
  DeleteObjectCommand: jest.fn().mockImplementation((x) => x),
  GetObjectCommand: jest.fn().mockImplementation((x) => x),
  S3Client: jest.fn(() => ({
    send: (...args) => mockSend(...args),
  })),
}))
const mockLogError = jest.fn()
jest.mock('@utils/logging', () => ({
  logError: (...args) => mockLogError(...args),
  xrayCapture: jest.fn().mockImplementation((x) => x),
}))

describe('S3', () => {
  const key = `queue/${uuid}`

  describe('fetchContentFromS3', () => {
    const expectedResult = { Hello: 'world' }

    const mockBuffer = jest.fn().mockReturnValue(expectedResult)

    beforeAll(() => {
      const mockBody = {
        on: jest.fn().mockImplementation((action, predicate) => {
          if (action === 'data') {
            const result = mockBuffer()
            predicate(Buffer.from(JSON.stringify(result) ?? ''))
          } else if (action === 'end') {
            predicate()
          }
        }),
      }
      mockSend.mockResolvedValue({ Body: mockBody })
    })

    it('should pass key to S3 as object', async () => {
      await fetchContentFromS3(uuid)

      expect(mockSend).toHaveBeenCalledWith({ Bucket: emailBucket, Key: key })
    })

    it('should use custom prefix when provided', async () => {
      const customPrefix = 'queue-bounced'
      const customKey = `${customPrefix}/${uuid}`

      await fetchContentFromS3(uuid, customPrefix)

      expect(mockSend).toHaveBeenCalledWith({ Bucket: emailBucket, Key: customKey })
    })

    it('should use default prefix "queue" when no prefix provided', async () => {
      await fetchContentFromS3(uuid)

      expect(mockSend).toHaveBeenCalledWith({ Bucket: emailBucket, Key: `queue/${uuid}` })
    })

    it('should return expectedObject as contents', async () => {
      const result = await fetchContentFromS3(uuid)

      expect(result.contents).toEqual(expect.objectContaining(expectedResult))
    })

    it('should return no attachment keys when the content has no attachments', async () => {
      const result = await fetchContentFromS3(uuid)

      expect(result.attachmentKeys).toEqual([])
    })

    it('should parse Buffer attachments accordingly', async () => {
      mockBuffer.mockReturnValueOnce(email)
      const result = await fetchContentFromS3(uuid)

      expect(result.contents.attachments[0].content).toEqual(attachmentBuffer)
    })

    it('should return no attachment keys for Buffer attachments', async () => {
      mockBuffer.mockReturnValueOnce(email)
      const result = await fetchContentFromS3(uuid)

      expect(result.attachmentKeys).toEqual([])
    })

    it('should parse non-Buffer attachments without deleting them', async () => {
      const content = 'colorless green ideas'
      const key = 'queue/message/attachment'
      const attachment = { ...email.attachments[0], content: key }
      mockBuffer.mockReturnValueOnce({ ...email, attachments: [attachment] }).mockReturnValueOnce(content)
      const result = await fetchContentFromS3(uuid)

      expect(result.contents.attachments[0].content).toEqual(Buffer.from(JSON.stringify(content)))
      expect(mockSend).toHaveBeenCalledWith({ Bucket: emailBucket, Key: `queue/${uuid}` })
      expect(mockSend).toHaveBeenCalledWith({ Bucket: emailBucket, Key: key })
      // The object must survive the fetch: only a get for the content and a get for the attachment
      expect(mockSend).toHaveBeenCalledTimes(2)
      expect(DeleteObjectCommand).not.toHaveBeenCalled()
    })

    it('should return the keys of non-Buffer attachments', async () => {
      const content = 'colorless green ideas'
      const key = 'queue/message/attachment'
      const attachment = { ...email.attachments[0], content: key }
      mockBuffer.mockReturnValueOnce({ ...email, attachments: [attachment] }).mockReturnValueOnce(content)
      const result = await fetchContentFromS3(uuid)

      expect(result.attachmentKeys).toEqual([key])
    })

    // The key comes from the message payload and emails-email-api validates only that it is
    // truthy, so anything outside the two producers' shapes must be neither fetched into an
    // outbound email nor deleted afterwards.
    it.each([
      ['a different prefix', 'sent/another-account/message-id'],
      // Two segments, not three: this is another message's full plaintext payload
      ['a queued email payload', 'queue/another-message-uuid'],
      ['a prefix that merely starts the same', 'attachments-evil/account/file'],
      ['a leading slash', '/attachments/account/file'],
      ['a traversal segment', 'attachments/../sent/file'],
      ['too many segments', 'attachments/account/nested/file'],
    ])('should neither read nor return an attachment key with %s', async (_label, hostileKey) => {
      const hostile = { ...email.attachments[0], content: hostileKey }
      mockBuffer.mockReturnValueOnce({ ...email, attachments: [hostile] })
      const result = await fetchContentFromS3(uuid)

      expect(result.attachmentKeys).toEqual([])
      expect(result.contents.attachments).toEqual([])
      expect(mockSend).toHaveBeenCalledTimes(1)
      expect(mockSend).not.toHaveBeenCalledWith({ Bucket: emailBucket, Key: hostileKey })
    })

    it('should drop a malformed attachment rather than rejecting the whole message', async () => {
      // Key collection runs outside transformAttachmentBuffers' catch, so a payload whose
      // attachment has no content must not make fetchContentFromS3 throw — that would fail
      // the record, and with one message group it would stall every message behind it.
      const malformed = { filename: 'no-content.txt' }
      mockBuffer.mockReturnValueOnce({ ...email, attachments: [malformed] })
      const result = await fetchContentFromS3(uuid)

      expect(result.attachmentKeys).toEqual([])
      expect(result.contents.attachments).toEqual([])
    })

    it('should drop a null attachment rather than rejecting the whole message', async () => {
      mockBuffer.mockReturnValueOnce({ ...email, attachments: [null] })
      const result = await fetchContentFromS3(uuid)

      expect(result.attachmentKeys).toEqual([])
      expect(result.contents.attachments).toEqual([])
    })

    it('should continue processing attachments even if one fails', async () => {
      const content = 'successful attachment'
      const failingKey = 'queue/message/failing-attachment'
      const successKey = 'queue/message/success-attachment'
      const failingAttachment = { ...email.attachments[0], content: failingKey }
      const successAttachment = { ...email.attachments[0], content: successKey }

      // Mock the main email fetch
      const mockBody = {
        on: jest.fn().mockImplementation((action, predicate) => {
          if (action === 'data') {
            const result = { ...email, attachments: [failingAttachment, successAttachment] }
            predicate(Buffer.from(JSON.stringify(result)))
          } else if (action === 'end') {
            predicate()
          }
        }),
      }

      // Mock S3 calls: first for main email, then failing attachment, then successful attachment
      mockSend
        .mockResolvedValueOnce({ Body: mockBody })
        .mockRejectedValueOnce(new Error('S3 object not found'))
        .mockResolvedValueOnce({
          Body: {
            on: jest.fn().mockImplementation((action, predicate) => {
              if (action === 'data') predicate(Buffer.from(JSON.stringify(content)))
              else if (action === 'end') predicate()
            }),
          },
        })

      const result = await fetchContentFromS3(uuid)

      expect(result.contents.attachments).toHaveLength(1)
      expect(result.contents.attachments[0].content).toEqual(Buffer.from(JSON.stringify(content)))
    })

    it('should not return the key of an attachment that failed to fetch', async () => {
      const content = 'successful attachment'
      const failingKey = 'queue/message/failing-attachment'
      const successKey = 'queue/message/success-attachment'
      const failingAttachment = { ...email.attachments[0], content: failingKey }
      const successAttachment = { ...email.attachments[0], content: successKey }

      const mockBody = {
        on: jest.fn().mockImplementation((action, predicate) => {
          if (action === 'data') {
            const result = { ...email, attachments: [failingAttachment, successAttachment] }
            predicate(Buffer.from(JSON.stringify(result)))
          } else if (action === 'end') {
            predicate()
          }
        }),
      }

      mockSend
        .mockResolvedValueOnce({ Body: mockBody })
        .mockRejectedValueOnce(new Error('S3 object not found'))
        .mockResolvedValueOnce({
          Body: {
            on: jest.fn().mockImplementation((action, predicate) => {
              if (action === 'data') predicate(Buffer.from(JSON.stringify(content)))
              else if (action === 'end') predicate()
            }),
          },
        })

      const result = await fetchContentFromS3(uuid)

      // The caller deletes these keys once the email is sent. Returning the failing key would
      // destroy the only copy of an attachment we could not read and did not send.
      expect(result.attachmentKeys).toEqual([successKey])
    })
  })

  describe('isMissingFromS3', () => {
    it.each([
      ['NoSuchKey', true],
      ['NotFound', true],
      ['AccessDenied', false],
      ['ThrottlingException', false],
    ])('should return %s -> %s', (name, expected) => {
      const error = new Error('boom')
      error.name = name

      expect(isMissingFromS3(error)).toEqual(expected)
    })

    it('should return false for a value that is not an Error', () => {
      expect(isMissingFromS3('NoSuchKey')).toEqual(false)
    })
  })

  describe('deleteContentFromS3', () => {
    beforeAll(() => {
      mockSend.mockResolvedValue(undefined)
    })

    it('should pass correct key to getS3Object', async () => {
      await deleteContentFromS3(uuid)

      expect(mockSend).toHaveBeenCalledWith({ Bucket: emailBucket, Key: key })
    })

    it('should use custom prefix when provided', async () => {
      const customPrefix = 'queue-bounced'
      const customKey = `${customPrefix}/${uuid}`

      await deleteContentFromS3(uuid, customPrefix)

      expect(mockSend).toHaveBeenCalledWith({ Bucket: emailBucket, Key: customKey })
    })

    it('should use default prefix "queue" when no prefix provided', async () => {
      await deleteContentFromS3(uuid)

      expect(mockSend).toHaveBeenCalledWith({ Bucket: emailBucket, Key: `queue/${uuid}` })
    })
  })

  describe('deleteAttachmentsFromS3', () => {
    const attachmentKeys = ['queue/message/attachment-one', 'queue/message/attachment-two']

    beforeAll(() => {
      mockSend.mockResolvedValue(undefined)
    })

    it('should pass every key to S3 unmodified', async () => {
      await deleteAttachmentsFromS3(attachmentKeys)

      expect(mockSend).toHaveBeenCalledWith({ Bucket: emailBucket, Key: attachmentKeys[0] })
      expect(mockSend).toHaveBeenCalledWith({ Bucket: emailBucket, Key: attachmentKeys[1] })
      expect(mockSend).toHaveBeenCalledTimes(2)
    })

    it('should not call S3 when there are no keys', async () => {
      await deleteAttachmentsFromS3([])

      expect(mockSend).not.toHaveBeenCalled()
    })

    it('should reject when a delete fails', async () => {
      const error = new Error('S3 delete failed')
      mockSend.mockRejectedValueOnce(error)

      await expect(deleteAttachmentsFromS3(attachmentKeys)).rejects.toEqual(error)
    })
  })
})
