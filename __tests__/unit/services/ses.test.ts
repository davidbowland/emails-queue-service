import { email, event } from '../__mocks__'
import * as sesService from '@services/ses'
import { generateEmailFromData, sendErrorEmail, sendRawEmail } from '@services/ses'

const mockSendRawEmail = jest.fn()
jest.mock('aws-sdk', () => ({
  SES: jest.fn(() => ({
    sendRawEmail: (...args) => ({ promise: () => mockSendRawEmail(...args) }),
  })),
}))
const mockMailComposer = jest.fn()
jest.mock('nodemailer/lib/mail-composer', () =>
  jest.fn().mockImplementation((...args) => ({
    compile: jest.fn().mockReturnValue({
      build: jest.fn().mockImplementation(async (fn) => {
        try {
          const result = await mockMailComposer(...args)
          fn(null, result)
        } catch (err) {
          fn(err, undefined)
        }
      }),
    }),
  }))
)

describe('ses', () => {
  const expectedBuffer = Buffer.from('sup?')

  describe('generateEmailFromData', () => {
    beforeAll(() => {
      mockMailComposer.mockResolvedValue(expectedBuffer)
    })

    test('expect MailComposer called with data', async () => {
      await generateEmailFromData(email)
      expect(mockMailComposer).toHaveBeenCalledWith(email)
    })

    test('expect MailComposer result to be returned', async () => {
      const result = await generateEmailFromData(email)
      expect(result).toEqual(expectedBuffer)
    })

    test('expect MailComposer to reject on error', async () => {
      const rejection = new Error()
      mockMailComposer.mockRejectedValueOnce(rejection)
      await expect(generateEmailFromData(email)).rejects.toEqual(rejection)
    })
  })

  describe('sendRawEmail', () => {
    beforeAll(() => {
      mockSendRawEmail.mockResolvedValue(undefined)
    })

    test('expect Buffer to be passed to SES', async () => {
      await sendRawEmail(expectedBuffer)
      expect(mockSendRawEmail).toHaveBeenCalledWith({ RawMessage: { Data: expectedBuffer } })
    })
  })

  describe('sendErrorEmail', () => {
    const error = new Error('A wild error appeared')
    const mockGenerateEmailFromData = jest.spyOn(sesService, 'generateEmailFromData')
    const mockSendRawEmail = jest.spyOn(sesService, 'sendRawEmail')

    test('expect generateEmailFromData called with error information', async () => {
      mockGenerateEmailFromData.mockResolvedValueOnce(expectedBuffer)
      await sendErrorEmail(event, error)
      expect(mockGenerateEmailFromData).toHaveBeenCalledWith(
        expect.objectContaining({
          from: 'do-not-reply@bowland.link',
          replyTo: 'do-not-reply@bowland.link',
          sender: 'do-not-reply@bowland.link',
          subject: 'Error processing SQS queue',
          to: ['emails-queue-service-error@bowland.link'],
        })
      )
    })

    test('expect generateEmailFromData called with error information', async () => {
      mockGenerateEmailFromData.mockResolvedValueOnce(expectedBuffer)
      mockSendRawEmail.mockResolvedValueOnce(undefined)
      await sendErrorEmail(event, error)
      expect(mockSendRawEmail).toHaveBeenCalledWith(expectedBuffer)
    })

    test('expect error message returned', async () => {
      const result = await sendErrorEmail(event, error)
      expect(result).toEqual('Error: A wild error appeared')
    })

    test('expect error message on generateEmailFromData reject', async () => {
      mockGenerateEmailFromData.mockRejectedValueOnce(expectedBuffer)
      const result = await sendErrorEmail(event, error)
      expect(result).toEqual('Error: A wild error appeared')
    })

    test('expect error message on sendRawEmail reject', async () => {
      mockGenerateEmailFromData.mockResolvedValueOnce(expectedBuffer)
      mockSendRawEmail.mockRejectedValueOnce(undefined)
      const result = await sendErrorEmail(event, error)
      expect(result).toEqual('Error: A wild error appeared')
    })
  })
})
