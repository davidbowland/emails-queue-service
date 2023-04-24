import * as s3Module from '@services/s3'
import { attachmentBuffer, email, uuid } from '../__mocks__'
import { deleteContentFromS3, deleteS3Object, fetchContentFromS3, getS3Object } from '@services/s3'
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
  const key = 'prefix/key'

  describe('fetchContentFromS3', () => {
    const expectedResult = { Hello: 'world' }
    const mockDeleteS3Object = jest.spyOn(s3Module, 'deleteS3Object')
    const mockGetS3Object = jest.spyOn(s3Module, 'getS3Object')

    test('expect correct key passed to getS3Object', async () => {
      mockGetS3Object.mockResolvedValueOnce(Buffer.from(JSON.stringify(expectedResult)))
      await fetchContentFromS3(uuid)

      expect(mockGetS3Object).toHaveBeenCalledWith(`queue/${uuid}`)
    })

    test('expect parsed JSON returned', async () => {
      mockGetS3Object.mockResolvedValueOnce(Buffer.from(JSON.stringify(expectedResult)))
      const result = await fetchContentFromS3(uuid)

      expect(result).toEqual(expect.objectContaining(expectedResult))
    })

    test('expect Buffer attachments parsed accordingly', async () => {
      mockGetS3Object.mockResolvedValueOnce(Buffer.from(JSON.stringify(email)))
      const result = await fetchContentFromS3(uuid)

      expect(result.attachments[0].content).toEqual(attachmentBuffer)
    })

    test('expect non-Buffer attachments parsed accordingly', async () => {
      const content = 'colorless green ideas'
      const key = 'queue/message/attachment'
      const attachment = { ...email.attachments[0], content: key }
      mockDeleteS3Object.mockResolvedValueOnce(undefined)
      mockGetS3Object.mockResolvedValueOnce(Buffer.from(JSON.stringify({ ...email, attachments: [attachment] })))
      mockGetS3Object.mockResolvedValueOnce(Buffer.from(content))
      const result = await fetchContentFromS3(uuid)

      expect(result.attachments[0].content).toEqual(Buffer.from(content))
    })

    test('expect non-Buffer attachments to be deleted', async () => {
      const content = 'colorless green ideas'
      const key = 'queue/message/attachment'
      const attachment = { ...email.attachments[0], content: key }
      mockDeleteS3Object.mockResolvedValueOnce(undefined)
      mockGetS3Object.mockResolvedValueOnce(Buffer.from(JSON.stringify({ ...email, attachments: [attachment] })))
      mockGetS3Object.mockResolvedValueOnce(Buffer.from(content))
      await fetchContentFromS3(uuid)

      expect(mockDeleteS3Object).toHaveBeenCalledWith(key)
    })
  })

  describe('deleteContentFromS3', () => {
    const mockDeleteS3Object = jest.spyOn(s3Module, 'deleteS3Object')

    test('expect correct key passed to getS3Object', async () => {
      await deleteContentFromS3(uuid)

      expect(mockDeleteS3Object).toHaveBeenCalledWith(`queue/${uuid}`)
    })
  })

  describe('getS3Object', () => {
    const expectedObject = Buffer.from('thar-be-values-here')

    const mockBuffer = {
      on: jest.fn().mockImplementation((action, predicate) => {
        if (action === 'data') {
          predicate(expectedObject)
        } else if (action === 'end') {
          predicate()
        }
      }),
    }

    beforeAll(() => {
      mockSend.mockResolvedValue({ Body: mockBuffer })
    })

    test('expect key passed to S3 as object', async () => {
      await getS3Object(key)

      expect(mockSend).toHaveBeenCalledWith({ Bucket: emailBucket, Key: key })
    })

    test('expect expectedObject as result', async () => {
      const result = await getS3Object(key)

      expect(result).toEqual(expectedObject)
    })
  })

  describe('deleteS3Object', () => {
    beforeAll(() => {
      mockSend.mockResolvedValue(undefined)
    })

    test('expect key passed to S3 as object', async () => {
      await deleteS3Object(key)

      expect(mockSend).toHaveBeenCalledWith({ Bucket: emailBucket, Key: key })
    })
  })
})
