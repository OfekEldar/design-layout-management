import {
  ApprovalStatus,
  PrismaClient,
  StageStatus,
  StageType,
  TaskPriority,
  TaskRoleTag,
  TaskStatus,
  UserRole,
} from '@prisma/client'

const globalForPrisma = globalThis as typeof globalThis & {
  prisma?: PrismaClient
}

export const prisma = globalForPrisma.prisma ?? new PrismaClient()

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}

const stageBlueprints = [
  {
    stageType: StageType.SCHEMATIC_DESIGN,
    status: StageStatus.DONE,
    progress: 100,
    notes: 'Core topology reviewed and signed off for layout handoff.',
  },
  {
    stageType: StageType.LAYOUT_DRC_LVS,
    status: StageStatus.IN_PROGRESS,
    progress: 65,
    notes: 'Guard-ring placement and density checks in progress.',
  },
  {
    stageType: StageType.EMX_EXTRACTION,
    status: StageStatus.IN_PROGRESS,
    progress: 48,
    notes: 'Critical net extraction is queued after layout delta.',
  },
  {
    stageType: StageType.POST_LAYOUT_SIMULATION,
    status: StageStatus.NOT_STARTED,
    progress: 0,
    notes: 'Monte Carlo and jitter sweep deck is prepared.',
  },
] as const

const blockSeeds = [
  {
    name: 'VCO',
    description: 'Oscillator core, bias tuning, and phase-noise closure.',
  },
  {
    name: 'PFD',
    description: 'Phase frequency detector, reset timing, and dead-zone tuning.',
  },
  {
    name: 'Charge Pump',
    description: 'Current steering, mismatch mitigation, and UP/DN balancing.',
  },
  {
    name: 'Loop Filter',
    description: 'Passive filter sizing and settling optimization.',
  },
  {
    name: 'Frequency Divider',
    description: 'Programmable divider chain and verification collateral.',
  },
  {
    name: 'LDO / Bias',
    description: 'Reference, bias generation, and regulator integration.',
  },
]

export async function ensureSeedData() {
  const userCount = await prisma.user.count()

  if (userCount > 0) {
    return
  }

  const teamLead = await prisma.user.create({
    data: {
      name: 'Maya Levin',
      email: process.env.TEAM_LEAD_EMAIL || 'lead@example.com',
      role: UserRole.ADMIN_TEAM_LEAD,
      approvalStatus: ApprovalStatus.APPROVED,
    },
  })

  const [designA, designB, layoutA, layoutB, pendingUser] = await Promise.all([
    prisma.user.create({
      data: {
        name: 'Arin Shah',
        email: 'arin.shah@example.com',
        role: UserRole.DESIGN_ENGINEER,
        approvalStatus: ApprovalStatus.APPROVED,
      },
    }),
    prisma.user.create({
      data: {
        name: 'Nora Kim',
        email: 'nora.kim@example.com',
        role: UserRole.DESIGN_ENGINEER,
        approvalStatus: ApprovalStatus.APPROVED,
      },
    }),
    prisma.user.create({
      data: {
        name: 'Leo Bar',
        email: 'leo.bar@example.com',
        role: UserRole.LAYOUT_ENGINEER,
        approvalStatus: ApprovalStatus.APPROVED,
      },
    }),
    prisma.user.create({
      data: {
        name: 'Ruth Azulai',
        email: 'ruth.azulai@example.com',
        role: UserRole.LAYOUT_ENGINEER,
        approvalStatus: ApprovalStatus.APPROVED,
      },
    }),
    prisma.user.create({
      data: {
        name: 'Noam Pending',
        email: 'noam.pending@example.com',
        role: UserRole.DESIGN_ENGINEER,
        approvalStatus: ApprovalStatus.PENDING_APPROVAL,
      },
    }),
  ])

  const approvedDesigners = [designA, designB]
  const approvedLayouts = [layoutA, layoutB]

  const blocks = await Promise.all(
    blockSeeds.map((blockSeed, blockIndex) =>
      prisma.block.create({
        data: {
          ...blockSeed,
          stages: {
            create: stageBlueprints.map((stage, stageIndex) => ({
              ...stage,
              assignedUserId:
                stage.stageType === StageType.SCHEMATIC_DESIGN
                  ? approvedDesigners[stageIndex % approvedDesigners.length]?.id
                  : approvedLayouts[(blockIndex + stageIndex) % approvedLayouts.length]?.id,
            })),
          },
        },
      }),
    ),
  )

  const now = Date.now()

  await prisma.task.createMany({
    data: [
      {
        title: 'Close VCO post-layout phase-noise corners',
        description:
          'Run SS/FF corner sweeps and summarize the delta against pre-layout noise targets.',
        blockId: blocks[0]?.id,
        assigneeId: designA.id,
        roleTag: TaskRoleTag.DESIGN,
        priority: TaskPriority.CRITICAL,
        status: TaskStatus.IN_PROGRESS,
        dueAt: new Date(now + 1000 * 60 * 60 * 20),
        emailReminderEnabled: true,
      },
      {
        title: 'Finish PFD layout DRC clean-up',
        description: 'Resolve antenna fixes and rerun signoff deck before review.',
        blockId: blocks[1]?.id,
        assigneeId: layoutA.id,
        roleTag: TaskRoleTag.LAYOUT,
        priority: TaskPriority.HIGH,
        status: TaskStatus.REVIEW,
        dueAt: new Date(now + 1000 * 60 * 60 * 30),
        emailReminderEnabled: true,
      },
      {
        title: 'Prepare loop filter design review slides',
        description: 'Open-ended documentation task for the next architecture sync.',
        blockId: blocks[3]?.id,
        assigneeId: teamLead.id,
        roleTag: TaskRoleTag.ALL,
        priority: TaskPriority.MEDIUM,
        status: TaskStatus.BACKLOG,
        isOpenTask: true,
      },
      {
        title: 'Back-annotate divider extraction results',
        description: 'Integrate EMX parasitics and update lock-time comparison plots.',
        blockId: blocks[4]?.id,
        assigneeId: designB.id,
        roleTag: TaskRoleTag.DESIGN,
        priority: TaskPriority.HIGH,
        status: TaskStatus.IN_PROGRESS,
        dueAt: new Date(now - 1000 * 60 * 60 * 2),
        emailReminderEnabled: true,
      },
      {
        title: 'Review LDO bias guard-ring strategy',
        description: 'Capture action items from the layout review and update constraints.',
        blockId: blocks[5]?.id,
        assigneeId: pendingUser.id,
        roleTag: TaskRoleTag.LAYOUT,
        priority: TaskPriority.LOW,
        status: TaskStatus.BACKLOG,
        dueAt: new Date(now + 1000 * 60 * 60 * 72),
      },
    ],
  })
}
