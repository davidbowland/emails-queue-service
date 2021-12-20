import { emailData, record } from '../__mocks__'
import { getDataFromRecord } from '../../../src/util/message-processing'

const mockHandleErrorWithDefault = jest.fn()
jest.mock('@util/error-handling', () => ({
  handleErrorWithDefault: (value) => (message) => (mockHandleErrorWithDefault(message), value),
}))

describe('message-processing', () => {
  describe('getDataFromRecord', () => {
    test.each([
      [record, emailData],
      [{ ...record, body: undefined }, {}],
    ])('expect correct output', async (value, expectedResult) => {
      const result = await getDataFromRecord(value)
      expect(result).toEqual(expectedResult)
    })
  })
})
