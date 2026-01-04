import { email } from '../__mocks__'
import { generateEmailFromData, sendBounce, sendRawEmail } from '@services/ses'

const mockSend = jest.fn()
jest.mock('@aws-sdk/client-ses', () => ({
  SendBounceCommand: jest.fn().mockImplementation((x) => x),
  SendRawEmailCommand: jest.fn().mockImplementation((x) => x),
  SESClient: jest.fn(() => ({
    send: (...args: any[]) => mockSend(...args),
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
  })),
)
jest.mock('@utils/logging', () => ({
  log: jest.fn(),
  logError: jest.fn(),
  xrayCapture: jest.fn().mockImplementation((x) => x),
}))

describe('ses', () => {
  const expectedBuffer = Buffer.from('sup?')

  describe('generateEmailFromData', () => {
    beforeAll(() => {
      mockMailComposer.mockResolvedValue(expectedBuffer)
    })

    it('should call MailComposer with data', async () => {
      await generateEmailFromData(email)

      expect(mockMailComposer).toHaveBeenCalledWith(email)
    })

    it('should return MailComposer result', async () => {
      const result = await generateEmailFromData(email)

      expect(result).toEqual(expectedBuffer)
    })

    it('should reject when MailComposer errors', async () => {
      const rejection = new Error()
      mockMailComposer.mockRejectedValueOnce(rejection)

      await expect(generateEmailFromData(email)).rejects.toEqual(rejection)
    })
  })

  describe('sendRawEmail', () => {
    beforeAll(() => {
      mockSend.mockResolvedValue(undefined)
    })

    it('should pass Buffer to SES', async () => {
      await sendRawEmail(expectedBuffer)

      expect(mockSend).toHaveBeenCalledWith({ RawMessage: { Data: expectedBuffer } })
    })
  })

  describe('sendBounce', () => {
    const originalMessageId = 'test-message-id-123'
    const bouncedRecipients = ['bounce1@example.com', 'bounce2@example.com']
    const bounceSender = 'noreply@example.com'

    beforeAll(() => {
      mockSend.mockResolvedValue(undefined)
    })

    it('should send bounce with default values when no options provided', async () => {
      await sendBounce(originalMessageId, bouncedRecipients, bounceSender)

      expect(mockSend).toHaveBeenCalledWith({
        BouncedRecipientInfoList: [
          {
            BounceType: 'ContentRejected',
            Recipient: 'bounce1@example.com',
          },
          {
            BounceType: 'ContentRejected',
            Recipient: 'bounce2@example.com',
          },
        ],
        BounceSender: bounceSender,
        OriginalMessageId: originalMessageId,
      })
    })

    it('should send bounce with custom options when provided', async () => {
      const options = {
        bounceType: 'ExceededQuota' as const,
      } as any

      await sendBounce(originalMessageId, bouncedRecipients, bounceSender, options)

      expect(mockSend).toHaveBeenCalledWith({
        BouncedRecipientInfoList: [
          {
            BounceType: 'ExceededQuota',
            Recipient: 'bounce1@example.com',
          },
          {
            BounceType: 'ExceededQuota',
            Recipient: 'bounce2@example.com',
          },
        ],
        BounceSender: bounceSender,
        OriginalMessageId: originalMessageId,
      })
    })

    it('should throw error when SES send fails', async () => {
      const sesError = new Error('SES service error')
      mockSend.mockRejectedValueOnce(sesError)

      await expect(sendBounce(originalMessageId, bouncedRecipients, bounceSender)).rejects.toThrow('SES service error')
    })
  })
})
