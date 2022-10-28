import { generateEmailFromData, sendRawEmail } from '@services/ses'
import { email } from '../__mocks__'

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
})
