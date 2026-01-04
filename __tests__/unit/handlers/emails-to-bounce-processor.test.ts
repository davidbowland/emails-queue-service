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
    const event = { Records: [record, record2] }
    const mockSendBounceResult = {
      $metadata: { httpStatusCode: 200, requestId: 'test-request-id' },
      MessageId: 'bounce-message-id-123',
    }

    beforeAll(() => {
      mocked(s3).fetchContentFromS3.mockResolvedValue(bounceData as any)
      mocked(ses).sendBounce.mockResolvedValue(mockSendBounceResult)
      mocked(s3).deleteContentFromS3.mockResolvedValue(undefined)
    })

    it('should process bounce messages and delete S3 content', async () => {
      await emailsToBounceProcessorHandler(event, undefined, undefined)

      expect(mocked(messageProcessing).getDataFromRecord).toHaveBeenCalledWith(record)
      expect(mocked(messageProcessing).getDataFromRecord).toHaveBeenCalledWith(record2)
      expect(mocked(s3).fetchContentFromS3).toHaveBeenCalledWith(record.messageId, 'queue-bounced')
      expect(mocked(s3).fetchContentFromS3).toHaveBeenCalledWith(record2.messageId, 'queue-bounced')
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
    })

    it('should log successful bounce processing', async () => {
      await emailsToBounceProcessorHandler(event, undefined, undefined)

      expect(mocked(logging).log).toHaveBeenCalledWith('Bounce sent successfully', {
        bounceMessageId: mockSendBounceResult.MessageId,
        messageId: bounceData.messageId,
        recipients: bounceData.recipients.length,
        uuid: record.messageId,
      })
    })

    it('should process second record when first fails', async () => {
      mocked(s3).fetchContentFromS3.mockRejectedValueOnce(new Error('S3 fetch failed'))
      await emailsToBounceProcessorHandler(event, undefined, undefined)

      expect(mocked(messageProcessing).getDataFromRecord).toHaveBeenCalledWith(record2)
      expect(mocked(s3).fetchContentFromS3).toHaveBeenCalledWith(record2.messageId, 'queue-bounced')
    })

    it('should call logError when a message fails processing', async () => {
      const error = new Error('S3 fetch failed')
      mocked(s3).fetchContentFromS3.mockRejectedValueOnce(error)
      await emailsToBounceProcessorHandler(event, undefined, undefined)

      expect(mocked(logging).logError).toHaveBeenCalledWith(error)
    })

    it('should call logError when SES sendBounce fails', async () => {
      const sesError = new Error('SES send failed')
      mocked(ses).sendBounce.mockRejectedValueOnce(sesError)
      await emailsToBounceProcessorHandler(event, undefined, undefined)

      expect(mocked(logging).logError).toHaveBeenCalledWith(sesError)
    })

    it('should not delete S3 content when bounce sending fails', async () => {
      const sesError = new Error('SES send failed')
      mocked(ses).sendBounce.mockRejectedValueOnce(sesError)
      mocked(s3).deleteContentFromS3.mockClear()

      await emailsToBounceProcessorHandler({ Records: [record] }, undefined, undefined)

      expect(mocked(s3).deleteContentFromS3).not.toHaveBeenCalledWith(record.messageId, 'queue-bounced')
    })
  })
})
