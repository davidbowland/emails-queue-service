import { email } from '../__mocks__'
import { generateEmailFromData, sendRawEmail } from '@services/ses'

const mockSend = jest.fn()
jest.mock('@aws-sdk/client-ses', () => ({
  SendRawEmailCommand: jest.fn().mockImplementation((x) => x),
  SESClient: jest.fn(() => ({
    send: (...args) => mockSend(...args),
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
})
