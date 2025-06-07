import { SendRawEmailCommand, SendRawEmailResponse, SESClient } from '@aws-sdk/client-ses'
import MailComposer from 'nodemailer/lib/mail-composer'

import { emailRegion } from '../config'
import { EmailData } from '../types'
import { xrayCapture } from '../utils/logging'

const ses = xrayCapture(new SESClient({ apiVersion: '2010-12-01', region: emailRegion }))

/* General */

export const generateEmailFromData = (data: EmailData): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    const composer = new MailComposer(data).compile()
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore See https://nodemailer.com/extras/mailcomposer/#bcc
    composer.keepBcc = true
    composer.build((err: Error | null, message: Buffer) => (err ? reject(err) : resolve(message)))
  })

export const sendRawEmail = async (message: Buffer): Promise<SendRawEmailResponse> => {
  const command = new SendRawEmailCommand({ RawMessage: { Data: message } })
  return ses.send(command)
}
