import Decimal from 'decimal.js'
import type { AiScope } from '@/lib/ai-quote/types'

export interface EvalCandidate {
  id: string
  createdAt: string
  scopes: AiScope[]
  itemCount: number
  pricedLineCount: number
  finalTotal: string
}

export function selectEvalQuotes(candidates: EvalCandidate[], size: number): string[] {
  if (!Number.isFinite(size) || size < 1) return []
  const seen = new Set<string>()
  const strata: EvalCandidate[][] = [[], [], [], []]
  for (const candidate of candidates) {
    if (seen.has(candidate.id) || candidate.itemCount < 2 || candidate.pricedLineCount < 1
      || !new Decimal(candidate.finalTotal).gt(0) || !candidate.scopes.length) continue
    seen.add(candidate.id)
    const stratum = candidate.scopes.includes('roof') ? 3
      : candidate.scopes.includes('interior') && candidate.scopes.includes('exterior') ? 2
      : candidate.scopes.includes('exterior') ? 1 : 0
    strata[stratum].push(candidate)
  }
  const groups = strata.filter(group => group.length)
  const total = groups.reduce((sum, group) => sum + group.length, 0)
  const count = Math.min(Math.floor(size), total)
  if (!count) return []
  for (const group of groups) group.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt) || a.id.localeCompare(b.id))
  const targets = groups.map(group => count * group.length / total)
  const allocations: number[] = groups.map(() => count >= groups.length ? 1 : 0)
  let allocated = allocations.reduce((sum, value) => sum + value, 0)
  while (allocated < count) {
    let best = -1
    for (let i = 0; i < groups.length; i++) {
      if (allocations[i] >= groups[i].length) continue
      if (best === -1 || targets[i] - allocations[i] > targets[best] - allocations[best]) best = i
    }
    allocations[best]++
    allocated++
  }
  return groups.flatMap((group, i) => group.slice(0, allocations[i]).map(candidate => candidate.id))
}
