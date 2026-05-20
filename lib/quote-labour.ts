import Decimal from 'decimal.js'

function isCompleteDecimalText(value: string): boolean {
  return /^\d+(?:\.\d*)?$/.test(value)
}

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
  if (text === '' || !isCompleteDecimalText(text)) return new Decimal(0)

  return new Decimal(text)
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
  const hasLineLabour = lines.some((line) => line.workingDays != null || line.labourPerDay != null)
  if (!hasLineLabour) return decimalFromInput(workingDays).mul(decimalFromInput(labourPerDay))

  return calculateLabourTotals(lines).labourDays
}

export function calculateDisplayLabourTotals(
  workingDays: Decimal | number | string,
  labourPerDay: Decimal | number | string,
  lines: LabourLineInput[]
): LabourTotals {
  const hasLineLabour = lines.some((line) => line.workingDays != null || line.labourPerDay != null)
  if (!hasLineLabour) {
    const totalWorkingDays = decimalFromInput(workingDays)
    const totalLabour = totalWorkingDays.mul(decimalFromInput(labourPerDay))

    return {
      workingDays: totalWorkingDays,
      labourPerDay: totalLabour,
      labourDays: totalLabour,
    }
  }

  const totals = calculateLabourTotals(lines)

  return {
    workingDays: totals.workingDays,
    labourPerDay: totals.labourDays,
    labourDays: totals.labourDays,
  }
}
