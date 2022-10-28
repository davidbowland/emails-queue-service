import MailComposer from 'nodemailer/lib/mail-composer'
import { SES } from 'aws-sdk'

import { EmailData } from '../types'
import { emailRegion } from '../config'
import { xrayCapture } from '../utils/logging'

const ses = xrayCapture(new SES({ apiVersion: '2010-12-01', region: emailRegion }))

/* General */

export const generateEmailFromData = (data: EmailData): Promise<Buffer> =>
  new Promise((resolve, reject) =>
    new MailComposer(data)
      .compile()
      .build((err: Error | null, message: Buffer) => (err ? reject(err) : resolve(message)))
  )

export const sendRawEmail = (message: Buffer): Promise<SES.SendRawEmailResponse> =>
  ses.sendRawEmail({ RawMessage: { Data: message } }).promise()
