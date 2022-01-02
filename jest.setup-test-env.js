// S3

process.env.EMAIL_BUCKET = 'test-bucket'

// SES

process.env.EMAIL_REGION = 'us-east-1'

// Console

console.info = jest.fn()
console.log = jest.fn()
console.warn = jest.fn()
console.error = jest.fn()
