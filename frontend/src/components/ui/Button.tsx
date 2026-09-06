import type { ButtonHTMLAttributes, ReactNode } from 'react'

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'danger' | 'ghost'
export type ButtonSize = 'sm' | 'md' | 'lg'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
  icon?: ReactNode
}

const VARIANT_STYLES: Record<ButtonVariant, string> = {
  primary: 'bg-blue-600 hover:bg-blue-500 text-white border-transparent shadow',
  secondary: 'bg-gray-800 hover:bg-gray-700 text-gray-200 border-gray-700',
  outline: 'bg-transparent hover:bg-gray-800 text-gray-300 border-gray-600',
  danger: 'bg-red-900/40 hover:bg-red-800/60 text-red-300 border-red-700',
  ghost: 'bg-transparent hover:bg-gray-800/50 text-gray-400 hover:text-white border-transparent',
}

const SIZE_STYLES: Record<ButtonSize, string> = {
  sm: 'px-2.5 py-1 text-xs',
  md: 'px-4 py-2 text-sm',
  lg: 'px-6 py-3 text-base',
}

export default function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  icon,
  children,
  className = '',
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center gap-2 rounded-xl font-semibold border transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${VARIANT_STYLES[variant]} ${SIZE_STYLES[size]} ${className}`}
      {...props}
    >
      {loading && <span className="animate-spin text-sm">⟳</span>}
      {!loading && icon && <span>{icon}</span>}
      {children}
    </button>
  )
}
