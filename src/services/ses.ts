import { SQSEvent } from 'aws-lambda'
import { SES } from 'aws-sdk'
import escape from 'escape-html'
import MailComposer from 'nodemailer/lib/mail-composer'

import { emailRegion, notificationFrom, notificationTarget } from '../config'
import { EmailData } from '../types'
import { log, logError } from '../utils/logging'

const ses = new SES({ apiVersion: '2010-12-01', region: emailRegion })

/* General */

export const generateEmailFromData = (data: EmailData): Promise<Buffer> =>
  new Promise((resolve, reject) =>
    new MailComposer(data)
      .compile()
      .build((err: Error | null, message: Buffer) => (err ? reject(err) : resolve(message)))
  )

export const sendRawEmail = (message: Buffer): Promise<SES.SendRawEmailResponse> =>
  ses.sendRawEmail({ RawMessage: { Data: message } }).promise()

/* Error */

const convertErrorToText = (event: SQSEvent, error: Error): string =>
  `There was an error processing SQS message event: ${escape(
    JSON.stringify(event)
  )}\n\nAt ${new Date().toISOString()} encountered error: ${escape(error as unknown as string)}\n${escape(error.stack)}`

export const sendErrorEmail = (event: SQSEvent, error: Error): Promise<string> =>
  Promise.resolve(convertErrorToText(event, error))
    .then((text) => ({
      from: notificationFrom,
      sender: notificationFrom,
      to: [notificationTarget],
      replyTo: notificationFrom,
      subject: 'Error processing SQS queue',
      text: text,
      html: `<p>${text.replace(/\n/g, '<br>')}</p>`,
    }))
    .then(exports.generateEmailFromData)
    .then(exports.sendRawEmail)
    .then(() => log(error))
    .catch(logError)
    .then(() => `${error}`)
