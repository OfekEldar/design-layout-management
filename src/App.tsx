import { useEffect, useMemo, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import {
  BellRing,
  Blocks,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  Filter,
  LayoutGrid,
  MailCheck,
  ShieldCheck,
  UserPlus,
} from 'lucide-react'

import { api } from './api'
import { Badge, Button, Card, ProgressBar } from './components/ui'
import type { BlockStage, BootstrapData, Task, TaskStatus, User } from './types'

const stageLabels: Record<BlockStage['stageType'], string> = {
  SCHEMATIC_DESIGN: 'Schematic Design',
  LAYOUT_DRC_LVS: 'Layout & DRC/LVS',
  EMX_EXTRACTION: 'EMX / Co-simulation',
  POST_LAYOUT_SIMULATION: 'Post-layout Simulation',
}

const statusLabels: Record<BlockStage['status'], string> = {
  NOT_STARTED: 'Not started',
  IN_PROGRESS: 'In progress',
  DONE: 'Done',
  BLOCKED: 'Blocked',
}

const taskStatusLabels: Record<TaskStatus, string> = {
  BACKLOG: 'Backlog',
  IN_PROGRESS: 'In progress',
  REVIEW: 'Review',
  DONE: 'Done',
}

const roleLabels: Record<User['role'], string> = {
  ADMIN_TEAM_LEAD: 'Admin / Team Lead',
  DESIGN_ENGINEER: 'Design Engineer',
  LAYOUT_ENGINEER: 'Layout Engineer',
}

const stageStatusOptions: Array<BlockStage['status']> = ['NOT_STARTED', 'IN_PROGRESS', 'DONE', 'BLOCKED']
const taskStatusColumns: TaskStatus[] = ['BACKLOG', 'IN_PROGRESS', 'REVIEW', 'DONE']

const defaultTaskForm = {
  title: '',
  description: '',
  blockId: '',
  assigneeId: '',
  roleTag: 'ALL',
  priority: 'MEDIUM',
  status: 'BACKLOG',
  dueAt: '',
  isOpenTask: false,
  emailReminderEnabled: true,
}

function toneForStatus(
  status: BlockStage['status'] | TaskStatus,
): 'neutral' | 'success' | 'warning' | 'danger' | 'info' {
  if (status === 'DONE') {
    return 'success'
  }

  if (status === 'BLOCKED') {
    return 'danger'
  }

  if (status === 'REVIEW') {
    return 'info'
  }

  if (status === 'IN_PROGRESS') {
    return 'warning'
  }

  return 'neutral'
}

function formatDate(value?: string | null) {
  if (!value) {
    return 'Open task'
  }

  return new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

function App() {
  const [data, setData] = useState<BootstrapData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [taskView, setTaskView] = useState<'board' | 'list'>('board')
  const [selectedBlock, setSelectedBlock] = useState('ALL')
  const [selectedRole, setSelectedRole] = useState<'ANY' | Task['roleTag']>('ANY')
  const [selectedAssignee, setSelectedAssignee] = useState('ALL')
  const [taskForm, setTaskForm] = useState(defaultTaskForm)
  const [blockForm, setBlockForm] = useState({ name: '', description: '' })
  const [registrationForm, setRegistrationForm] = useState({
    name: '',
    email: '',
    role: 'DESIGN_ENGINEER' as User['role'],
  })
  const [message, setMessage] = useState<string | null>(null)

  async function refreshData() {
    setLoading(true)
    setError(null)

    try {
      setData(await api.getBootstrap())
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to load workflow data.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void refreshData()
  }, [])

  const approvedUsers = useMemo(
    () => data?.users.filter((user) => user.approvalStatus === 'APPROVED') ?? [],
    [data],
  )

  const filteredTasks = useMemo(() => {
    return (data?.tasks ?? []).filter((task) => {
      const blockMatches =
        selectedBlock === 'ALL' || String(task.blockId || 'UNASSIGNED') === selectedBlock
      const roleMatches = selectedRole === 'ANY' || task.roleTag === selectedRole
      const assigneeMatches =
        selectedAssignee === 'ALL' || String(task.assigneeId || 'UNASSIGNED') === selectedAssignee

      return blockMatches && roleMatches && assigneeMatches
    })
  }, [data, selectedAssignee, selectedBlock, selectedRole])

  const filteredBlocks = useMemo(() => {
    if (selectedBlock === 'ALL') {
      return data?.blocks ?? []
    }

    return (data?.blocks ?? []).filter((block) => String(block.id) === selectedBlock)
  }, [data, selectedBlock])

  async function handleRegister(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setMessage(null)
    await api.registerUser(registrationForm)
    setRegistrationForm({ name: '', email: '', role: 'DESIGN_ENGINEER' })
    setMessage('Registration submitted for admin approval.')
    await refreshData()
  }

  async function handleApproval(userId: number, approvalStatus: User['approvalStatus']) {
    setMessage(null)
    await api.updateUserApproval(userId, approvalStatus)
    setMessage(`User ${approvalStatus.toLowerCase().replace('_', ' ')}.`)
    await refreshData()
  }

  async function handleCreateBlock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setMessage(null)
    await api.createBlock(blockForm)
    setBlockForm({ name: '', description: '' })
    setMessage('New PLL block created.')
    await refreshData()
  }

  async function handleStageUpdate(stageId: number, payload: Record<string, unknown>) {
    setMessage(null)
    await api.updateStage(stageId, payload)
    setMessage('Block stage updated.')
    await refreshData()
  }

  async function handleCreateTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setMessage(null)
    await api.createTask({
      ...taskForm,
      blockId: taskForm.blockId || null,
      assigneeId: taskForm.assigneeId || null,
      dueAt: taskForm.isOpenTask ? null : taskForm.dueAt,
    })
    setTaskForm(defaultTaskForm)
    setMessage('Task created.')
    await refreshData()
  }

  async function updateTaskStatus(taskId: number, status: TaskStatus) {
    setMessage(null)
    await api.updateTask(taskId, { status })
    setMessage('Task status updated.')
    await refreshData()
  }

  async function handleRunReminders() {
    setMessage(null)
    const summary = await api.runReminders()
    setMessage(
      `Notification sweep complete: ${summary.remindersSent} reminders, ${summary.overdueWarningsSent} overdue warnings, ${summary.skipped} skipped.`,
    )
    await refreshData()
  }

  if (loading) {
    return <div className="p-8 text-center text-slate-500">Loading PLL workflow dashboard…</div>
  }

  if (error || !data) {
    return (
      <div className="p-8 text-center">
        <p className="mb-4 text-rose-600">{error || 'Unable to load workflow data.'}</p>
        <Button onClick={() => void refreshData()}>Retry</Button>
      </div>
    )
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <Card className="overflow-hidden bg-slate-950 text-white">
          <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
            <div className="space-y-4">
              <Badge tone="info" className="bg-white/10 text-cyan-100">
                Analog IC / PLL Design Workflow
              </Badge>
              <div className="space-y-2">
                <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                  Task & workflow management for mixed design and layout execution
                </h1>
                <p className="max-w-3xl text-sm text-slate-300 sm:text-base">
                  Coordinate block readiness, stage ownership, simulation closure, and action-item
                  tracking for a compact 7–8 person PLL team.
                </p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <StatCard
                icon={<Blocks className="h-5 w-5" />}
                label="Blocks tracked"
                value={String(data.dashboard.totals.blocks)}
              />
              <StatCard
                icon={<ClipboardList className="h-5 w-5" />}
                label="Active tasks"
                value={String(data.dashboard.totals.tasks)}
              />
              <StatCard
                icon={<CalendarClock className="h-5 w-5" />}
                label="Overdue"
                value={String(data.dashboard.totals.overdueTasks)}
              />
              <StatCard
                icon={<ShieldCheck className="h-5 w-5" />}
                label="Pending approvals"
                value={String(data.dashboard.totals.pendingApprovals)}
              />
            </div>
          </div>
        </Card>

        {message ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            {message}
          </div>
        ) : null}

        <div className="grid gap-4 xl:grid-cols-[2fr_1fr]">
          <Card>
            <div className="mb-4 flex items-center gap-2">
              <Filter className="h-5 w-5 text-slate-500" />
              <div>
                <h2 className="text-lg font-semibold">Filters & analytics</h2>
                <p className="text-sm text-slate-500">
                  Slice the workflow by block, role, and assignee across all views.
                </p>
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <FilterField
                label="Block"
                value={selectedBlock}
                onChange={setSelectedBlock}
                options={[
                  { value: 'ALL', label: 'All blocks' },
                  ...data.blocks.map((block) => ({ value: String(block.id), label: block.name })),
                ]}
              />
              <FilterField
                label="Role tag"
                value={selectedRole}
                onChange={(value) => setSelectedRole(value as 'ANY' | Task['roleTag'])}
                options={[
                  { value: 'ANY', label: 'All roles' },
                  { value: 'DESIGN', label: 'Design' },
                  { value: 'LAYOUT', label: 'Layout' },
                  { value: 'ALL', label: 'Shared tasks' },
                ]}
              />
              <FilterField
                label="Assignee"
                value={selectedAssignee}
                onChange={setSelectedAssignee}
                options={[
                  { value: 'ALL', label: 'Everyone' },
                  ...approvedUsers.map((user) => ({ value: String(user.id), label: user.name })),
                ]}
              />
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-3">
              <MetricCard
                label="Average block completion"
                value={`${data.dashboard.totals.averageBlockCompletion}%`}
                helper="Across schematic, layout, EMX, and post-layout stages"
              />
              <MetricCard
                label="Approved team members"
                value={String(data.dashboard.totals.approvedUsers)}
                helper="Members who can immediately own tasks and stages"
              />
              <MetricCard
                label="Pending simulations"
                value={String(data.dashboard.pendingSimulations.length)}
                helper="EMX and post-layout items not yet marked done"
              />
            </div>
          </Card>

          <Card>
            <div className="mb-4 flex items-center gap-2">
              <BellRing className="h-5 w-5 text-slate-500" />
              <div>
                <h2 className="text-lg font-semibold">Notifications</h2>
                <p className="text-sm text-slate-500">Trigger reminder and overdue scans on demand.</p>
              </div>
            </div>
            <Button className="mb-4 w-full" onClick={() => void handleRunReminders()}>
              Run deadline notification sweep
            </Button>
            <div className="space-y-3">
              {data.dashboard.recentNotifications.length === 0 ? (
                <p className="text-sm text-slate-500">No notification history yet.</p>
              ) : (
                data.dashboard.recentNotifications.map((notification) => (
                  <div
                    key={notification.id}
                    className="rounded-2xl border border-slate-200 px-3 py-3 text-sm"
                  >
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <Badge tone={notification.deliveryStatus === 'FAILED' ? 'danger' : 'success'}>
                        {notification.notificationType.replace('_', ' ')}
                      </Badge>
                      <span className="text-xs text-slate-500">
                        {formatDate(notification.scheduledFor)}
                      </span>
                    </div>
                    <p className="font-medium text-slate-700">{notification.recipientEmail}</p>
                    <p className="mt-1 text-xs text-slate-500">{notification.message}</p>
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>

        <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
          <Card className="overflow-hidden">
            <SectionHeader
              icon={<LayoutGrid className="h-5 w-5 text-slate-500" />}
              title="PLL block progress tracker"
              description="Review sub-block readiness across schematic, layout, EMX, and top-level simulation stages."
            />
            <div className="overflow-x-auto">
              <table className="min-w-full border-separate border-spacing-y-3 text-left">
                <thead>
                  <tr className="text-xs uppercase tracking-wide text-slate-500">
                    <th className="pb-2 pr-3">Block</th>
                    {Object.entries(stageLabels).map(([stageType, label]) => (
                      <th key={stageType} className="pb-2 pr-3">
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredBlocks.map((block) => (
                    <tr key={block.id}>
                      <td className="align-top">
                        <div className="min-w-48 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                          <p className="font-semibold text-slate-900">{block.name}</p>
                          <p className="mt-1 text-sm text-slate-500">{block.description}</p>
                        </div>
                      </td>
                      {Object.keys(stageLabels).map((stageType) => {
                        const stage = block.stages.find((item) => item.stageType === stageType)

                        if (!stage) {
                          return <td key={`${block.id}-${stageType}`} />
                        }

                        return (
                          <td key={stage.id} className="align-top">
                            <div className="min-w-60 rounded-2xl border border-slate-200 bg-white p-4">
                              <div className="mb-3 flex items-center justify-between gap-2">
                                <Badge tone={toneForStatus(stage.status)}>{statusLabels[stage.status]}</Badge>
                                <span className="text-xs font-medium text-slate-500">{stage.progress}%</span>
                              </div>
                              <ProgressBar value={stage.progress} />
                              <div className="mt-3 grid gap-3">
                                <label className="text-sm">
                                  <span className="mb-1 block text-slate-500">Owner</span>
                                  <select
                                    className="w-full rounded-xl border border-slate-200 px-3 py-2"
                                    value={stage.assignedUserId || ''}
                                    onChange={(event) =>
                                      void handleStageUpdate(stage.id, {
                                        assignedUserId: event.target.value || null,
                                      })
                                    }
                                  >
                                    <option value="">Unassigned</option>
                                    {approvedUsers.map((user) => (
                                      <option key={user.id} value={user.id}>
                                        {user.name}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                                <label className="text-sm">
                                  <span className="mb-1 block text-slate-500">Stage status</span>
                                  <select
                                    className="w-full rounded-xl border border-slate-200 px-3 py-2"
                                    value={stage.status}
                                    onChange={(event) =>
                                      void handleStageUpdate(stage.id, { status: event.target.value })
                                    }
                                  >
                                    {stageStatusOptions.map((status) => (
                                      <option key={status} value={status}>
                                        {statusLabels[status]}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                                <label className="text-sm">
                                  <span className="mb-1 block text-slate-500">Progress</span>
                                  <input
                                    className="w-full accent-cyan-600"
                                    type="range"
                                    min="0"
                                    max="100"
                                    value={stage.progress}
                                    onChange={(event) =>
                                      void handleStageUpdate(stage.id, { progress: Number(event.target.value) })
                                    }
                                  />
                                </label>
                                <p className="text-xs text-slate-500">{stage.notes || 'No notes added yet.'}</p>
                              </div>
                            </div>
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <div className="grid gap-4">
            <Card>
              <SectionHeader
                icon={<Blocks className="h-5 w-5 text-slate-500" />}
                title="Create block"
                description="Add a new PLL sub-block with all four tracked execution stages."
              />
              <form className="grid gap-3" onSubmit={(event) => void handleCreateBlock(event)}>
                <input
                  className="rounded-2xl border border-slate-200 px-4 py-3"
                  placeholder="Block name"
                  value={blockForm.name}
                  onChange={(event) => setBlockForm((current) => ({ ...current, name: event.target.value }))}
                />
                <textarea
                  className="min-h-24 rounded-2xl border border-slate-200 px-4 py-3"
                  placeholder="Short description"
                  value={blockForm.description}
                  onChange={(event) =>
                    setBlockForm((current) => ({ ...current, description: event.target.value }))
                  }
                />
                <Button type="submit">Add block</Button>
              </form>
            </Card>

            <Card>
              <SectionHeader
                icon={<UserPlus className="h-5 w-5 text-slate-500" />}
                title="Registration & approval"
                description="Capture new team members as pending until the team lead approves them."
              />
              <form className="grid gap-3" onSubmit={(event) => void handleRegister(event)}>
                <input
                  className="rounded-2xl border border-slate-200 px-4 py-3"
                  placeholder="Full name"
                  value={registrationForm.name}
                  onChange={(event) =>
                    setRegistrationForm((current) => ({ ...current, name: event.target.value }))
                  }
                />
                <input
                  className="rounded-2xl border border-slate-200 px-4 py-3"
                  placeholder="Email"
                  type="email"
                  value={registrationForm.email}
                  onChange={(event) =>
                    setRegistrationForm((current) => ({ ...current, email: event.target.value }))
                  }
                />
                <select
                  className="rounded-2xl border border-slate-200 px-4 py-3"
                  value={registrationForm.role}
                  onChange={(event) =>
                    setRegistrationForm((current) => ({
                      ...current,
                      role: event.target.value as User['role'],
                    }))
                  }
                >
                  {Object.entries(roleLabels).map(([role, label]) => (
                    <option key={role} value={role}>
                      {label}
                    </option>
                  ))}
                </select>
                <Button type="submit">Submit for approval</Button>
              </form>

              <div className="mt-4 space-y-3">
                {data.pendingApprovals.map((user) => (
                  <div key={user.id} className="rounded-2xl border border-slate-200 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium text-slate-900">{user.name}</p>
                        <p className="text-sm text-slate-500">{user.email}</p>
                        <p className="mt-1 text-xs text-slate-500">{roleLabels[user.role]}</p>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          className="px-3 py-1.5"
                          onClick={() => void handleApproval(user.id, 'APPROVED')}
                        >
                          Approve
                        </Button>
                        <Button
                          className="px-3 py-1.5"
                          tone="secondary"
                          onClick={() => void handleApproval(user.id, 'REJECTED')}
                        >
                          Reject
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-[1.55fr_1fr]">
          <Card>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <SectionHeader
                icon={<ClipboardList className="h-5 w-5 text-slate-500" />}
                title="Task board & list view"
                description="Track action items from backlog to review and closure with deadline awareness."
              />
              <div className="inline-flex rounded-2xl border border-slate-200 bg-slate-50 p-1">
                <Button
                  tone={taskView === 'board' ? 'primary' : 'ghost'}
                  className="px-3 py-2"
                  onClick={() => setTaskView('board')}
                >
                  Board
                </Button>
                <Button
                  tone={taskView === 'list' ? 'primary' : 'ghost'}
                  className="px-3 py-2"
                  onClick={() => setTaskView('list')}
                >
                  List
                </Button>
              </div>
            </div>

            {taskView === 'board' ? (
              <div className="grid gap-4 xl:grid-cols-4">
                {taskStatusColumns.map((status) => (
                  <div key={status} className="rounded-3xl bg-slate-50 p-4">
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <h3 className="font-semibold text-slate-900">{taskStatusLabels[status]}</h3>
                      <Badge>{filteredTasks.filter((task) => task.status === status).length}</Badge>
                    </div>
                    <div className="space-y-3">
                      {filteredTasks
                        .filter((task) => task.status === status)
                        .map((task) => (
                          <div key={task.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                            <div className="mb-2 flex items-center justify-between gap-2">
                              <Badge tone={toneForStatus(task.status)}>{taskStatusLabels[task.status]}</Badge>
                              <Badge tone={task.priority === 'CRITICAL' ? 'danger' : 'neutral'}>
                                {task.priority}
                              </Badge>
                            </div>
                            <p className="font-semibold text-slate-900">{task.title}</p>
                            <p className="mt-2 text-sm text-slate-500">{task.description}</p>
                            <dl className="mt-3 space-y-1 text-xs text-slate-500">
                              <div className="flex justify-between gap-2">
                                <dt>Block</dt>
                                <dd>{task.block?.name || 'General'}</dd>
                              </div>
                              <div className="flex justify-between gap-2">
                                <dt>Assignee</dt>
                                <dd>{task.assignee?.name || 'Unassigned'}</dd>
                              </div>
                              <div className="flex justify-between gap-2">
                                <dt>Due</dt>
                                <dd>{formatDate(task.dueAt)}</dd>
                              </div>
                            </dl>
                            <select
                              className="mt-3 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                              value={task.status}
                              onChange={(event) => void updateTaskStatus(task.id, event.target.value as TaskStatus)}
                            >
                              {taskStatusColumns.map((option) => (
                                <option key={option} value={option}>
                                  {taskStatusLabels[option]}
                                </option>
                              ))}
                            </select>
                          </div>
                        ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-left">
                  <thead className="text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="border-b border-slate-200 px-3 py-3">Title</th>
                      <th className="border-b border-slate-200 px-3 py-3">Block</th>
                      <th className="border-b border-slate-200 px-3 py-3">Assignee</th>
                      <th className="border-b border-slate-200 px-3 py-3">Priority</th>
                      <th className="border-b border-slate-200 px-3 py-3">Due</th>
                      <th className="border-b border-slate-200 px-3 py-3">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTasks.map((task) => (
                      <tr key={task.id} className="text-sm">
                        <td className="border-b border-slate-100 px-3 py-3">
                          <p className="font-medium text-slate-900">{task.title}</p>
                          <p className="text-slate-500">{task.description}</p>
                        </td>
                        <td className="border-b border-slate-100 px-3 py-3">{task.block?.name || 'General'}</td>
                        <td className="border-b border-slate-100 px-3 py-3">{task.assignee?.name || 'Unassigned'}</td>
                        <td className="border-b border-slate-100 px-3 py-3">
                          <Badge tone={task.priority === 'CRITICAL' ? 'danger' : 'neutral'}>
                            {task.priority}
                          </Badge>
                        </td>
                        <td className="border-b border-slate-100 px-3 py-3">{formatDate(task.dueAt)}</td>
                        <td className="border-b border-slate-100 px-3 py-3">
                          <select
                            className="w-full rounded-xl border border-slate-200 px-3 py-2"
                            value={task.status}
                            onChange={(event) => void updateTaskStatus(task.id, event.target.value as TaskStatus)}
                          >
                            {taskStatusColumns.map((option) => (
                              <option key={option} value={option}>
                                {taskStatusLabels[option]}
                              </option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <div className="grid gap-4">
            <Card>
              <SectionHeader
                icon={<MailCheck className="h-5 w-5 text-slate-500" />}
                title="Create task"
                description="Create deadline-based work items or open tasks without a due date."
              />
              <form className="grid gap-3" onSubmit={(event) => void handleCreateTask(event)}>
                <input
                  className="rounded-2xl border border-slate-200 px-4 py-3"
                  placeholder="Task title"
                  value={taskForm.title}
                  onChange={(event) => setTaskForm((current) => ({ ...current, title: event.target.value }))}
                />
                <textarea
                  className="min-h-24 rounded-2xl border border-slate-200 px-4 py-3"
                  placeholder="Task description"
                  value={taskForm.description}
                  onChange={(event) =>
                    setTaskForm((current) => ({ ...current, description: event.target.value }))
                  }
                />
                <div className="grid gap-3 sm:grid-cols-2">
                  <select
                    className="rounded-2xl border border-slate-200 px-4 py-3"
                    value={taskForm.blockId}
                    onChange={(event) => setTaskForm((current) => ({ ...current, blockId: event.target.value }))}
                  >
                    <option value="">General / no block</option>
                    {data.blocks.map((block) => (
                      <option key={block.id} value={block.id}>
                        {block.name}
                      </option>
                    ))}
                  </select>
                  <select
                    className="rounded-2xl border border-slate-200 px-4 py-3"
                    value={taskForm.assigneeId}
                    onChange={(event) =>
                      setTaskForm((current) => ({ ...current, assigneeId: event.target.value }))
                    }
                  >
                    <option value="">Unassigned</option>
                    {approvedUsers.map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.name}
                      </option>
                    ))}
                  </select>
                  <select
                    className="rounded-2xl border border-slate-200 px-4 py-3"
                    value={taskForm.roleTag}
                    onChange={(event) => setTaskForm((current) => ({ ...current, roleTag: event.target.value }))}
                  >
                    <option value="DESIGN">Design</option>
                    <option value="LAYOUT">Layout</option>
                    <option value="ALL">All</option>
                  </select>
                  <select
                    className="rounded-2xl border border-slate-200 px-4 py-3"
                    value={taskForm.priority}
                    onChange={(event) => setTaskForm((current) => ({ ...current, priority: event.target.value }))}
                  >
                    <option value="LOW">Low</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="HIGH">High</option>
                    <option value="CRITICAL">Critical</option>
                  </select>
                  <select
                    className="rounded-2xl border border-slate-200 px-4 py-3"
                    value={taskForm.status}
                    onChange={(event) => setTaskForm((current) => ({ ...current, status: event.target.value }))}
                  >
                    {taskStatusColumns.map((status) => (
                      <option key={status} value={status}>
                        {taskStatusLabels[status]}
                      </option>
                    ))}
                  </select>
                  <input
                    className="rounded-2xl border border-slate-200 px-4 py-3"
                    type="datetime-local"
                    disabled={taskForm.isOpenTask}
                    value={taskForm.dueAt}
                    onChange={(event) => setTaskForm((current) => ({ ...current, dueAt: event.target.value }))}
                  />
                </div>
                <label className="flex items-center gap-2 text-sm text-slate-600">
                  <input
                    type="checkbox"
                    checked={taskForm.isOpenTask}
                    onChange={(event) =>
                      setTaskForm((current) => ({
                        ...current,
                        isOpenTask: event.target.checked,
                        dueAt: event.target.checked ? '' : current.dueAt,
                        emailReminderEnabled: event.target.checked ? false : current.emailReminderEnabled,
                      }))
                    }
                  />
                  Open task (no deadline)
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-600">
                  <input
                    type="checkbox"
                    checked={taskForm.emailReminderEnabled}
                    disabled={taskForm.isOpenTask}
                    onChange={(event) =>
                      setTaskForm((current) => ({
                        ...current,
                        emailReminderEnabled: event.target.checked,
                      }))
                    }
                  />
                  Send reminder 24 hours before due date
                </label>
                <Button type="submit">Create task</Button>
              </form>
            </Card>

            <Card>
              <SectionHeader
                icon={<CheckCircle2 className="h-5 w-5 text-slate-500" />}
                title="Upcoming deadlines"
                description="Keep the team focused on near-term signoff and simulation work."
              />
              <div className="space-y-3">
                {data.dashboard.upcomingDeadlines.map((task) => (
                  <div key={task.id} className="rounded-2xl border border-slate-200 p-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <p className="font-medium text-slate-900">{task.title}</p>
                      <Badge tone={toneForStatus(task.status)}>{taskStatusLabels[task.status]}</Badge>
                    </div>
                    <p className="text-sm text-slate-500">
                      {task.block?.name || 'General'} · {task.assignee?.name || 'Unassigned'}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">{formatDate(task.dueAt)}</p>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </div>
      </div>
    </main>
  )
}

function FilterField({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  options: Array<{ value: string; label: string }>
}) {
  return (
    <label className="text-sm">
      <span className="mb-1 block text-slate-500">{label}</span>
      <select
        className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((option) => (
          <option key={`${label}-${option.value}`} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  )
}

function StatCard({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-3xl bg-white/5 p-4 ring-1 ring-white/10">
      <div className="mb-3 inline-flex rounded-2xl bg-white/10 p-2 text-cyan-200">{icon}</div>
      <p className="text-2xl font-semibold">{value}</p>
      <p className="text-sm text-slate-300">{label}</p>
    </div>
  )
}

function MetricCard({ label, value, helper }: { label: string; value: string; helper: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-slate-900">{value}</p>
      <p className="mt-1 text-xs text-slate-500">{helper}</p>
    </div>
  )
}

function SectionHeader({
  icon,
  title,
  description,
}: {
  icon: ReactNode
  title: string
  description: string
}) {
  return (
    <div className="mb-4 flex items-start gap-3">
      <div className="rounded-2xl bg-slate-100 p-2">{icon}</div>
      <div>
        <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
        <p className="text-sm text-slate-500">{description}</p>
      </div>
    </div>
  )
}

export default App
