import { S3 } from 'aws-sdk'

import { emailBucket } from '../config'
import { handleErrorWithDefault } from '../util/error-handling'
import { EmailData } from '../util/message-processing'

const s3 = new S3({ apiVersion: '2006-03-01' })

export const fetchContentFromS3 = (uuid: string): Promise<EmailData> =>
  exports.getS3Object(`queue/${uuid}`).then(JSON.parse)

export const deleteContentFromS3 = (uuid: string): Promise<S3.DeleteObjectOutput> =>
  exports.deleteS3Object(`queue/${uuid}`)

/* Get */

export const getS3Object = (key: string): Promise<string> =>
  s3
    .getObject({ Bucket: emailBucket, Key: key })
    .promise()
    .then((result) => (result.Body ?? '') as string)
    .catch(handleErrorWithDefault(''))

/* Delete */

export const deleteS3Object = (key: string): Promise<S3.DeleteObjectOutput> =>
  s3.deleteObject({ Bucket: emailBucket, Key: key }).promise()
