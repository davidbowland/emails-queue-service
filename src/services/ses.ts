import { SES } from 'aws-sdk'
import MailComposer from 'nodemailer/lib/mail-composer'
// import { Attachment } from 'nodemailer/lib/mailer'

import { emailRegion } from '../config'
import { handleErrorNoDefault } from '../util/error-handling'
import { EmailData } from '../util/message-processing'

const ses = new SES({ apiVersion: '2010-12-01', region: emailRegion })

export const generateEmailFromData = (data: EmailData): Promise<Buffer> =>
  new Promise((resolve, reject) =>
    new MailComposer(data)
      .compile()
      .build((err: Error | null, message: Buffer) => (err ? reject(err) : resolve(message)))
  )

export const sendRawEmail = (message: Buffer): Promise<SES.SendRawEmailResponse | unknown> =>
  ses
    .sendRawEmail({ RawMessage: { Data: message } })
    .promise()
    .catch(handleErrorNoDefault())
