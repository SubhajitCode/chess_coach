import type { ReactNode } from 'react'

export interface BadgeProps {
  children: ReactNode
  variant?: 'emerald' | 'blue' | 'purple' | 'red' | 'yellow' | 'gray'
  className?: string
}

const BADGE_STYLES: Record<string, string> = {
  emerald: 'bg-emerald-950/60 border-emerald-700/60 text-emerald-300',
  blue: 'bg-blue-950/60 border-blue-700/60 text-blue-300',
  purple: 'bg-purple-950/60 border-purple-700/60 text-purple-300',
  red: 'bg-red-950/60 border-red-700/60 text-red-300',
  yellow: 'bg-yellow-950/60 border-yellow-700/60 text-yellow-300',
  gray: 'bg-gray-800 border-gray-700 text-gray-300',
}

export default function Badge({
  children,
  variant = 'gray',
  className = '',
}: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${BADGE_STYLES[variant]} ${className}`}
    >
      {children}
    </span>
  )
}
