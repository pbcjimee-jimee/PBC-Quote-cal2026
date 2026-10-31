import type { AiPhotoFinding } from '@/lib/ai-quote/types'

export function validatePhotoFindings(raw: unknown, photoCount: number): AiPhotoFinding[] {
  if (!Array.isArray(raw)) return []
  const findings: AiPhotoFinding[] = []
  for (const value of raw) {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) continue
    const { area, kind, issue, suggestedTreatment, photoRefs, confidence } = value as Record<string, unknown>
    if (typeof area !== 'string' || typeof issue !== 'string' || typeof suggestedTreatment !== 'string'
      || (kind !== 'problem' && kind !== 'access')
      || (confidence !== 'low' && confidence !== 'medium' && confidence !== 'high')
      || !Array.isArray(photoRefs)) continue
    const refs = photoRefs.filter((ref): ref is number =>
      typeof ref === 'number' && Number.isInteger(ref) && ref >= 1 && ref <= photoCount)
    if (!refs.length) continue
    findings.push({ area: area.slice(0, 80), kind, issue: issue.slice(0, 300),
      suggestedTreatment: suggestedTreatment.slice(0, 300), photoRefs: refs, confidence })
    if (findings.length === 40) break
  }
  return findings
}
