import { mocked } from 'jest-mock'

import { bounceData, record } from '../__mocks__'
import { emailsToBounceProcessorHandler } from '@handlers/emails-to-bounce-processor'
import * as s3 from '@services/s3'
import * as ses from '@services/ses'
import * as logging from '@utils/logging'
import * as messageProcessing from '@utils/message-processing'

jest.mock('@services/s3')
jest.mock('@services/ses')
jest.mock('@utils/logging')
jest.mock('@utils/message-processing')

describe('emails-to-bounce-processor', () => {
  beforeAll(() => {
    mocked(messageProcessing).getDataFromRecord.mockImplementation((record) => ({ uuid: record.messageId }))
  })

  describe('emailsToBounceProcessorHandler', () => {
    const record2 = { ...record, messageId: '8765rfg-76tfg-hui8yt-7trdf-gui567yfdf' }
    const record3 = { ...record, messageId: '54edcv-98uygb-23wsxc-76tgbn-09olkm' }
    const event = { Records: [record, record2, record3] }
    const mockSendBounceResult = {
      $metadata: { httpStatusCode: 200, requestId: 'test-request-id' },
      MessageId: 'bounce-message-id-123',
    }

    beforeAll(() => {
      mocked(s3).deleteContentFromS3.mockResolvedValue(undefined)
      mocked(s3).fetchContentFromS3.mockResolvedValue({ attachmentKeys: [], contents: bounceData } as any)
      mocked(s3).isMissingFromS3.mockReturnValue(false)
      mocked(ses).sendBounce.mockResolvedValue(mockSendBounceResult)
    })

    it('should treat a missing content object as already bounced rather than failing the batch', async () => {
      const missing = new Error('NoSuchKey')
      mocked(s3).fetchContentFromS3.mockRejectedValueOnce(missing)
      mocked(s3).isMissingFromS3.mockReturnValueOnce(true)

      const result = await emailsToBounceProcessorHandler(event)

      expect(result).toEqual({ batchItemFailures: [] })
      expect(mocked(logging).logError).toHaveBeenCalledWith(missing)
      expect(mocked(ses).sendBounce).toHaveBeenCalledTimes(2)
    })

    it('should still fail forward when the fetch fails for any other reason', async () => {
      mocked(s3).fetchContentFromS3.mockRejectedValueOnce(new Error('S3 is down'))

      const result = await emailsToBounceProcessorHandler(event)

      expect(result).toEqual({
        batchItemFailures: [
          { itemIdentifier: record.messageId },
          { itemIdentifier: record2.messageId },
          { itemIdentifier: record3.messageId },
        ],
      })
      expect(mocked(ses).sendBounce).not.toHaveBeenCalled()
    })

    it('should process bounce messages and delete S3 content, reporting no batch item failures', async () => {
      const result = await emailsToBounceProcessorHandler(event)

      expect(mocked(messageProcessing).getDataFromRecord).toHaveBeenCalledWith(record)
      expect(mocked(messageProcessing).getDataFromRecord).toHaveBeenCalledWith(record2)
      expect(mocked(messageProcessing).getDataFromRecord).toHaveBeenCalledWith(record3)
      expect(mocked(s3).fetchContentFromS3).toHaveBeenCalledWith(record.messageId, 'queue-bounced')
      expect(mocked(s3).fetchContentFromS3).toHaveBeenCalledWith(record2.messageId, 'queue-bounced')
      expect(mocked(s3).fetchContentFromS3).toHaveBeenCalledWith(record3.messageId, 'queue-bounced')
      expect(mocked(ses).sendBounce).toHaveBeenCalledWith(
        bounceData.messageId,
        bounceData.recipients,
        bounceData.bounceSender,
        {
          bounceType: bounceData.bounceType,
        },
      )
      expect(mocked(s3).deleteContentFromS3).toHaveBeenCalledWith(record.messageId, 'queue-bounced')
      expect(mocked(s3).deleteContentFromS3).toHaveBeenCalledWith(record2.messageId, 'queue-bounced')
      expect(mocked(s3).deleteContentFromS3).toHaveBeenCalledWith(record3.messageId, 'queue-bounced')
      expect(result).toEqual({ batchItemFailures: [] })
    })

    it('should log successful bounce processing', async () => {
      await emailsToBounceProcessorHandler(event)

      expect(mocked(logging).log).toHaveBeenCalledWith('Bounce sent successfully', {
        bounceMessageId: mockSendBounceResult.MessageId,
        messageId: bounceData.messageId,
        recipients: bounceData.recipients.length,
        uuid: record.messageId,
      })
    })

    it('should return every message ID and process no further records when the first rejects', async () => {
      const error = new Error('S3 fetch failed')
      mocked(s3).fetchContentFromS3.mockRejectedValueOnce(error)

      const result = await emailsToBounceProcessorHandler(event)

      // Single message group -- the records behind the failure must be retried with it
      expect(result).toEqual({
        batchItemFailures: [
          { itemIdentifier: record.messageId },
          { itemIdentifier: record2.messageId },
          { itemIdentifier: record3.messageId },
        ],
      })
      expect(mocked(s3).fetchContentFromS3).not.toHaveBeenCalledWith(record2.messageId, 'queue-bounced')
      expect(mocked(s3).fetchContentFromS3).not.toHaveBeenCalledWith(record3.messageId, 'queue-bounced')
      expect(mocked(ses).sendBounce).not.toHaveBeenCalled()
      expect(mocked(logging).logError).toHaveBeenCalledWith(error)
    })

    it('should return the failing record and those after it when a middle record rejects', async () => {
      const error = new Error('S3 fetch failed')
      mocked(s3)
        .fetchContentFromS3.mockResolvedValueOnce({ attachmentKeys: [], contents: bounceData } as any)
        .mockRejectedValueOnce(error)

      const result = await emailsToBounceProcessorHandler(event)

      expect(result).toEqual({
        batchItemFailures: [{ itemIdentifier: record2.messageId }, { itemIdentifier: record3.messageId }],
      })
      expect(mocked(s3).deleteContentFromS3).toHaveBeenCalledWith(record.messageId, 'queue-bounced')
      expect(mocked(s3).fetchContentFromS3).not.toHaveBeenCalledWith(record3.messageId, 'queue-bounced')
      expect(mocked(logging).logError).toHaveBeenCalledWith(error)
    })

    it('should return only the last message ID when the last record rejects', async () => {
      const error = new Error('SES send failed')
      mocked(ses)
        .sendBounce.mockResolvedValueOnce(mockSendBounceResult)
        .mockResolvedValueOnce(mockSendBounceResult)
        .mockRejectedValueOnce(error)

      const result = await emailsToBounceProcessorHandler(event)

      expect(result).toEqual({ batchItemFailures: [{ itemIdentifier: record3.messageId }] })
      expect(mocked(s3).deleteContentFromS3).toHaveBeenCalledWith(record.messageId, 'queue-bounced')
      expect(mocked(s3).deleteContentFromS3).toHaveBeenCalledWith(record2.messageId, 'queue-bounced')
      expect(mocked(s3).deleteContentFromS3).not.toHaveBeenCalledWith(record3.messageId, 'queue-bounced')
      expect(mocked(logging).logError).toHaveBeenCalledWith(error)
    })

    it('should not delete S3 content when bounce sending fails', async () => {
      const error = new Error('SES send failed')
      mocked(ses).sendBounce.mockRejectedValueOnce(error)

      const result = await emailsToBounceProcessorHandler({ Records: [record] })

      expect(result).toEqual({ batchItemFailures: [{ itemIdentifier: record.messageId }] })
      expect(mocked(s3).deleteContentFromS3).not.toHaveBeenCalled()
      expect(mocked(logging).logError).toHaveBeenCalledWith(error)
    })

    it('should succeed without resending when the post-send delete rejects', async () => {
      const error = new Error('S3 delete failed')
      mocked(s3).deleteContentFromS3.mockRejectedValueOnce(error)

      const result = await emailsToBounceProcessorHandler({ Records: [record] })

      expect(result).toEqual({ batchItemFailures: [] })
      expect(mocked(ses).sendBounce).toHaveBeenCalledTimes(1)
      expect(mocked(logging).logError).toHaveBeenCalledWith(error)
    })
  })
})
