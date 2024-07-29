import { mocked } from 'jest-mock'

import * as logging from '@utils/logging'
import * as messageProcessing from '@utils/message-processing'
import * as s3 from '@services/s3'
import * as ses from '@services/ses'
import { email, record } from '../__mocks__'
import { sqsPayloadProcessorHandler } from '@handlers/sqs-payload-processor'

jest.mock('@services/s3')
jest.mock('@services/ses')
jest.mock('@utils/logging')
jest.mock('@utils/message-processing')

describe('sqs-payload-processor', () => {
  beforeAll(() => {
    mocked(messageProcessing).getDataFromRecord.mockImplementation((record) => ({ uuid: record.messageId }))
  })

  describe('sqsPayloadProcessorHandler', () => {
    const expectedBuffer = Buffer.from('hello!')
    const record2 = { ...record, messageId: '8765rfg-76tfg-hui8yt-7trdf-gui567yfdf' }
    const event = { Records: [record, record2] }

    beforeAll(() => {
      mocked(s3).fetchContentFromS3.mockResolvedValue(email)
      mocked(ses).generateEmailFromData.mockResolvedValue(expectedBuffer)
      mocked(ses).sendRawEmail.mockResolvedValue(undefined)
    })

    test('expect records to be fetched then deleted', async () => {
      await sqsPayloadProcessorHandler(event, undefined, undefined)

      expect(mocked(messageProcessing).getDataFromRecord).toHaveBeenCalledWith(record)
      expect(mocked(messageProcessing).getDataFromRecord).toHaveBeenCalledWith(record2)
      expect(mocked(s3).fetchContentFromS3).toHaveBeenCalledWith(record.messageId)
      expect(mocked(s3).fetchContentFromS3).toHaveBeenCalledWith(record2.messageId)
      expect(mocked(ses).generateEmailFromData).toHaveBeenCalledWith(email)
      expect(mocked(ses).sendRawEmail).toHaveBeenCalledWith(expectedBuffer)
      expect(mocked(s3).deleteContentFromS3).toHaveBeenCalledWith(record.messageId)
    })

    test('expect second record fetched when first rejects', async () => {
      mocked(s3).fetchContentFromS3.mockRejectedValueOnce(undefined)
      await sqsPayloadProcessorHandler(event, undefined, undefined)

      expect(mocked(messageProcessing).getDataFromRecord).toHaveBeenCalledWith(record2)
      expect(mocked(s3).fetchContentFromS3).toHaveBeenCalledWith(record2.messageId)
    })

    test('expect logError to be called when a message rejects', async () => {
      const error = 'big-fuzzy-error'
      mocked(s3).fetchContentFromS3.mockRejectedValueOnce(error)
      await sqsPayloadProcessorHandler(event, undefined, undefined)

      expect(mocked(s3).fetchContentFromS3).toHaveBeenCalledWith(record2.messageId)
      expect(mocked(logging).logError).toHaveBeenCalledWith(error)
    })
  })
})
