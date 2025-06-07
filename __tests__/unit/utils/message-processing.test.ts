import { email, record } from '../__mocks__'
import { getDataFromRecord } from '@utils/message-processing'

describe('message-processing', () => {
  describe('getDataFromRecord', () => {
    it('should return correct output', () => {
      const result = getDataFromRecord(record)

      expect(result).toEqual(email)
    })
  })
})
