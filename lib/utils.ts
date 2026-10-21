import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import Decimal from 'decimal.js'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatNumber(value: Decimal | number | string, decimals = 2): string {
  const d = value instanceof Decimal ? value : new Decimal(value)
  return d.toFixed(decimals)
}
