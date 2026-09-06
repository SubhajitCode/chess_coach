import type { HTMLAttributes, ReactNode } from 'react'

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode
  variant?: 'default' | 'glass' | 'highlight'
}

export default function Card({
  children,
  variant = 'default',
  className = '',
  ...props
}: CardProps) {
  const base = 'rounded-2xl border p-5 shadow-sm'
  const variantClass =
    variant === 'glass'
      ? 'bg-gray-900/70 backdrop-blur border-gray-800'
      : variant === 'highlight'
      ? 'bg-purple-950/20 border-purple-800/40'
      : 'bg-gray-900 border-gray-700'

  return (
    <div className={`${base} ${variantClass} ${className}`} {...props}>
      {children}
    </div>
  )
}
