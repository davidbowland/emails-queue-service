export const handleErrorNoDefault =
  (logFunc = console.error) =>
    (error: Error): unknown =>
      logFunc(error)

// prettier-ignore
export const handleErrorWithDefault =
  <Type>(value: Type, logFunc=console.error) => (error: Error): Type => (logFunc(error), value)
