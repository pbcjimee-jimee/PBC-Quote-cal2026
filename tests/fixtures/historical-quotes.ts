import type { CalculatorInput, PricingSettings } from '@/lib/calculator'

// TODO: PBC 과거 실제 견적 3건의 입력·출력으로 교체 필요 (Excel에서 확인)
// Excel 값과 우리 앱이 동일한 결과를 내는지 회귀 검증하는 핵심 안전망

export const HISTORICAL_FIXTURES: Array<{
  name: string
  input: CalculatorInput
  settings: PricingSettings
  expected: {
    formula1: number
    formula2: number
    formula3: number
    formula4: number
    formula5: number
  }
}> = [
  {
    name: 'Sample Quote A — replace with real data',
    input: {
      workingDays: 5,
      labourPerDay: 1,
      materialMarket: 342.50,
      materialActual: 245.00,
    },
    settings: {
      f1LabourRate: 500,
      f2LabourRate: 460,
      f3LabourRate: 460,
      f4LabourRate: 380,
      f5LabourRate: 380,
      roofLabourRate: 700,
      f2Margin: 0.30,
      f3Margin: 0.30,
      f4Margin: 0.25,
      f5Margin: 0.30,
    },
    expected: {
      formula1: 2842.50,   // 500×5 + 342.50
      formula2: 3628.21,
      formula3: 3635.71,
      formula4: 2875.83,
      formula5: 3064.29,
    },
  },
  // TODO: 2번째 실제 견적
  // TODO: 3번째 실제 견적
]
