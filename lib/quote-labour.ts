import Decimal from 'decimal.js'

export interface LabourLineInput {
  workingDays?: Decimal | number | string | null
  labourPerDay?: Decimal | number | string | null
}

export interface LabourTotals {
  workingDays: Decimal
  labourPerDay: Decimal
  labourDays: Decimal
}

export function decimalFromInput(value: Decimal | number | string | null | undefined): Decimal {
  if (value instanceof Decimal) return value

  const text = String(value ?? '').trim()
  return new Decimal(text === '' ? 0 : text)
}

export function calculateLabourTotals(lines: LabourLineInput[]): LabourTotals {
  return lines.reduce<LabourTotals>(
    (totals, line) => {
      const workingDays = decimalFromInput(line.workingDays)
      const labourPerDay = decimalFromInput(line.labourPerDay)

      return {
        workingDays: totals.workingDays.add(workingDays),
        labourPerDay: totals.labourPerDay.add(labourPerDay),
        labourDays: totals.labourDays.add(workingDays.mul(labourPerDay)),
      }
    },
    {
      workingDays: new Decimal(0),
      labourPerDay: new Decimal(0),
      labourDays: new Decimal(0),
    }
  )
}

export function calculateFormulaLabourDays(
  workingDays: Decimal | number | string,
  labourPerDay: Decimal | number | string,
  lines: LabourLineInput[]
): Decimal {
  const hasLineLabour = lines.some((line) => line.workingDays !== undefined || line.labourPerDay !== undefined)
  if (!hasLineLabour) return decimalFromInput(workingDays).mul(decimalFromInput(labourPerDay))

  return calculateLabourTotals(lines).labourDays
}
