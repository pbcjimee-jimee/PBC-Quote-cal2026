import { describe, expect, it } from 'vitest'

import {
  calculateAdjustedContract,
  calculateProgressClaim,
} from '@/lib/progress-invoices/calculation'
import type { ProgressClaimCalculationInput } from '@/lib/progress-invoices/types'
import sampleSeries from './fixtures/progress-invoices/sample-series.json'

const GST_RATE = '0.10' as const

function progressInput(
  overrides: Partial<ProgressClaimCalculationInput> = {},
): ProgressClaimCalculationInput {
  return {
    kind: 'progress',
    inputMode: 'cumulative_percentage',
    authoritativeValue: '50',
    baseContractExGst: '1000.00',
    gstRate: GST_RATE,
    approvedAdjustments: [],
    previousClaims: [],
    ...overrides,
  }
}

describe('calculateAdjustedContract', () => {
  it('adds Variations and subtracts Credits before calculating GST', () => {
    expect(calculateAdjustedContract({
      baseContractExGst: '1000.00',
      gstRate: GST_RATE,
      approvedAdjustments: [
        { id: 'variation', type: 'variation', amountExGst: '100.00' },
        { id: 'credit', type: 'credit', amountExGst: '25.00' },
      ],
    })).toEqual({
      adjustedContractExGst: '1075.00',
      adjustedContractGst: '107.50',
      adjustedContractIncGst: '1182.50',
    })
  })

  it('handles one-cent Variations and Credits with two-decimal outputs', () => {
    expect(calculateAdjustedContract({
      baseContractExGst: '1.00',
      gstRate: GST_RATE,
      approvedAdjustments: [
        { id: 'variation', type: 'variation', amountExGst: '0.01' },
      ],
    })).toEqual({
      adjustedContractExGst: '1.01',
      adjustedContractGst: '0.10',
      adjustedContractIncGst: '1.11',
    })

    expect(calculateAdjustedContract({
      baseContractExGst: '1.00',
      gstRate: GST_RATE,
      approvedAdjustments: [
        { id: 'credit', type: 'credit', amountExGst: '0.01' },
      ],
    })).toEqual({
      adjustedContractExGst: '0.99',
      adjustedContractGst: '0.10',
      adjustedContractIncGst: '1.09',
    })
  })

  it('rejects a non-positive adjusted contract and any GST rate except 0.10', () => {
    expect(() => calculateAdjustedContract({
      baseContractExGst: '0.00',
      gstRate: GST_RATE,
      approvedAdjustments: [],
    })).toThrow(/positive/i)

    expect(() => calculateAdjustedContract({
      baseContractExGst: '100.00',
      gstRate: '0.15' as '0.10',
      approvedAdjustments: [],
    })).toThrow(/0\.10/)
  })

  it('rejects negative or sub-cent currency inputs', () => {
    expect(() => calculateAdjustedContract({
      baseContractExGst: '100.001',
      gstRate: GST_RATE,
      approvedAdjustments: [],
    })).toThrow(/two decimals/i)
    expect(() => calculateAdjustedContract({
      baseContractExGst: '100.00',
      gstRate: GST_RATE,
      approvedAdjustments: [
        { id: 'credit', type: 'credit', amountExGst: '-0.01' },
      ],
    })).toThrow(/non-negative/i)
    expect(() => calculateAdjustedContract({
      baseContractExGst: 'not-a-decimal',
      gstRate: GST_RATE,
      approvedAdjustments: [],
    })).toThrow(/decimal string/i)
    expect(() => calculateAdjustedContract({
      baseContractExGst: '100.00',
      gstRate: 'Infinity' as '0.10',
      approvedAdjustments: [],
    })).toThrow(/decimal string/i)
  })
})

describe('calculateProgressClaim', () => {
  it('uses cumulative percentage as authority and rounds the target before subtraction', () => {
    const p01 = calculateProgressClaim(progressInput({
      inputMode: 'current_claim_amount',
      authoritativeValue: sampleSeries.p01.currentIncGst,
      baseContractExGst: sampleSeries.p02.baseContractExGst,
    }))
    const result = calculateProgressClaim(progressInput({
      authoritativeValue: sampleSeries.p02.cumulativePercentage,
      baseContractExGst: sampleSeries.p02.baseContractExGst,
      approvedAdjustments: [{
        id: '11111111-1111-4111-8111-111111111111',
        type: 'variation',
        amountExGst: sampleSeries.p02.approvedVariationExGst,
      }],
      previousClaims: [{
        claimId: '22222222-2222-4222-8222-222222222222',
        sequence: 1,
        exGst: p01.currentClaimExGst,
        gst: p01.currentClaimGst,
        incGst: sampleSeries.p01.currentIncGst,
      }],
    }))

    expect(result.adjustedContractExGst).toBe(sampleSeries.p02.adjustedExGst)
    expect(result.adjustedContractIncGst).toBe(sampleSeries.p02.adjustedIncGst)
    expect(result.cumulativeTargetIncGst).toBe(sampleSeries.p02.cumulativeTargetIncGst)
    expect(result.currentClaimIncGst).toBe(sampleSeries.p02.currentIncGst)
    expect(result.remainingIncGst).toBe(sampleSeries.p02.remainingIncGst)
    expect(result.cumulativePercentage).toBe('90.000000')
  })

  it('uses the current Inc GST amount as authority without feeding back the derived percentage', () => {
    const amountResult = calculateProgressClaim(progressInput({
      inputMode: 'current_claim_amount',
      authoritativeValue: '366.67',
    }))

    expect(amountResult.currentClaimIncGst).toBe('366.67')
    expect(amountResult.cumulativeTargetIncGst).toBe('366.67')
    expect(amountResult.cumulativePercentage).toBe('33.333636')
  })

  it('switches to amount authority without changing any money values', () => {
    const percentageResult = calculateProgressClaim(progressInput({
      authoritativeValue: '33.333333',
    }))
    const amountResult = calculateProgressClaim(progressInput({
      inputMode: 'current_claim_amount',
      authoritativeValue: percentageResult.currentClaimIncGst,
    }))

    const moneyFields = [
      'adjustedContractExGst',
      'adjustedContractGst',
      'adjustedContractIncGst',
      'previousClaimsExGst',
      'previousClaimsGst',
      'previousClaimsIncGst',
      'cumulativeTargetExGst',
      'cumulativeTargetGst',
      'cumulativeTargetIncGst',
      'currentClaimExGst',
      'currentClaimGst',
      'currentClaimIncGst',
      'remainingExGst',
      'remainingGst',
      'remainingIncGst',
    ] as const

    for (const field of moneyFields) {
      expect(amountResult[field]).toBe(percentageResult[field])
      expect(amountResult[field]).toMatch(/^\d+\.\d{2}$/)
    }
  })

  it('accepts zero and 100 percent boundaries', () => {
    expect(calculateProgressClaim(progressInput({ authoritativeValue: '0' }))).toMatchObject({
      currentClaimIncGst: '0.00',
      cumulativePercentage: '0.000000',
      remainingIncGst: '1100.00',
    })
    expect(calculateProgressClaim(progressInput({ authoritativeValue: '100' }))).toMatchObject({
      currentClaimIncGst: '1100.00',
      cumulativePercentage: '100.000000',
      remainingIncGst: '0.00',
    })
  })

  it('rejects percentages outside the boundaries and claims over the contract', () => {
    expect(() => calculateProgressClaim(progressInput({ authoritativeValue: '-0.000001' })))
      .toThrow(/percentage/i)
    expect(() => calculateProgressClaim(progressInput({ authoritativeValue: '100.000001' })))
      .toThrow(/percentage/i)
    expect(() => calculateProgressClaim(progressInput({
      inputMode: 'current_claim_amount',
      authoritativeValue: '1100.01',
    }))).toThrow(/remaining|exceed/i)
    expect(() => calculateProgressClaim(progressInput({
      authoritativeValue: '10',
      previousClaims: [{
        claimId: 'prior',
        sequence: 1,
        exGst: '200.00',
        gst: '20.00',
        incGst: '220.00',
      }],
    }))).toThrow(/previous|negative/i)
  })

  it('splits a normal current claim by rounded Ex GST and residual GST', () => {
    expect(calculateProgressClaim(progressInput({
      inputMode: 'current_claim_amount',
      authoritativeValue: '0.05',
    }))).toMatchObject({
      currentClaimExGst: '0.05',
      currentClaimGst: '0.00',
      currentClaimIncGst: '0.05',
    })
  })

  it('uses independent Ex GST and GST residuals for FINAL', () => {
    const p01 = calculateProgressClaim(progressInput({
      inputMode: 'current_claim_amount',
      authoritativeValue: sampleSeries.p01.currentIncGst,
      baseContractExGst: sampleSeries.p02.baseContractExGst,
    }))
    const p02 = calculateProgressClaim(progressInput({
      authoritativeValue: sampleSeries.p02.cumulativePercentage,
      baseContractExGst: sampleSeries.p02.baseContractExGst,
      approvedAdjustments: [{
        id: '11111111-1111-4111-8111-111111111111',
        type: 'variation',
        amountExGst: sampleSeries.p02.approvedVariationExGst,
      }],
      previousClaims: [{
        claimId: '33333333-3333-4333-8333-333333333333',
        sequence: 1,
        exGst: p01.currentClaimExGst,
        gst: p01.currentClaimGst,
        incGst: p01.currentClaimIncGst,
      }],
    }))
    const result = calculateProgressClaim(progressInput({
      kind: 'final',
      inputMode: 'current_claim_amount',
      authoritativeValue: sampleSeries.final.currentIncGst,
      baseContractExGst: sampleSeries.final.adjustedExGst,
      previousClaims: [
        {
          claimId: '33333333-3333-4333-8333-333333333333',
          sequence: 1,
          exGst: p01.currentClaimExGst,
          gst: p01.currentClaimGst,
          incGst: sampleSeries.p01.currentIncGst,
        },
        {
          claimId: '44444444-4444-4444-8444-444444444444',
          sequence: 2,
          exGst: p02.currentClaimExGst,
          gst: p02.currentClaimGst,
          incGst: sampleSeries.p02.currentIncGst,
        },
      ],
    }))

    expect(result.adjustedContractIncGst).toBe(sampleSeries.final.adjustedIncGst)
    expect(result.currentClaimExGst).toBe(sampleSeries.final.currentExGst)
    expect(result.currentClaimGst).toBe(sampleSeries.final.currentGst)
    expect(result.currentClaimIncGst).toBe(sampleSeries.final.currentIncGst)
    expect(result.cumulativePercentage).toBe('100.000000')
    expect(result.remainingExGst).toBe('0.00')
    expect(result.remainingGst).toBe('0.00')
    expect(result.remainingIncGst).toBe('0.00')
  })

  it('rejects a FINAL that does not consume the exact full residual', () => {
    expect(() => calculateProgressClaim(progressInput({
      kind: 'final',
      inputMode: 'current_claim_amount',
      authoritativeValue: '1099.99',
    }))).toThrow(/final|residual/i)
    expect(() => calculateProgressClaim(progressInput({
      kind: 'final',
      authoritativeValue: '99.99',
    }))).toThrow(/final|100/i)
  })

  it('rejects unreconciled, over-contract, and fully consumed predecessor claims', () => {
    expect(() => calculateProgressClaim(progressInput({
      previousClaims: [{
        claimId: 'unreconciled',
        sequence: 1,
        exGst: '10.00',
        gst: '1.00',
        incGst: '10.99',
      }],
    }))).toThrow(/reconcile/i)

    expect(() => calculateProgressClaim(progressInput({
      previousClaims: [{
        claimId: 'over-contract',
        sequence: 1,
        exGst: '1000.01',
        gst: '100.00',
        incGst: '1100.01',
      }],
    }))).toThrow(/exceed/i)

    expect(() => calculateProgressClaim(progressInput({
      kind: 'final',
      inputMode: 'current_claim_amount',
      authoritativeValue: '0.00',
      previousClaims: [{
        claimId: 'fully-claimed',
        sequence: 1,
        exGst: '1000.00',
        gst: '100.00',
        incGst: '1100.00',
      }],
    }))).toThrow(/positive residual/i)
  })
})
