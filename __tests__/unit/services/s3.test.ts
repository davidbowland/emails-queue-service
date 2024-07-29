import { attachmentBuffer, email, uuid } from '../__mocks__'
import { deleteContentFromS3, fetchContentFromS3 } from '@services/s3'
import { emailBucket } from '@config'

const mockSend = jest.fn()
jest.mock('@aws-sdk/client-s3', () => ({
  DeleteObjectCommand: jest.fn().mockImplementation((x) => x),
  GetObjectCommand: jest.fn().mockImplementation((x) => x),
  S3Client: jest.fn(() => ({
    send: (...args) => mockSend(...args),
  })),
}))
jest.mock('@utils/logging', () => ({
  xrayCapture: jest.fn().mockImplementation((x) => x),
}))

describe('S3', () => {
  const key = `queue/${uuid}`

  describe('fetchContentFromS3', () => {
    const expectedResult = { Hello: 'world' }

    const mockBuffer = jest.fn().mockReturnValue(expectedResult)

    beforeAll(() => {
      const mockBody = {
        on: jest.fn().mockImplementation((action, predicate) => {
          if (action === 'data') {
            const result = mockBuffer()
            predicate(Buffer.from(JSON.stringify(result) ?? ''))
          } else if (action === 'end') {
            predicate()
          }
        }),
      }
      mockSend.mockResolvedValue({ Body: mockBody })
    })

    test('expect key passed to S3 as object', async () => {
      await fetchContentFromS3(uuid)

      expect(mockSend).toHaveBeenCalledWith({ Bucket: emailBucket, Key: key })
    })

    test('expect expectedObject as result', async () => {
      const result = await fetchContentFromS3(uuid)

      expect(result).toEqual(expect.objectContaining(expectedResult))
    })

    test('expect Buffer attachments parsed accordingly', async () => {
      mockBuffer.mockReturnValueOnce(email)
      const result = await fetchContentFromS3(uuid)

      expect(result.attachments[0].content).toEqual(attachmentBuffer)
    })

    test('expect non-Buffer attachments parsed and deleted accordingly', async () => {
      const content = 'colorless green ideas'
      const key = 'queue/message/attachment'
      const attachment = { ...email.attachments[0], content: key }
      mockBuffer
        .mockReturnValueOnce({ ...email, attachments: [attachment] })
        .mockReturnValueOnce(content)
        .mockReturnValueOnce(undefined)
      const result = await fetchContentFromS3(uuid)

      expect(result.attachments[0].content).toEqual(Buffer.from(JSON.stringify(content)))
      expect(mockSend).toHaveBeenCalledWith({ Bucket: emailBucket, Key: `queue/${uuid}` })
      expect(mockSend).toHaveBeenCalledWith({ Bucket: emailBucket, Key: key })
      expect(mockSend).toHaveBeenCalledWith({ Bucket: emailBucket, Key: key })
      expect(mockSend).toHaveBeenCalledTimes(3)
    })
  })

  describe('deleteContentFromS3', () => {
    beforeAll(() => {
      mockSend.mockResolvedValue(undefined)
    })

    test('expect correct key passed to getS3Object', async () => {
      await deleteContentFromS3(uuid)

      expect(mockSend).toHaveBeenCalledWith({ Bucket: emailBucket, Key: key })
    })
  })
})
