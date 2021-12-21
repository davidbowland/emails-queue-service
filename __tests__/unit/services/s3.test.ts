import { S3 } from 'aws-sdk'

import { uuid } from '../__mocks__'
import { emailBucket } from '../../../src/config'
import * as s3Module from '../../../src/services/s3'
import { deleteContentFromS3, deleteS3Object, fetchContentFromS3, getS3Object } from '../../../src/services/s3'

const mockDeleteObject = jest.fn()
const mockGetObject = jest.fn()
jest.mock('aws-sdk', () => ({
  S3: jest.fn(() => ({
    deleteObject: (params: S3.Types.DeleteObjectRequest) => ({ promise: () => mockDeleteObject(params) }),
    getObject: (params: S3.Types.GetObjectRequest) => ({ promise: () => mockGetObject(params) }),
  })),
}))

jest.mock('../../../src/util/error-handling', () => ({
  handleErrorWithDefault: (value) => () => value,
}))

describe('S3', () => {
  const key = 'prefix/key'

  describe('fetchContentFromS3', () => {
    const expectedResult = { Hello: 'world' }
    const mockGetS3Object = jest.spyOn(s3Module, 'getS3Object')

    beforeEach(() => {
      mockGetS3Object.mockResolvedValueOnce(JSON.stringify(expectedResult))
    })

    test('expect correct key passed to getS3Object', async () => {
      await fetchContentFromS3(uuid)
      expect(mockGetS3Object).toHaveBeenCalledWith(`queue/${uuid}`)
    })

    test('expect parsed JSON returned', async () => {
      const result = await fetchContentFromS3(uuid)
      expect(result).toEqual(expectedResult)
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
    const expectedObject = 'thar-be-values-here'

    beforeAll(() => {
      mockGetObject.mockResolvedValue({ Body: expectedObject })
    })

    test('expect key passed to S3 as object', async () => {
      await getS3Object(key)
      expect(mockGetObject).toHaveBeenCalledWith({ Bucket: emailBucket, Key: key })
    })

    test('expect expectedObject as result', async () => {
      const result = await getS3Object(key)
      expect(result).toEqual(expectedObject)
    })

    test('expect empty result when body missing', async () => {
      mockGetObject.mockResolvedValueOnce({})
      const result = await getS3Object(key)
      expect(result).toEqual('')
    })

    test('expect empty result when promise rejects', async () => {
      mockGetObject.mockRejectedValueOnce({})
      const result = await getS3Object(key)
      expect(result).toEqual('')
    })
  })

  describe('deleteS3Object', () => {
    beforeAll(() => {
      mockDeleteObject.mockResolvedValue(undefined)
    })

    test('expect key passed to S3 as object', async () => {
      await deleteS3Object(key)
      expect(mockDeleteObject).toHaveBeenCalledWith({ Bucket: emailBucket, Key: key })
    })
  })
})
