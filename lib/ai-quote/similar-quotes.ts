import Decimal from 'decimal.js'
import { normalizeAreaKey } from '@/lib/ai-quote/knowledge-stats'

export interface SimilarQuoteCandidate {
  id: string
  workType: string
  customerType: string
  areaKeys: string[]
  lineNames: string[]
  createdAt: string
}

export interface SimilarQuoteQuery {
  workType: string
  customerType: string
  memo: string
  existingLineNames: string[]
}

function jaccard(left: Set<string>, right: Set<string>): Decimal {
  const union = new Set([...left, ...right])
  if (!union.size) return new Decimal(0)
  const intersection = [...left].filter(value => right.has(value)).length
  return new Decimal(intersection).div(union.size)
}

function lineTokens(names: string[]): Set<string> {
  return new Set(names.flatMap(name => name.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []))
}

export function rankSimilarQuotes(
  query: SimilarQuoteQuery,
  candidates: SimilarQuoteCandidate[],
  limit = 4,
): Array<{ id: string; score: number }> {
  const candidateAreas = candidates.map(candidate => new Set(candidate.areaKeys.map(normalizeAreaKey).filter(Boolean)))
  const knownAreas = new Set(candidateAreas.flatMap(areas => [...areas]))
  const queryAreas = new Set([query.memo, ...query.existingLineNames]
    .flatMap(text => text.split(/[,\.\r\n]+/))
    .map(normalizeAreaKey)
    .filter(key => knownAreas.has(key)))
  const queryTokens = lineTokens(query.existingLineNames)
  const workType = query.workType.trim().toLowerCase()
  const customerType = query.customerType.trim().toLowerCase()

  return candidates.map((candidate, index) => {
    const workMatch = workType !== '' && workType === candidate.workType.trim().toLowerCase()
    const customerMatch = customerType !== '' && customerType === candidate.customerType.trim().toLowerCase()
    const score = jaccard(candidateAreas[index], queryAreas).mul(5)
      .add(jaccard(lineTokens(candidate.lineNames), queryTokens).mul(2))
      .add(workMatch ? 3 : 0)
      .add(customerMatch ? 1 : 0)

    return { id: candidate.id, score: score.toNumber(), createdAt: candidate.createdAt }
  })
    .filter(candidate => candidate.score > 0)
    .sort((a, b) => b.score - a.score
      || Date.parse(b.createdAt) - Date.parse(a.createdAt)
      || a.id.localeCompare(b.id))
    .slice(0, Math.max(0, Math.trunc(limit)))
    .map(({ id, score }) => ({ id, score }))
}
