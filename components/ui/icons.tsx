/*
 * PBC Quote Calculator — 공통 아이콘
 * Claude Design handoff(components.jsx)의 Icons를 React/TSX로 이식.
 * 16/20 viewBox, currentColor stroke. 색상은 부모의 color를 따른다.
 */
import type { ReactNode } from 'react'

interface IconProps {
  size?: number
  stroke?: number
  fill?: boolean
  className?: string
  children: ReactNode
}

function Icon({ size = 18, stroke = 1.7, fill = false, className = '', children }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      style={{ display: 'block', flexShrink: 0 }}
    >
      <g stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" fill={fill ? 'currentColor' : 'none'}>
        {children}
      </g>
    </svg>
  )
}

export const Icons = {
  overview: (p?: { size?: number }) => (
    <Icon size={p?.size}>
      <path d="M3.2 7.5 10 2.5l6.8 5" />
      <path d="M4.8 6.6v9.4a.8.8 0 0 0 .8.8h2.9v-4.3h3v4.3h2.9a.8.8 0 0 0 .8-.8V6.6" />
    </Icon>
  ),
  quote: (p?: { size?: number }) => (
    <Icon size={p?.size}>
      <rect x="3.2" y="2.6" width="13.6" height="14.8" rx="1.8" />
      <path d="M6.2 6.4h7.6M6.2 9.6h7.6M6.2 12.8h4.6" />
    </Icon>
  ),
  settings: (p?: { size?: number }) => (
    <Icon size={p?.size}>
      <circle cx="10" cy="10" r="2.6" />
      <path d="M10 2.6v1.8M10 15.6v1.8M3.4 10H1.6M18.4 10h-1.8M5.1 5.1 3.9 3.9M16.1 16.1l-1.2-1.2M5.1 14.9l-1.2 1.2M16.1 3.9l-1.2 1.2" />
    </Icon>
  ),
  search: (p?: { size?: number }) => (
    <Icon size={p?.size}>
      <circle cx="9" cy="9" r="6" />
      <path d="m14.5 14.5 3 3" />
    </Icon>
  ),
  plus: (p?: { size?: number }) => (
    <Icon size={p?.size}>
      <path d="M10 4.5v11M4.5 10h11" />
    </Icon>
  ),
  trash: (p?: { size?: number }) => (
    <Icon size={p?.size} stroke={1.5}>
      <path d="M4.5 5.5h11M8 5.5V3.8h4V5.5M6 5.5l.5 10.2a1.3 1.3 0 0 0 1.3 1.2h4.4a1.3 1.3 0 0 0 1.3-1.2L14 5.5" />
    </Icon>
  ),
  check: (p?: { size?: number }) => (
    <Icon size={p?.size}>
      <path d="M4.5 10.5 8.2 14l7.3-8" />
    </Icon>
  ),
  refresh: (p?: { size?: number }) => (
    <Icon size={p?.size}>
      <path d="M16 7.2A6.2 6.2 0 0 0 5.1 5.1L3.5 6.8" />
      <path d="M3.4 3.5v3.4h3.4" />
      <path d="M4 12.8a6.2 6.2 0 0 0 10.9 2.1l1.6-1.7" />
      <path d="M16.6 16.5v-3.4h-3.4" />
    </Icon>
  ),
  arrowDown: (p?: { size?: number }) => (
    <Icon size={p?.size}>
      <path d="M5 8l5 5 5-5" />
    </Icon>
  ),
  layers: (p?: { size?: number }) => (
    <Icon size={p?.size}>
      <path d="M10 3 3 6.5 10 10l7-3.5L10 3Z" />
      <path d="m3 11 7 3.5L17 11" />
    </Icon>
  ),
  user: (p?: { size?: number }) => (
    <Icon size={p?.size}>
      <circle cx="10" cy="7" r="3" />
      <path d="M4.5 16.2a5.5 5.5 0 0 1 11 0" />
    </Icon>
  ),
  signOut: (p?: { size?: number }) => (
    <Icon size={p?.size}>
      <path d="M8.5 4.2H5.7a1.4 1.4 0 0 0-1.4 1.4v8.8a1.4 1.4 0 0 0 1.4 1.4h2.8" />
      <path d="M11.6 6.6 15 10l-3.4 3.4" />
      <path d="M15 10H7.8" />
    </Icon>
  ),
  pin: (p?: { size?: number }) => (
    <Icon size={p?.size}>
      <path d="M10 17s5.2-4.4 5.2-8.4A5.2 5.2 0 0 0 4.8 8.6C4.8 12.6 10 17 10 17Z" />
      <circle cx="10" cy="8.4" r="1.8" />
    </Icon>
  ),
  sparkle: (p?: { size?: number }) => (
    <Icon size={p?.size} stroke={1.4}>
      <path d="M10 3.2c.4 2.7 1.3 3.6 3.9 4.1-2.6.5-3.5 1.4-3.9 4.1-.4-2.7-1.3-3.6-3.9-4.1 2.6-.5 3.5-1.4 3.9-4.1Z" />
    </Icon>
  ),
  dollar: (p?: { size?: number }) => (
    <Icon size={p?.size}>
      <path d="M10 2.8v14.4" />
      <path d="M13.2 5.6H8.4a2.1 2.1 0 0 0 0 4.2h3.2a2.1 2.1 0 0 1 0 4.2H6.4" />
    </Icon>
  ),
  palette: (p?: { size?: number }) => (
    <Icon size={p?.size} stroke={1.5}>
      <path d="M10 2.8a7.2 7.2 0 0 0 0 14.4c1.2 0 1.7-1 1.2-1.9-.6-1 .1-2.1 1.3-2.1h1.1A3.3 3.3 0 0 0 17.2 10 7.2 7.2 0 0 0 10 2.8Z" />
      <circle cx="6.6" cy="9" r=".7" fill="currentColor" />
      <circle cx="9" cy="6.4" r=".7" fill="currentColor" />
      <circle cx="12.4" cy="6.8" r=".7" fill="currentColor" />
    </Icon>
  ),
  template: (p?: { size?: number }) => (
    <Icon size={p?.size}>
      <rect x="3" y="3.2" width="14" height="13.6" rx="1.8" />
      <path d="M3 7.4h14M7 7.4v9.4" />
    </Icon>
  ),
  back: (p?: { size?: number }) => (
    <Icon size={p?.size}>
      <path d="M12 5l-5 5 5 5" />
    </Icon>
  ),
  lock: (p?: { size?: number }) => (
    <Icon size={p?.size}>
      <rect x="4.5" y="9" width="11" height="7.5" rx="1.6" />
      <path d="M7 9V6.8a3 3 0 0 1 6 0V9" />
    </Icon>
  ),
  edit: (p?: { size?: number }) => (
    <Icon size={p?.size}>
      <path d="M13.5 3.8l2.7 2.7L7.4 15.3 4 16l.7-3.4 8.8-8.8Z" />
      <path d="M12.2 5.1l2.7 2.7" />
    </Icon>
  ),
}
