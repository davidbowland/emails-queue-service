import { emailData, record } from '../__mocks__'
import * as sqsPayloadProcessor from '../../../src/handlers/sqs-payload-processor'
import { processSingleMessage, sqsPayloadProcessorHandler } from '../../../src/handlers/sqs-payload-processor'

const mockGenerateEmailFromData = jest.fn()
const mockSendRawEmail = jest.fn()
jest.mock('@services/ses', () => ({
  generateEmailFromData: (data) => mockGenerateEmailFromData(data),
  sendRawEmail: (message) => mockSendRawEmail(message),
}))
const mockGetDataFromRecord = jest.fn()
jest.mock('@util/message-processing', () => ({
  getDataFromRecord: (record) => mockGetDataFromRecord(record),
}))

describe('sqs-payload-processor', () => {
  const expectedBuffer = Buffer.from('hello!')

  describe('processSingleMessage', () => {
    beforeAll(() => {
      mockGenerateEmailFromData.mockResolvedValue(expectedBuffer)
      mockSendRawEmail.mockResolvedValue(undefined)
      mockGetDataFromRecord.mockResolvedValue({ email: emailData })
    })

    test('expect getDataFromRecord to be called with input', async () => {
      await processSingleMessage(record)
      expect(mockGetDataFromRecord).toHaveBeenCalledWith(record)
    })

    test('expect mockGenerateEmailFromData to be called with output from getDataFromRecord', async () => {
      await processSingleMessage(record)
      expect(mockGenerateEmailFromData).toHaveBeenCalledWith(emailData)
    })

    test('expect sendRawEmail to be called with output from generateEmaiFromData', async () => {
      await processSingleMessage(record)
      expect(mockSendRawEmail).toHaveBeenCalledWith(expectedBuffer)
    })
  })

  describe('sqsPayloadProcessorHandler', () => {
    const event = { Records: [record] }
    const processSingleMessageSpy = jest.spyOn(sqsPayloadProcessor, 'processSingleMessage')

    test('expect processSingleMessage to be called for each record', async () => {
      await sqsPayloadProcessorHandler(event)
      expect(processSingleMessageSpy).toHaveBeenCalledWith(record)
    })
  })
})
