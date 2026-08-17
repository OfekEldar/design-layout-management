export type UserRole = 'ADMIN_TEAM_LEAD' | 'DESIGN_ENGINEER' | 'LAYOUT_ENGINEER'
export type ApprovalStatus = 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED'
export type StageType =
  | 'SCHEMATIC_DESIGN'
  | 'LAYOUT_DRC_LVS'
  | 'EMX_EXTRACTION'
  | 'POST_LAYOUT_SIMULATION'
export type StageStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'DONE' | 'BLOCKED'
export type TaskRoleTag = 'DESIGN' | 'LAYOUT' | 'ALL'
export type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
export type TaskStatus = 'BACKLOG' | 'IN_PROGRESS' | 'REVIEW' | 'DONE'

export interface User {
  id: number
  name: string
  email: string
  role: UserRole
  approvalStatus: ApprovalStatus
}

export interface BlockStage {
  id: number
  stageType: StageType
  status: StageStatus
  progress: number
  notes?: string | null
  assignedUserId?: number | null
  assignedUser?: User | null
}

export interface Block {
  id: number
  name: string
  description: string
  stages: BlockStage[]
}

export interface Task {
  id: number
  title: string
  description: string
  blockId?: number | null
  assigneeId?: number | null
  roleTag: TaskRoleTag
  priority: TaskPriority
  status: TaskStatus
  dueAt?: string | null
  isOpenTask: boolean
  emailReminderEnabled: boolean
  assignee?: User | null
  block?: Pick<Block, 'id' | 'name'> | null
}

export interface NotificationLog {
  id: number
  recipientEmail: string
  notificationType: 'REMINDER' | 'OVERDUE_WARNING'
  deliveryStatus: 'PENDING' | 'SENT' | 'SKIPPED' | 'FAILED'
  scheduledFor: string
  sentAt?: string | null
  message: string
}

export interface DashboardData {
  totals: {
    blocks: number
    tasks: number
    overdueTasks: number
    pendingApprovals: number
    approvedUsers: number
    averageBlockCompletion: number
  }
  blockProgress: Array<{
    id: number
    name: string
    description: string
    completionPercentage: number
  }>
  upcomingDeadlines: Task[]
  pendingSimulations: Array<{
    blockName: string
    stageType: StageType
    progress: number
    status: StageStatus
    assignee: string
  }>
  recentNotifications: NotificationLog[]
}

export interface BootstrapData {
  users: User[]
  blocks: Block[]
  tasks: Task[]
  pendingApprovals: User[]
  dashboard: DashboardData
}
