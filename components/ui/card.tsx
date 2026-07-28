/*
 * PBC Quote Calculator — 카드/섹션 라벨 프리미티브
 * Claude Design handoff(components.jsx)의 Card / SectionLabel 이식.
 */
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from 'react'

type ButtonVariant = 'primary' | 'ghost' | 'danger' | 'soft'
type ButtonSize = 'md' | 'sm'

export function buttonClassName({
  variant = 'ghost',
  size = 'md',
  full = false,
  className = '',
}: {
  variant?: ButtonVariant
  size?: ButtonSize
  full?: boolean
  className?: string
} = {}) {
  return [
    'pbc-btn',
    `pbc-btn--${variant}`,
    size === 'sm' ? 'pbc-btn--sm' : '',
    full ? 'pbc-btn--full' : '',
    className,
  ].filter(Boolean).join(' ')
}

export function panelClassName({
  tone = 'soft',
  className = '',
}: {
  tone?: 'soft' | 'inline'
  className?: string
} = {}) {
  return [tone === 'inline' ? 'pbc-inlinepanel' : 'pbc-softpanel', className].filter(Boolean).join(' ')
}

export function Card({
  children,
  className = '',
  pad = true,
}: {
  children: ReactNode
  className?: string
  pad?: boolean
}) {
  return <section className={`pbc-card ${pad ? 'pbc-card--pad' : ''} ${className}`}>{children}</section>
}

export function Button({
  children,
  variant = 'ghost',
  size = 'md',
  full = false,
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant
  size?: ButtonSize
  full?: boolean
}) {
  return (
    <button {...props} className={buttonClassName({ variant, size, full, className })}>
      {children}
    </button>
  )
}

export function Input({ className = '', ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={['pbc-input', className].filter(Boolean).join(' ')} />
}

export function Textarea({ className = '', ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={['pbc-textarea', className].filter(Boolean).join(' ')} />
}

type AlertTone = 'danger' | 'warning' | 'success'

/**
 * 상태 피드백 알림. tone에 따라 ARIA를 자동 부여한다:
 * danger → role="alert"(즉시 낭독), warning/success → role="status" aria-live="polite".
 * 항상 렌더되는 정적 안내문에는 live={false}를 줘 페이지 로드 시 낭독을 막는다.
 */
export function Alert({
  tone,
  live = true,
  stack = false,
  className = '',
  children,
}: {
  tone: AlertTone
  live?: boolean
  stack?: boolean
  className?: string
  children: ReactNode
}) {
  const aria = !live
    ? {}
    : tone === 'danger'
      ? { role: 'alert' as const }
      : { role: 'status' as const, 'aria-live': 'polite' as const }

  return (
    <div
      {...aria}
      className={['pbc-alert', `pbc-alert--${tone}`, stack ? 'pbc-alert--stack' : '', className]
        .filter(Boolean)
        .join(' ')}
    >
      {children}
    </div>
  )
}

export function SectionLabel({
  icon,
  children,
  aside,
}: {
  icon?: ReactNode
  children: ReactNode
  aside?: ReactNode
}) {
  return (
    <div className="pbc-seclabel">
      <span className="pbc-seclabel__title">
        {icon ? <span className="pbc-seclabel__icon">{icon}</span> : null}
        {children}
      </span>
      {aside ? <span className="pbc-seclabel__aside">{aside}</span> : null}
    </div>
  )
}
