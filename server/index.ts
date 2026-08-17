import 'dotenv/config'
import fs from 'node:fs'
import path from 'node:path'

import cors from 'cors'
import express from 'express'

import { ensureSeedData, prisma } from './db'
import { runNotificationSweep, startNotificationScheduler } from './notifications'
import {
  ApprovalStatus,
  NotificationDeliveryStatus,
  Prisma,
  StageStatus,
  StageType,
  TaskPriority,
  TaskRoleTag,
  TaskStatus,
  UserRole,
} from '@prisma/client'

const app = express()
const port = Number(process.env.PORT || 4000)

app.use(
  cors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  }),
)
app.use(express.json())

const stageTypes = [
  StageType.SCHEMATIC_DESIGN,
  StageType.LAYOUT_DRC_LVS,
  StageType.EMX_EXTRACTION,
  StageType.POST_LAYOUT_SIMULATION,
] as const

function parseEnumValue<T extends string>(value: unknown, allowed: readonly T[]) {
  return typeof value === 'string' && allowed.includes(value as T) ? (value as T) : undefined
}

function parseOptionalInt(value: unknown) {
  if (value === null || value === undefined || value === '') {
    return undefined
  }

  const parsedValue = Number(value)
  return Number.isInteger(parsedValue) ? parsedValue : undefined
}

function parseOptionalDate(value: unknown) {
  if (value === null || value === undefined || value === '') {
    return undefined
  }

  const parsedValue = new Date(String(value))
  return Number.isNaN(parsedValue.getTime()) ? undefined : parsedValue
}

function calculateBlockCompletion(progressValues: number[]) {
  if (progressValues.length === 0) {
    return 0
  }

  return Math.round(progressValues.reduce((sum, value) => sum + value, 0) / progressValues.length)
}

function isRecordNotFoundError(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025'
}

function isUniqueConstraintError(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'
}

function isForeignKeyConstraintError(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003'
}

async function loadDashboardSnapshot() {
  const [users, blocks, tasks, notificationLogs] = await Promise.all([
    prisma.user.findMany({ orderBy: { createdAt: 'asc' } }),
    prisma.block.findMany({
      include: {
        stages: {
          include: { assignedUser: true },
          orderBy: { stageType: 'asc' },
        },
      },
      orderBy: { name: 'asc' },
    }),
    prisma.task.findMany({
      include: {
        assignee: true,
        block: true,
      },
      orderBy: [{ status: 'asc' }, { priority: 'desc' }, { dueAt: 'asc' }],
    }),
    prisma.notificationLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 10,
    }),
  ])

  const now = new Date()
  const pendingApprovals = users.filter((user) => user.approvalStatus === ApprovalStatus.PENDING_APPROVAL)
  const approvedUsers = users.filter((user) => user.approvalStatus === ApprovalStatus.APPROVED)
  const overdueTasks = tasks.filter((task) => task.dueAt && task.dueAt <= now && task.status !== TaskStatus.DONE)
  const upcomingDeadlines = tasks
    .filter((task) => task.dueAt && task.dueAt > now && task.status !== TaskStatus.DONE)
    .slice(0, 5)
  const pendingSimulations = blocks.flatMap((block) =>
    block.stages
      .filter((stage) =>
        (stage.stageType === StageType.EMX_EXTRACTION ||
          stage.stageType === StageType.POST_LAYOUT_SIMULATION) &&
        stage.status !== StageStatus.DONE,
      )
      .map((stage) => ({
        blockName: block.name,
        stageType: stage.stageType,
        progress: stage.progress,
        status: stage.status,
        assignee: stage.assignedUser?.name || 'Unassigned',
      })),
  )

  const blockProgress = blocks.map((block) => ({
    id: block.id,
    name: block.name,
    description: block.description,
    completionPercentage: calculateBlockCompletion(block.stages.map((stage) => stage.progress)),
  }))

  const dashboard = {
    totals: {
      blocks: blocks.length,
      tasks: tasks.length,
      overdueTasks: overdueTasks.length,
      pendingApprovals: pendingApprovals.length,
      approvedUsers: approvedUsers.length,
      averageBlockCompletion: calculateBlockCompletion(
        blockProgress.map((block) => block.completionPercentage),
      ),
    },
    blockProgress,
    upcomingDeadlines,
    pendingSimulations,
    recentNotifications: notificationLogs,
  }

  return { users, blocks, tasks, pendingApprovals, dashboard }
}

app.get('/api/bootstrap', async (_request, response) => {
  response.json(await loadDashboardSnapshot())
})

app.get('/api/users', async (_request, response) => {
  response.json(
    await prisma.user.findMany({
      orderBy: [{ approvalStatus: 'asc' }, { name: 'asc' }],
    }),
  )
})

app.post('/api/auth/register', async (request, response) => {
  const role = parseEnumValue(request.body.role, Object.values(UserRole))

  if (!request.body.name || !request.body.email || !role) {
    response.status(400).json({ error: 'name, email, and role are required.' })
    return
  }

  try {
    const user = await prisma.user.create({
      data: {
        name: String(request.body.name),
        email: String(request.body.email).toLowerCase(),
        role,
        approvalStatus: ApprovalStatus.PENDING_APPROVAL,
      },
    })

    response.status(201).json(user)
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      response.status(409).json({ error: 'A user with this email already exists.' })
      return
    }

    throw error
  }
})

app.patch('/api/users/:id/approval', async (request, response) => {
  const approvalStatus = parseEnumValue(request.body.approvalStatus, Object.values(ApprovalStatus))

  if (!approvalStatus) {
    response.status(400).json({ error: 'approvalStatus must be APPROVED, REJECTED, or PENDING_APPROVAL.' })
    return
  }

  try {
    const user = await prisma.user.update({
      where: { id: Number(request.params.id) },
      data: { approvalStatus },
    })

    response.json(user)
  } catch (error) {
    if (isRecordNotFoundError(error)) {
      response.status(404).json({ error: 'User not found.' })
      return
    }

    throw error
  }
})

app.get('/api/dashboard', async (_request, response) => {
  const { dashboard } = await loadDashboardSnapshot()
  response.json(dashboard)
})

app.get('/api/blocks', async (_request, response) => {
  response.json(
    await prisma.block.findMany({
      include: {
        stages: {
          include: { assignedUser: true },
          orderBy: { stageType: 'asc' },
        },
      },
      orderBy: { name: 'asc' },
    }),
  )
})

app.post('/api/blocks', async (request, response) => {
  if (!request.body.name || !request.body.description) {
    response.status(400).json({ error: 'name and description are required.' })
    return
  }

  const block = await prisma.block.create({
    data: {
      name: String(request.body.name),
      description: String(request.body.description),
      stages: {
        create: stageTypes.map((stageType) => ({
          stageType,
          status: StageStatus.NOT_STARTED,
          progress: 0,
        })),
      },
    },
    include: {
      stages: {
        include: { assignedUser: true },
        orderBy: { stageType: 'asc' },
      },
    },
  })

  response.status(201).json(block)
})

app.patch('/api/block-stages/:id', async (request, response) => {
  const status = parseEnumValue(request.body.status, Object.values(StageStatus))
  const progress = request.body.progress === undefined ? undefined : Number(request.body.progress)
  const assignedUserId =
    request.body.assignedUserId === null ? null : parseOptionalInt(request.body.assignedUserId)

  try {
    const blockStage = await prisma.blockStage.update({
      where: { id: Number(request.params.id) },
      data: {
        status,
        progress: Number.isFinite(progress) ? Math.min(100, Math.max(0, Number(progress))) : undefined,
        assignedUserId,
        notes: typeof request.body.notes === 'string' ? request.body.notes : undefined,
      },
      include: {
        assignedUser: true,
        block: true,
      },
    })

    response.json(blockStage)
  } catch (error) {
    if (isRecordNotFoundError(error)) {
      response.status(404).json({ error: 'Block stage not found.' })
      return
    }

    throw error
  }
})

app.get('/api/tasks', async (_request, response) => {
  response.json(
    await prisma.task.findMany({
      include: {
        assignee: true,
        block: true,
      },
      orderBy: [{ status: 'asc' }, { priority: 'desc' }, { dueAt: 'asc' }],
    }),
  )
})

app.post('/api/tasks', async (request, response) => {
  if (!request.body.title || !request.body.description || !request.body.roleTag) {
    response.status(400).json({ error: 'title, description, and roleTag are required.' })
    return
  }

  const roleTag = parseEnumValue(request.body.roleTag, Object.values(TaskRoleTag))
  const priority = parseEnumValue(request.body.priority, Object.values(TaskPriority)) || TaskPriority.MEDIUM
  const status = parseEnumValue(request.body.status, Object.values(TaskStatus)) || TaskStatus.BACKLOG

  if (!roleTag) {
    response.status(400).json({ error: 'roleTag must be DESIGN, LAYOUT, or ALL.' })
    return
  }

  const isOpenTask = Boolean(request.body.isOpenTask)
  const dueAt = isOpenTask ? undefined : parseOptionalDate(request.body.dueAt)

  try {
    const task = await prisma.task.create({
      data: {
        title: String(request.body.title),
        description: String(request.body.description),
        roleTag,
        priority,
        status,
        blockId: parseOptionalInt(request.body.blockId),
        assigneeId: parseOptionalInt(request.body.assigneeId),
        dueAt,
        isOpenTask,
        emailReminderEnabled: Boolean(request.body.emailReminderEnabled) && !isOpenTask,
        reminderHoursBefore: parseOptionalInt(request.body.reminderHoursBefore) || 24,
      },
      include: {
        assignee: true,
        block: true,
      },
    })

    response.status(201).json(task)
  } catch (error) {
    if (isRecordNotFoundError(error) || isForeignKeyConstraintError(error)) {
      response.status(404).json({ error: 'Block or assignee not found.' })
      return
    }

    throw error
  }
})

app.patch('/api/tasks/:id', async (request, response) => {
  const roleTag = parseEnumValue(request.body.roleTag, Object.values(TaskRoleTag))
  const priority = parseEnumValue(request.body.priority, Object.values(TaskPriority))
  const status = parseEnumValue(request.body.status, Object.values(TaskStatus))
  const isOpenTask =
    typeof request.body.isOpenTask === 'boolean' ? request.body.isOpenTask : undefined
  const dueAt =
    isOpenTask === true
      ? null
      : request.body.dueAt === null
        ? null
        : parseOptionalDate(request.body.dueAt)

  try {
    const task = await prisma.task.update({
      where: { id: Number(request.params.id) },
      data: {
        title: typeof request.body.title === 'string' ? request.body.title : undefined,
        description: typeof request.body.description === 'string' ? request.body.description : undefined,
        roleTag,
        priority,
        status,
        blockId:
          request.body.blockId === null ? null : parseOptionalInt(request.body.blockId),
        assigneeId:
          request.body.assigneeId === null ? null : parseOptionalInt(request.body.assigneeId),
        dueAt,
        isOpenTask,
        emailReminderEnabled:
          typeof request.body.emailReminderEnabled === 'boolean'
            ? request.body.emailReminderEnabled
            : undefined,
      },
      include: {
        assignee: true,
        block: true,
      },
    })

    response.json(task)
  } catch (error) {
    if (isRecordNotFoundError(error)) {
      response.status(404).json({ error: 'Task not found.' })
      return
    }

    throw error
  }
})

app.delete('/api/tasks/:id', async (request, response) => {
  try {
    await prisma.task.delete({
      where: { id: Number(request.params.id) },
    })

    response.status(204).send()
  } catch (error) {
    if (isRecordNotFoundError(error)) {
      response.status(404).json({ error: 'Task not found.' })
      return
    }

    throw error
  }
})

app.post('/api/notifications/run-reminders', async (_request, response) => {
  response.json(await runNotificationSweep())
})

app.get('/api/notification-logs', async (_request, response) => {
  response.json(
    await prisma.notificationLog.findMany({
      where: { deliveryStatus: { in: [NotificationDeliveryStatus.SENT, NotificationDeliveryStatus.FAILED] } },
      orderBy: { createdAt: 'desc' },
      take: 20,
    }),
  )
})

// In production the API also serves the built Vite frontend from `dist`, so the
// entire app runs as a single service on a single port. The `dist` folder only
// exists after `vite build`, which keeps the local dev proxy flow untouched.
const clientDistPath = path.resolve(process.cwd(), 'dist')

if (fs.existsSync(clientDistPath)) {
  app.use(express.static(clientDistPath))

  // Read the SPA entry point once at startup so the fallback route does not touch
  // the file system on every request.
  const indexHtml = fs.readFileSync(path.join(clientDistPath, 'index.html'), 'utf8')

  // SPA fallback: send index.html for any non-API GET request so client-side
  // routing works on page reloads and deep links.
  app.use((request, response, next) => {
    if (request.method !== 'GET' || request.path.startsWith('/api')) {
      next()
      return
    }

    response.type('html').send(indexHtml)
  })
}

app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
  console.error(error)
  response.status(500).json({ error: 'Internal server error.' })
})

async function startServer() {
  await ensureSeedData()
  startNotificationScheduler()

  app.listen(port, () => {
    console.log(`PLL workflow server listening on port ${port}`)
  })
}

void startServer()
