import MailComposer from 'nodemailer/lib/mail-composer'
import { SES } from 'aws-sdk'
import { SQSEvent } from 'aws-lambda'
import escape from 'escape-html'

import { emailRegion, notificationFrom, notificationTarget } from '../config'
import { EmailData } from '../types'
import { logError } from '../utils/logging'

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

export const sendErrorEmail = async (event: SQSEvent, error: Error): Promise<string> => {
  try {
    const text = convertErrorToText(event, error)
    const email = await exports.generateEmailFromData({
      from: notificationFrom,
      html: `<p>${text.replace(/\n/g, '<br>')}</p>`,

      replyTo: notificationFrom,
      sender: notificationFrom,
      subject: 'Error processing SQS queue',
      text: text,
      to: [notificationTarget],
    })
    await exports.sendRawEmail(email)
  } catch (error) {
    logError(error)
  }
  return `${error}`
}
