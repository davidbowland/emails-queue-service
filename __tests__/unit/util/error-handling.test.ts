import { handleErrorNoDefault, handleErrorWithDefault, log } from '../../../src/util/error-handling'

describe('error-handling', () => {
  const logFunc = jest.fn()

  describe('handleErrorNoDefault', () => {
    test.each(['Hello', 0, null, undefined, { a: 1, b: 2 }])(
      'expect logFunc to have been called with message',
      (value) => {
        const message = `Error message for value ${JSON.stringify(value)}`
        const error = new Error(message)

        const result = handleErrorNoDefault(logFunc)
        result(error)
        expect(logFunc).toHaveBeenCalledWith(error)
      }
    )
  })

  describe('handleErrorWithDefault', () => {
    test.each(['Hello', 0, null, undefined, { a: 1, b: 2 }])('expect value back when passed', (value) => {
      const message = `Error message for value ${JSON.stringify(value)}`
      const error = new Error(message)

      const result = handleErrorWithDefault(value, logFunc)
      expect(result(error)).toEqual(value)
    })

    test.each(['Hello', 0, null, undefined, { a: 1, b: 2 }])(
      'expect logFunc to have been called with message',
      (value) => {
        const message = `Error message for value ${JSON.stringify(value)}`
        const error = new Error(message)

        const result = handleErrorWithDefault(value, logFunc)
        result(error)
        expect(logFunc).toHaveBeenCalledWith(error)
      }
    )
  })

  describe('log', () => {
    test.each(['Hello', 0, null, undefined, { a: 1, b: 2 }])(
      'expect logFunc to have been called with message',
      (value) => {
        const message = `Log message for value ${JSON.stringify(value)}`

        const result = log(logFunc)
        result(message)
        expect(logFunc).toHaveBeenCalledWith(message)
      }
    )
  })
})
