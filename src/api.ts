import type { Block, BlockStage, BootstrapData, Task, User } from './types'

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || ''

async function request<T>(path: string, init?: RequestInit) {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
    ...init,
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed.' }))
    throw new Error(error.error || 'Request failed.')
  }

  if (response.status === 204) {
    return undefined as T
  }

  return (await response.json()) as T
}

export const api = {
  getBootstrap() {
    return request<BootstrapData>('/api/bootstrap')
  },
  registerUser(payload: { name: string; email: string; role: User['role'] }) {
    return request<User>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },
  updateUserApproval(userId: number, approvalStatus: User['approvalStatus']) {
    return request<User>(`/api/users/${userId}/approval`, {
      method: 'PATCH',
      body: JSON.stringify({ approvalStatus }),
    })
  },
  createBlock(payload: { name: string; description: string }) {
    return request<Block>('/api/blocks', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },
  updateStage(stageId: number, payload: Partial<Pick<BlockStage, 'status' | 'progress' | 'notes'>> & {
    assignedUserId?: number | null
  }) {
    return request<BlockStage>(`/api/block-stages/${stageId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    })
  },
  createTask(payload: Record<string, unknown>) {
    return request<Task>('/api/tasks', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },
  updateTask(taskId: number, payload: Record<string, unknown>) {
    return request<Task>(`/api/tasks/${taskId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    })
  },
  runReminders() {
    return request<{ remindersSent: number; overdueWarningsSent: number; skipped: number }>(
      '/api/notifications/run-reminders',
      {
        method: 'POST',
      },
    )
  },
}
