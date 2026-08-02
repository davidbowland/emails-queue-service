import { mocked } from 'jest-mock'

import { email, record } from '../__mocks__'
import { emailsToSendProcessorHandler } from '@handlers/emails-to-send-processor'
import * as s3 from '@services/s3'
import * as ses from '@services/ses'
import * as logging from '@utils/logging'
import * as messageProcessing from '@utils/message-processing'

jest.mock('@services/s3')
jest.mock('@services/ses')
jest.mock('@utils/logging')
jest.mock('@utils/message-processing')

describe('emails-to-send-processor', () => {
  beforeAll(() => {
    mocked(messageProcessing).getDataFromRecord.mockImplementation((record) => ({ uuid: record.messageId }))
  })

  describe('emailsToSendProcessorHandler', () => {
    const expectedBuffer = Buffer.from('hello!')
    const record2 = { ...record, messageId: '8765rfg-76tfg-hui8yt-7trdf-gui567yfdf' }
    const record3 = { ...record, messageId: '54edcv-98uygb-23wsxc-76tgbn-09olkm' }
    const event = { Records: [record, record2, record3] }

    const attachmentKeys = [`queue/${record.messageId}/attachment-one`, `queue/${record.messageId}/attachment-two`]

    beforeAll(() => {
      mocked(s3).deleteAttachmentsFromS3.mockResolvedValue(undefined)
      mocked(s3).deleteContentFromS3.mockResolvedValue(undefined)
      mocked(s3).fetchContentFromS3.mockResolvedValue({ attachmentKeys: [], contents: email })
      mocked(s3).isMissingFromS3.mockReturnValue(false)
      mocked(ses).generateEmailFromData.mockResolvedValue(expectedBuffer)
      mocked(ses).sendRawEmail.mockResolvedValue(undefined)
    })

    it('should treat a missing content object as already sent rather than failing the batch', async () => {
      // An invocation that dies after sending redelivers records whose content it already
      // deleted. Failing them would fail the whole batch forward on every retry.
      const missing = new Error('NoSuchKey')
      mocked(s3).fetchContentFromS3.mockRejectedValueOnce(missing)
      mocked(s3).isMissingFromS3.mockReturnValueOnce(true)

      const result = await emailsToSendProcessorHandler(event)

      expect(result).toEqual({ batchItemFailures: [] })
      expect(mocked(logging).logError).toHaveBeenCalledWith(missing)
      expect(mocked(ses).sendRawEmail).toHaveBeenCalledTimes(2)
      expect(mocked(s3).deleteContentFromS3).not.toHaveBeenCalledWith(record.messageId)
    })

    it('should still fail forward when the fetch fails for any other reason', async () => {
      // The already-sent guard must not swallow real fetch failures.
      mocked(s3).fetchContentFromS3.mockRejectedValueOnce(new Error('S3 is down'))

      const result = await emailsToSendProcessorHandler(event)

      expect(result).toEqual({
        batchItemFailures: [
          { itemIdentifier: record.messageId },
          { itemIdentifier: record2.messageId },
          { itemIdentifier: record3.messageId },
        ],
      })
      expect(mocked(ses).sendRawEmail).not.toHaveBeenCalled()
    })

    it('should fetch records then delete them, reporting no batch item failures', async () => {
      const result = await emailsToSendProcessorHandler(event)

      expect(mocked(messageProcessing).getDataFromRecord).toHaveBeenCalledWith(record)
      expect(mocked(messageProcessing).getDataFromRecord).toHaveBeenCalledWith(record2)
      expect(mocked(messageProcessing).getDataFromRecord).toHaveBeenCalledWith(record3)
      expect(mocked(s3).fetchContentFromS3).toHaveBeenCalledWith(record.messageId, 'queue')
      expect(mocked(s3).fetchContentFromS3).toHaveBeenCalledWith(record2.messageId, 'queue')
      expect(mocked(s3).fetchContentFromS3).toHaveBeenCalledWith(record3.messageId, 'queue')
      expect(mocked(ses).generateEmailFromData).toHaveBeenCalledWith(email)
      expect(mocked(ses).sendRawEmail).toHaveBeenCalledWith(expectedBuffer)
      expect(mocked(s3).deleteContentFromS3).toHaveBeenCalledWith(record.messageId)
      expect(mocked(s3).deleteContentFromS3).toHaveBeenCalledWith(record2.messageId)
      expect(mocked(s3).deleteContentFromS3).toHaveBeenCalledWith(record3.messageId)
      expect(result).toEqual({ batchItemFailures: [] })
    })

    it('should return every message ID and process no further records when the first rejects', async () => {
      const error = 'big-fuzzy-error'
      mocked(s3).fetchContentFromS3.mockRejectedValueOnce(error)

      const result = await emailsToSendProcessorHandler(event)

      // Single message group -- the records behind the failure must be retried with it
      expect(result).toEqual({
        batchItemFailures: [
          { itemIdentifier: record.messageId },
          { itemIdentifier: record2.messageId },
          { itemIdentifier: record3.messageId },
        ],
      })
      expect(mocked(s3).fetchContentFromS3).not.toHaveBeenCalledWith(record2.messageId, 'queue')
      expect(mocked(s3).fetchContentFromS3).not.toHaveBeenCalledWith(record3.messageId, 'queue')
      expect(mocked(ses).sendRawEmail).not.toHaveBeenCalled()
      expect(mocked(logging).logError).toHaveBeenCalledWith(error)
    })

    it('should return the failing record and those after it when a middle record rejects', async () => {
      const error = new Error('S3 fetch failed')
      mocked(s3)
        .fetchContentFromS3.mockResolvedValueOnce({ attachmentKeys: [], contents: email })
        .mockRejectedValueOnce(error)

      const result = await emailsToSendProcessorHandler(event)

      expect(result).toEqual({
        batchItemFailures: [{ itemIdentifier: record2.messageId }, { itemIdentifier: record3.messageId }],
      })
      expect(mocked(s3).deleteContentFromS3).toHaveBeenCalledWith(record.messageId)
      expect(mocked(s3).fetchContentFromS3).not.toHaveBeenCalledWith(record3.messageId, 'queue')
      expect(mocked(logging).logError).toHaveBeenCalledWith(error)
    })

    it('should return only the last message ID when the last record rejects', async () => {
      const error = new Error('SES send failed')
      mocked(ses)
        .sendRawEmail.mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(error)

      const result = await emailsToSendProcessorHandler(event)

      expect(result).toEqual({ batchItemFailures: [{ itemIdentifier: record3.messageId }] })
      expect(mocked(s3).deleteContentFromS3).toHaveBeenCalledWith(record.messageId)
      expect(mocked(s3).deleteContentFromS3).toHaveBeenCalledWith(record2.messageId)
      expect(mocked(s3).deleteContentFromS3).not.toHaveBeenCalledWith(record3.messageId)
      expect(mocked(logging).logError).toHaveBeenCalledWith(error)
    })

    it('should succeed without resending when the post-send delete rejects', async () => {
      const error = new Error('S3 delete failed')
      mocked(s3).deleteContentFromS3.mockRejectedValueOnce(error)

      const result = await emailsToSendProcessorHandler({ Records: [record] })

      expect(result).toEqual({ batchItemFailures: [] })
      expect(mocked(ses).sendRawEmail).toHaveBeenCalledTimes(1)
      expect(mocked(logging).logError).toHaveBeenCalledWith(error)
    })

    it('should delete the attachments after a successful send', async () => {
      mocked(s3).fetchContentFromS3.mockResolvedValueOnce({ attachmentKeys, contents: email })

      const result = await emailsToSendProcessorHandler({ Records: [record] })

      expect(result).toEqual({ batchItemFailures: [] })
      expect(mocked(s3).deleteAttachmentsFromS3).toHaveBeenCalledWith(attachmentKeys)
      expect(mocked(s3).deleteContentFromS3).toHaveBeenCalledWith(record.messageId)
    })

    it('should not hand the attachment keys to the email composer', async () => {
      mocked(s3).fetchContentFromS3.mockResolvedValueOnce({ attachmentKeys, contents: email })

      await emailsToSendProcessorHandler({ Records: [record] })

      expect(mocked(ses).generateEmailFromData).toHaveBeenCalledWith(email)
    })

    it('should leave the attachments in S3 when the send fails so a retry can compose a complete email', async () => {
      const error = new Error('SES throttled')
      mocked(s3).fetchContentFromS3.mockResolvedValueOnce({ attachmentKeys, contents: email })
      mocked(ses).sendRawEmail.mockRejectedValueOnce(error)

      const result = await emailsToSendProcessorHandler({ Records: [record] })

      expect(result).toEqual({ batchItemFailures: [{ itemIdentifier: record.messageId }] })
      expect(mocked(s3).deleteAttachmentsFromS3).not.toHaveBeenCalled()
      expect(mocked(s3).deleteContentFromS3).not.toHaveBeenCalled()
      expect(mocked(logging).logError).toHaveBeenCalledWith(error)
    })

    it('should succeed without resending when the attachment delete rejects', async () => {
      const error = new Error('S3 attachment delete failed')
      mocked(s3).fetchContentFromS3.mockResolvedValueOnce({ attachmentKeys, contents: email })
      mocked(s3).deleteAttachmentsFromS3.mockRejectedValueOnce(error)

      const result = await emailsToSendProcessorHandler({ Records: [record] })

      expect(result).toEqual({ batchItemFailures: [] })
      expect(mocked(ses).sendRawEmail).toHaveBeenCalledTimes(1)
      expect(mocked(logging).logError).toHaveBeenCalledWith(error)
    })
  })
})
