import { email, record } from '../__mocks__'
import { getDataFromRecord } from '@util/message-processing'

const mockHandleErrorWithDefault = jest.fn()
jest.mock('@util/error-handling', () => ({
  handleErrorWithDefault:
    (value) =>
      (...args) => (mockHandleErrorWithDefault(...args), value),
}))

describe('message-processing', () => {
  describe('getDataFromRecord', () => {
    test.each([
      [record, email],
      [{ ...record, body: undefined }, {}],
    ])('expect correct output', async (value, expectedResult) => {
      const result = await getDataFromRecord(value)
      expect(result).toEqual(expectedResult)
    })
  })
})
