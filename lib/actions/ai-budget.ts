'use server'

import Decimal from 'decimal.js'
import { z } from 'zod'
import { safeErrorMessage } from '@/lib/actions/action-error'
import { isDevNoAuthMode, type ActionResult } from '@/lib/actions/types'
import { getAiMonthlyBudgetStatus, type AiMonthlyBudgetStatus } from '@/lib/ai-quote/budget'
import { requireAiQuoteUser } from '@/lib/ai-quote/access'
import { createClient } from '@/lib/supabase/server'

const budgetSchema = z.object({
  monthlyBudgetUsd: z.number().positive().max(1000).refine(value => new Decimal(value).decimalPlaces() <= 2),
})

export async function getAiBudgetStatus(): Promise<ActionResult<AiMonthlyBudgetStatus>> {
  if (isDevNoAuthMode()) return { ok: false, code: 'AUTH_REQUIRED', error: 'AI budgets require authentication.' }
  try {
    const auth = await requireAiQuoteUser()
    if (!auth.ok) return auth
    return { ok: true, data: await getAiMonthlyBudgetStatus(await createClient()) }
  } catch (error) {
    return { ok: false, error: safeErrorMessage(error, 'ai.budget.load', 'Unable to load the AI budget. Please try again.') }
  }
}

export async function updateAiMonthlyBudget(input: unknown): Promise<ActionResult<AiMonthlyBudgetStatus>> {
  const parsed = budgetSchema.safeParse(input)
  if (!parsed.success) return { ok: false, code: 'VALIDATION', error: 'Enter a monthly limit greater than $0 and up to $1,000, with at most two decimal places.' }
  if (isDevNoAuthMode()) return { ok: false, code: 'AUTH_REQUIRED', error: 'AI budgets require authentication.' }
  try {
    const auth = await requireAiQuoteUser()
    if (!auth.ok) return auth
    const supabase = await createClient()
    const { data, error } = await supabase.from('ai_quote_settings')
      .update({ monthly_budget_usd: new Decimal(parsed.data.monthlyBudgetUsd).toFixed(2) })
      .eq('id', true).select('id').maybeSingle()
    if (error) throw error
    if (!data) return { ok: false, code: 'NOT_FOUND', error: 'AI budget settings are unavailable. Please try again.' }
    return { ok: true, data: await getAiMonthlyBudgetStatus(supabase) }
  } catch (error) {
    return { ok: false, error: safeErrorMessage(error, 'ai.budget.update', 'Unable to save the AI budget. Please try again.') }
  }
}
