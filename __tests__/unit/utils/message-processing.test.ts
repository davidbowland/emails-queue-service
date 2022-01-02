import { email, record } from '../__mocks__'
import { getDataFromRecord } from '@utils/message-processing'

describe('message-processing', () => {
  describe('getDataFromRecord', () => {
    test('expect correct output', async () => {
      const result = await getDataFromRecord(record)
      expect(result).toEqual(email)
    })
  })
})
