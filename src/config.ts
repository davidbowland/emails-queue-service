// S3

export const emailBucket = process.env.EMAIL_BUCKET as string

// SES

export const emailRegion = process.env.EMAIL_REGION as string
export const emailIdentity = process.env.DOMAIN as string
export const notificationFrom = `do-not-reply@${emailIdentity}`
export const notificationTarget = 'dbowland1+emails-queue-service-error' + '@gmail.com'
