import { S3 } from 'aws-sdk'

import { emailBucket } from '../../../src/config'
import { getS3Object } from '../../../src/services/s3'

const mockGetObject = jest.fn()
jest.mock('aws-sdk', () => ({
  S3: jest.fn(() => ({
    getObject: (params: S3.Types.GetObjectRequest) => ({ promise: () => mockGetObject(params) }),
  })),
}))

jest.mock('../../../src/util/error-handling', () => ({
  handleErrorWithDefault: (value) => () => value,
}))

describe('S3', () => {
  const key = 'prefix/key'

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
})
