import { email, record, uuid } from '../__mocks__'
import * as sqsPayloadProcessor from '../../../src/handlers/sqs-payload-processor'
import { processSingleMessage, sqsPayloadProcessorHandler } from '../../../src/handlers/sqs-payload-processor'

const mockDeleteContentFromS3 = jest.fn()
const mockFetchContentFromS3 = jest.fn()
jest.mock('../../../src/services/s3', () => ({
  deleteContentFromS3: (...args) => mockDeleteContentFromS3(...args),
  fetchContentFromS3: (...args) => mockFetchContentFromS3(...args),
}))
const mockGenerateEmailFromData = jest.fn()
const mockSendErrorEmail = jest.fn()
const mockSendRawEmail = jest.fn()
jest.mock('../../../src/services/ses', () => ({
  generateEmailFromData: (...args) => mockGenerateEmailFromData(...args),
  sendErrorEmail: (...args) => mockSendErrorEmail(...args),
  sendRawEmail: (...args) => mockSendRawEmail(...args),
}))
jest.mock('../../../src/util/error-handling', () => ({
  log: () => () => undefined,
}))
const mockGetDataFromRecord = jest.fn()
jest.mock('../../../src/util/message-processing', () => ({
  getDataFromRecord: (...args) => mockGetDataFromRecord(...args),
}))

describe('sqs-payload-processor', () => {
  beforeAll(() => {
    mockGetDataFromRecord.mockResolvedValue({ uuid })
  })

  describe('processSingleMessage', () => {
    const expectedBuffer = Buffer.from('hello!')

    beforeAll(() => {
      mockFetchContentFromS3.mockResolvedValue(email)
      mockGenerateEmailFromData.mockResolvedValue(expectedBuffer)
      mockSendRawEmail.mockResolvedValue(undefined)
    })

    test('expect getDataFromRecord to be called with input', async () => {
      await processSingleMessage(record)
      expect(mockGetDataFromRecord).toHaveBeenCalledWith(record)
    })

    test('expect fetchContentFromS3 to be called with output from getDataFromRecord', async () => {
      await processSingleMessage(record)
      expect(mockFetchContentFromS3).toHaveBeenCalledWith(uuid)
    })

    test('expect mockGenerateEmailFromData to be called with output from fetchContentFromS3', async () => {
      await processSingleMessage(record)
      expect(mockGenerateEmailFromData).toHaveBeenCalledWith(email)
    })

    test('expect sendRawEmail to be called with output from generateEmaiFromData', async () => {
      await processSingleMessage(record)
      expect(mockSendRawEmail).toHaveBeenCalledWith(expectedBuffer)
    })

    test('expect deleteContentFromS3 to be called', async () => {
      await processSingleMessage(record)
      expect(mockDeleteContentFromS3).toHaveBeenCalledWith(uuid)
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

    test('expect sendErrorEmail to be called when a message rejects', async () => {
      const error = 'big-fuzzy-error'
      mockProcessSingleMessageSpy.mockRejectedValueOnce(error)
      await sqsPayloadProcessorHandler(event, undefined, undefined)
      expect(mockProcessSingleMessageSpy).toHaveBeenCalledWith(record)
      expect(mockSendErrorEmail).toHaveBeenCalledWith(event, error)
    })
  })
})
