import 'server-only'

import Decimal from 'decimal.js'
import type { SupabaseClient } from '@supabase/supabase-js'
import { AI_QUOTE_LIMITS } from '@/lib/ai-quote/config'
import type { Database } from '@/lib/supabase/types'

export interface AiMonthlyBudgetStatus {
  budgetUsd: string
  spentUsd: string
  remainingUsd: string
  reached: boolean
  monthStart: string
}

function sydneyMonthStart(): string {
  const formatter = new Intl.DateTimeFormat('en-AU', {
    timeZone: 'Australia/Sydney', year: 'numeric', month: 'numeric', timeZoneName: 'shortOffset',
  })
  const parts = formatter.formatToParts(new Date())
  const year = Number(parts.find(part => part.type === 'year')!.value)
  const month = Number(parts.find(part => part.type === 'month')!.value)
  const midnight = Date.UTC(year, month - 1, 1)
  // Resolve the offset at the month's start, which can differ from today's offset.
  const offset = formatter.formatToParts(new Date(midnight)).find(part => part.type === 'timeZoneName')!.value
  const hours = Number(offset.replace('GMT', ''))
  return new Date(midnight - hours * 60 * 60 * 1000).toISOString()
}

export async function getAiMonthlyBudgetStatus(supabase: SupabaseClient<Database>): Promise<AiMonthlyBudgetStatus> {
  const monthStart = sydneyMonthStart()
  const { data: settings, error } = await supabase.from('ai_quote_settings')
    .select('monthly_budget_usd').eq('id', true).maybeSingle()
  if (error) throw error
  const budget = new Decimal(settings?.monthly_budget_usd ?? AI_QUOTE_LIMITS.monthlyBudgetUsdDefault)
  let spent = new Decimal(0)
  for (let start = 0; ; start += 1000) {
    const { data, error: usageError } = await supabase.from('ai_quote_runs').select('cost_usd')
      .gte('created_at', monthStart).order('id').range(start, start + 999)
    if (usageError) throw usageError
    for (const row of data ?? []) spent = spent.add(row.cost_usd)
    if (!data || data.length < 1000) break
  }
  return {
    budgetUsd: budget.toFixed(2), spentUsd: spent.toFixed(2),
    remainingUsd: Decimal.max(0, budget.minus(spent)).toFixed(2), reached: spent.gte(budget), monthStart,
  }
}
