import { mocked } from 'jest-mock'

import { email, record, uuid } from '../__mocks__'
import * as sqsPayloadProcessor from '@handlers/sqs-payload-processor'
import { processSingleMessage, sqsPayloadProcessorHandler } from '@handlers/sqs-payload-processor'
import * as s3 from '@services/s3'
import * as ses from '@services/ses'
import * as logging from '@utils/logging'
import * as messageProcessing from '@utils/message-processing'

jest.mock('@services/s3')
jest.mock('@services/ses')
jest.mock('@utils/logging')
jest.mock('@utils/message-processing')

describe('sqs-payload-processor', () => {
  beforeAll(() => {
    mocked(messageProcessing).getDataFromRecord.mockReturnValue({ uuid })
  })

  describe('processSingleMessage', () => {
    const expectedBuffer = Buffer.from('hello!')

    beforeAll(() => {
      mocked(s3).fetchContentFromS3.mockResolvedValue(email)
      mocked(ses).generateEmailFromData.mockResolvedValue(expectedBuffer)
      mocked(ses).sendRawEmail.mockResolvedValue(undefined)
    })

    test('expect getDataFromRecord to be called with input', async () => {
      await processSingleMessage(record)
      expect(mocked(messageProcessing).getDataFromRecord).toHaveBeenCalledWith(record)
    })

    test('expect fetchContentFromS3 to be called with output from getDataFromRecord', async () => {
      await processSingleMessage(record)
      expect(mocked(s3).fetchContentFromS3).toHaveBeenCalledWith(uuid)
    })

    test('expect mockGenerateEmailFromData to be called with output from fetchContentFromS3', async () => {
      await processSingleMessage(record)
      expect(mocked(ses).generateEmailFromData).toHaveBeenCalledWith(email)
    })

    test('expect sendRawEmail to be called with output from generateEmaiFromData', async () => {
      await processSingleMessage(record)
      expect(mocked(ses).sendRawEmail).toHaveBeenCalledWith(expectedBuffer)
    })

    test('expect deleteContentFromS3 to be called', async () => {
      await processSingleMessage(record)
      expect(mocked(s3).deleteContentFromS3).toHaveBeenCalledWith(uuid)
    })
  })

  describe('sqsPayloadProcessorHandler', () => {
    const record2 = { ...record, messageId: '8765rfg-76tfg-hui8yt-7trdf-gui567yfdf' }
    const event = { Records: [record, record2] }
    const mockProcessSingleMessageSpy = jest.spyOn(sqsPayloadProcessor, 'processSingleMessage')

    test('expect processSingleMessage to be called for each record', async () => {
      await sqsPayloadProcessorHandler(event, undefined, undefined)
      expect(mockProcessSingleMessageSpy).toHaveBeenCalledWith(record)
      expect(mockProcessSingleMessageSpy).toHaveBeenCalledWith(record2)
    })

    test('expect processSingleMessage to be called for second record when first rejects', async () => {
      mockProcessSingleMessageSpy.mockRejectedValueOnce(undefined)
      await sqsPayloadProcessorHandler(event, undefined, undefined)
      expect(mockProcessSingleMessageSpy).toHaveBeenCalledWith(record)
      expect(mockProcessSingleMessageSpy).toHaveBeenCalledWith(record2)
    })

    test('expect logError to be called when a message rejects', async () => {
      const error = 'big-fuzzy-error'
      mockProcessSingleMessageSpy.mockRejectedValueOnce(error)
      await sqsPayloadProcessorHandler(event, undefined, undefined)
      expect(mockProcessSingleMessageSpy).toHaveBeenCalledWith(record)
      expect(mocked(logging).logError).toHaveBeenCalledWith(error)
    })

    test('expect sendErrorEmail to be called when a message rejects', async () => {
      const error = 'big-fuzzy-error'
      mockProcessSingleMessageSpy.mockRejectedValueOnce(error)
      await sqsPayloadProcessorHandler(event, undefined, undefined)
      expect(mockProcessSingleMessageSpy).toHaveBeenCalledWith(record)
      expect(mocked(ses).sendErrorEmail).toHaveBeenCalledWith(event, error)
    })
  })
})
