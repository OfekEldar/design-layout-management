import nodemailer from 'nodemailer'

import {
  NotificationDeliveryStatus,
  NotificationType,
  TaskStatus,
} from '@prisma/client'
import { prisma } from './db'

const transporter = createTransport()

function createTransport() {
  const host = process.env.SMTP_HOST
  const port = Number(process.env.SMTP_PORT || 587)
  const user = process.env.SMTP_USER
  const pass = process.env.SMTP_PASS

  if (host && user && pass) {
    return nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    })
  }

  return nodemailer.createTransport({ jsonTransport: true })
}

async function logNotification(input: {
  taskId: number
  recipientEmail: string
  notificationType: NotificationType
  scheduledFor: Date
  deliveryStatus: NotificationDeliveryStatus
  message: string
}) {
  await prisma.notificationLog.create({
    data: input,
  })
}

async function alreadyNotified(taskId: number, recipientEmail: string, notificationType: NotificationType) {
  return prisma.notificationLog.findFirst({
    where: {
      taskId,
      recipientEmail,
      notificationType,
      deliveryStatus: NotificationDeliveryStatus.SENT,
    },
    select: { id: true },
  })
}

async function sendTaskEmail(input: {
  recipientEmail: string
  subject: string
  message: string
}) {
  await transporter.sendMail({
    from: process.env.SMTP_FROM || 'pll-workflow@example.com',
    to: input.recipientEmail,
    subject: input.subject,
    text: input.message,
  })
}

export async function runNotificationSweep() {
  const now = new Date()
  const reminderBoundary = new Date(now.getTime() + 24 * 60 * 60 * 1000)
  const summary = {
    remindersSent: 0,
    overdueWarningsSent: 0,
    skipped: 0,
  }

  const tasks = await prisma.task.findMany({
    where: {
      OR: [
        {
          dueAt: { lte: reminderBoundary },
          emailReminderEnabled: true,
        },
        {
          dueAt: { lte: now },
        },
      ],
      status: { not: TaskStatus.DONE },
      isOpenTask: false,
    },
    include: {
      assignee: true,
      block: true,
    },
  })

  const teamLeadEmail = process.env.TEAM_LEAD_EMAIL || 'lead@example.com'

  for (const task of tasks) {
    if (!task.dueAt || !task.assignee?.email) {
      summary.skipped += 1
      continue
    }

    const isOverdue = task.dueAt <= now
    const notificationType = isOverdue ? NotificationType.OVERDUE_WARNING : NotificationType.REMINDER
    const subject = isOverdue
      ? `Overdue task: ${task.title}`
      : `Upcoming deadline: ${task.title}`
    const recipients = isOverdue ? [task.assignee.email, teamLeadEmail] : [task.assignee.email]

    for (const recipientEmail of recipients) {
      const priorLog = await alreadyNotified(task.id, recipientEmail, notificationType)

      if (priorLog) {
        summary.skipped += 1
        continue
      }

      const message = [
        `Task: ${task.title}`,
        `Block: ${task.block?.name || 'General'}`,
        `Status: ${task.status}`,
        `Due: ${task.dueAt.toISOString()}`,
        '',
        isOverdue
          ? 'This task has reached its deadline and is not marked Done.'
          : 'This task is due within the next 24 hours.',
      ].join('\n')

      try {
        await sendTaskEmail({ recipientEmail, subject, message })
        await logNotification({
          taskId: task.id,
          recipientEmail,
          notificationType,
          scheduledFor: task.dueAt,
          deliveryStatus: NotificationDeliveryStatus.SENT,
          message,
        })

        if (isOverdue) {
          summary.overdueWarningsSent += 1
        } else {
          summary.remindersSent += 1
        }
      } catch (error) {
        await logNotification({
          taskId: task.id,
          recipientEmail,
          notificationType,
          scheduledFor: task.dueAt,
          deliveryStatus: NotificationDeliveryStatus.FAILED,
          message: error instanceof Error ? error.message : 'Unknown mail transport error',
        })
      }
    }
  }

  return summary
}

export function startNotificationScheduler() {
  if (process.env.ENABLE_NOTIFICATION_SCHEDULER !== 'true') {
    return
  }

  void runNotificationSweep()
  setInterval(() => {
    void runNotificationSweep()
  }, 60 * 60 * 1000)
}
