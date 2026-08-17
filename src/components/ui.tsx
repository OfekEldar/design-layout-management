import type { ButtonHTMLAttributes, PropsWithChildren } from 'react'

import { cn } from '../lib/cn'

export function Card({ children, className }: PropsWithChildren<{ className?: string }>) {
  return (
    <section className={cn('rounded-3xl border border-slate-200 bg-white p-5 shadow-sm', className)}>
      {children}
    </section>
  )
}

export function Button({
  children,
  className,
  tone = 'primary',
  type = 'button',
  ...props
}: PropsWithChildren<
  ButtonHTMLAttributes<HTMLButtonElement> & {
    className?: string
    tone?: 'primary' | 'secondary' | 'ghost' | 'danger'
  }
>) {
  return (
    <button
      type={type}
      className={cn(
        'inline-flex items-center justify-center rounded-2xl px-4 py-2 text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
        tone === 'primary' && 'bg-slate-950 text-white hover:bg-slate-800 focus-visible:outline-slate-950',
        tone === 'secondary' &&
          'bg-slate-100 text-slate-700 hover:bg-slate-200 focus-visible:outline-slate-400',
        tone === 'ghost' &&
          'bg-transparent text-slate-600 hover:bg-slate-100 focus-visible:outline-slate-400',
        tone === 'danger' && 'bg-rose-600 text-white hover:bg-rose-500 focus-visible:outline-rose-600',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  )
}

export function Badge({
  children,
  className,
  tone = 'neutral',
}: PropsWithChildren<{ className?: string; tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'info' }>) {
  return (
    <span
      className={cn(
        'inline-flex rounded-full px-3 py-1 text-xs font-semibold',
        tone === 'neutral' && 'bg-slate-100 text-slate-700',
        tone === 'success' && 'bg-emerald-100 text-emerald-700',
        tone === 'warning' && 'bg-amber-100 text-amber-700',
        tone === 'danger' && 'bg-rose-100 text-rose-700',
        tone === 'info' && 'bg-sky-100 text-sky-700',
        className,
      )}
    >
      {children}
    </span>
  )
}

export function ProgressBar({ value }: { value: number }) {
  return (
    <div className="h-2 rounded-full bg-slate-100">
      <div
        className="h-2 rounded-full bg-cyan-500 transition-all"
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  )
}
