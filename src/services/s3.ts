import { S3 } from 'aws-sdk'

import { emailBucket } from '../config'
import { handleErrorWithDefault } from '../util/error-handling'

const s3 = new S3({ apiVersion: '2006-03-01' })

/* Get */

export const getS3Object = (key: string): Promise<string> =>
  s3
    .getObject({ Bucket: emailBucket, Key: key })
    .promise()
    .then((result) => (result.Body ?? '') as string)
    .catch(handleErrorWithDefault(''))
