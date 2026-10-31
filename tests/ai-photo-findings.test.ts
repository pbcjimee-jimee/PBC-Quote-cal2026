import { describe, expect, it } from 'vitest'
import { validatePhotoFindings } from '@/lib/ai-quote/photo-findings'

const finding = {
  area: 'Bedroom', kind: 'problem', issue: 'Cracks', suggestedTreatment: 'Fill and sand',
  photoRefs: [1, 2], confidence: 'medium',
}

describe('validatePhotoFindings', () => {
  it('keeps only integer photo references within the collected photo count', () => {
    expect(validatePhotoFindings([{ ...finding, photoRefs: [0, 2, 31, 1.5, '3', null] }], 30))
      .toEqual([{ ...finding, photoRefs: [2] }])
    expect(validatePhotoFindings([{ ...finding, photoRefs: [1, 2, 3] }], 2))
      .toEqual([finding])
  })

  it.each([{ photoRefs: [] }, { photoRefs: [0, 31] }, { photoRefs: [3] }])('drops findings without valid evidence: %j', ({ photoRefs }) => {
    expect(validatePhotoFindings([{ ...finding, photoRefs }], 2)).toEqual([])
  })

  it.each([null, {}, 'findings', 1])('rejects non-array output: %j', raw => {
    expect(validatePhotoFindings(raw, 30)).toEqual([])
  })

  it.each([null, [], { area: undefined }, { kind: 'other' }, { confidence: 'certain' }, { area: 1 },
    { issue: null }, { suggestedTreatment: [] }, { photoRefs: '1' }])('drops malformed findings: %j', invalid => {
    const raw = invalid !== null && !Array.isArray(invalid) ? { ...finding, ...invalid } : invalid
    expect(validatePhotoFindings([raw], 30)).toEqual([])
  })

  it('accepts access findings and keeps valid neighbours of invalid findings', () => {
    const access = { ...finding, kind: 'access', confidence: 'high' }
    expect(validatePhotoFindings([null, access, { ...finding, kind: 'other' }, finding], 2))
      .toEqual([access, finding])
  })

  it('bounds strings and output count without retaining unexpected fields or mutating input', () => {
    const raw = { ...finding, area: 'a'.repeat(100), issue: 'i'.repeat(400),
      suggestedTreatment: 't'.repeat(400), fileName: 'private address.jpg' }
    const input = Array.from({ length: 45 }, () => raw)
    const result = validatePhotoFindings(input, 30)
    expect(result).toHaveLength(40)
    expect(result[0]).toEqual({ ...finding, area: 'a'.repeat(80), issue: 'i'.repeat(300),
      suggestedTreatment: 't'.repeat(300) })
    expect(raw.area).toHaveLength(100)
    expect(validatePhotoFindings([finding], 0)).toEqual([])
  })
})
