import { emailData, record, uuid } from '../__mocks__'
import * as sqsPayloadProcessor from '../../../src/handlers/sqs-payload-processor'
import { processSingleMessage, sqsPayloadProcessorHandler } from '../../../src/handlers/sqs-payload-processor'

const mockDeleteContentFromS3 = jest.fn()
const mockFetchContentFromS3 = jest.fn()
jest.mock('../../../src/services/s3', () => ({
  deleteContentFromS3: (uuid) => mockDeleteContentFromS3(uuid),
  fetchContentFromS3: (uuid) => mockFetchContentFromS3(uuid),
}))
const mockGenerateEmailFromData = jest.fn()
const mockSendRawEmail = jest.fn()
jest.mock('../../../src/services/ses', () => ({
  generateEmailFromData: (data) => mockGenerateEmailFromData(data),
  sendRawEmail: (message) => mockSendRawEmail(message),
}))
const mockGetDataFromRecord = jest.fn()
jest.mock('../../../src/util/message-processing', () => ({
  getDataFromRecord: (record) => mockGetDataFromRecord(record),
}))

describe('sqs-payload-processor', () => {
  beforeAll(() => {
    mockGetDataFromRecord.mockResolvedValue({ uuid })
  })

  describe('processSingleMessage', () => {
    const expectedBuffer = Buffer.from('hello!')

    beforeAll(() => {
      mockFetchContentFromS3.mockResolvedValue(emailData)
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
      expect(mockGenerateEmailFromData).toHaveBeenCalledWith(emailData)
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
    const processSingleMessageSpy = jest.spyOn(sqsPayloadProcessor, 'processSingleMessage')

    test('expect processSingleMessage to be called for each record', async () => {
      await sqsPayloadProcessorHandler(event, undefined, undefined)
      expect(processSingleMessageSpy).toHaveBeenCalledWith(record)
      expect(processSingleMessageSpy).toHaveBeenCalledWith(record2)
    })
  })
})
