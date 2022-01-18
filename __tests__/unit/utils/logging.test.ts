import { log, logError } from '@utils/logging'

describe('logging', () => {
  describe('log', () => {
    test.each(['Hello', 0, null, undefined, { a: 1, b: 2 }])(
      'expect logFunc to have been called with message',
      (value) => {
        const message = `Log message for value ${JSON.stringify(value)}`

        log(message)
        expect(console.log).toHaveBeenCalledWith(message)
      }
    )
  })

  describe('logError', () => {
    test.each(['Hello', 0, null, undefined, { a: 1, b: 2 }])(
      'expect logFunc to have been called with message',
      (value) => {
        const message = `Error message for value ${JSON.stringify(value)}`
        const error = new Error(message)

        logError(error)
        expect(console.error).toHaveBeenCalledWith(error)
      }
    )
  })
})
