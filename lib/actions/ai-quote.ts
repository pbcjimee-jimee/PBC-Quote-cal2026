'use server'

import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import { safeErrorMessage } from '@/lib/actions/action-error'
import { isDevNoAuthMode, type ActionResult } from '@/lib/actions/types'
import type { KnowledgeStats } from '@/lib/ai-quote/knowledge-stats'
import { requireRole } from '@/lib/security/require-app-user'
import { createClient } from '@/lib/supabase/server'
import type { Database } from '@/lib/supabase/types'
import { AI_QUOTE_LIMITS } from '@/lib/ai-quote/config'
import { loadEvalCandidates, loadEvalCases, loadEvalCase } from '@/lib/ai-quote/data'
import { detectEvalMemoLeaks } from '@/lib/ai-quote/eval-memo'
import type { AiDraftComparison } from '@/lib/ai-quote/eval-metrics'
import { selectEvalQuotes } from '@/lib/ai-quote/eval-select'
import { redactContactDetails } from '@/lib/ai-quote/pii'

export interface AiKnowledgeRecord {
  id: string
  version: number
  status: 'draft' | 'active' | 'archived'
  styleGuide: string
  pricingGuide: string
  stats: KnowledgeStats
  sourceCounts: { quotes: number; publicLines: number; items: number }
  createdAt: string
  approvedAt: string | null
}

const knowledgeIdSchema = z.object({ id: z.string().uuid() })
const knowledgeDraftSchema = knowledgeIdSchema.extend({
  styleGuide: z.string().trim().min(1).max(40000),
  pricingGuide: z.string().trim().min(1).max(40000),
})
const KNOWLEDGE_COLUMNS = 'id, version, status, style_guide, pricing_guide, stats, source_counts, created_at, approved_at'

type KnowledgeRow = Pick<Database['public']['Tables']['ai_quote_knowledge']['Row'],
  'id' | 'version' | 'status' | 'style_guide' | 'pricing_guide' | 'stats' | 'source_counts' | 'created_at' | 'approved_at'
>

function toKnowledge(row: KnowledgeRow): AiKnowledgeRecord {
  return {
    id: row.id, version: row.version, status: row.status,
    styleGuide: row.style_guide, pricingGuide: row.pricing_guide,
    stats: row.stats as unknown as KnowledgeStats,
    sourceCounts: row.source_counts as AiKnowledgeRecord['sourceCounts'],
    createdAt: row.created_at, approvedAt: row.approved_at,
  }
}

export async function listAiQuoteKnowledge(): Promise<ActionResult<AiKnowledgeRecord[]>> {
  if (isDevNoAuthMode()) return { ok: false, code: 'AUTH_REQUIRED', error: 'AI knowledge requires authentication.' }
  try {
    const auth = await requireRole('admin')
    if (!auth.ok) return auth
    const supabase = await createClient()
    const { data, error } = await supabase.from('ai_quote_knowledge').select(KNOWLEDGE_COLUMNS)
      .order('version', { ascending: false }).limit(10)
    if (error) return { ok: false, error: safeErrorMessage(error, 'ai.knowledge.list', 'Unable to load AI guides. Please try again.') }
    return { ok: true, data: (data ?? []).map(toKnowledge) }
  } catch (error) {
    return { ok: false, error: safeErrorMessage(error, 'ai.knowledge.list', 'Unable to load AI guides. Please try again.') }
  }
}

export async function updateAiQuoteKnowledgeDraft(input: unknown): Promise<ActionResult<AiKnowledgeRecord>> {
  const parsed = knowledgeDraftSchema.safeParse(input)
  if (!parsed.success) return { ok: false, code: 'VALIDATION', error: 'Enter a valid guide ID and guides between 1 and 40,000 characters.' }
  if (isDevNoAuthMode()) return { ok: false, code: 'AUTH_REQUIRED', error: 'AI knowledge requires authentication.' }
  try {
    const auth = await requireRole('admin')
    if (!auth.ok) return auth
    const supabase = await createClient()
    const { data, error } = await supabase.from('ai_quote_knowledge').update({
      style_guide: parsed.data.styleGuide, pricing_guide: parsed.data.pricingGuide, updated_at: new Date().toISOString(),
    }).eq('id', parsed.data.id).eq('status', 'draft').select(KNOWLEDGE_COLUMNS).maybeSingle()
    if (error) return { ok: false, error: safeErrorMessage(error, 'ai.knowledge.update', 'Unable to save this guide. Please try again.') }
    if (!data) return { ok: false, code: 'VALIDATION', error: 'Only draft guides can be edited.' }
    return { ok: true, data: toKnowledge(data) }
  } catch (error) {
    return { ok: false, error: safeErrorMessage(error, 'ai.knowledge.update', 'Unable to save this guide. Please try again.') }
  }
}

export async function activateAiQuoteKnowledge(input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = knowledgeIdSchema.safeParse(input)
  if (!parsed.success) return { ok: false, code: 'VALIDATION', error: 'Enter a valid guide ID.' }
  if (isDevNoAuthMode()) return { ok: false, code: 'AUTH_REQUIRED', error: 'AI knowledge requires authentication.' }
  try {
    const auth = await requireRole('admin')
    if (!auth.ok) return auth
    const supabase = await createClient()
    const { data, error } = await supabase.rpc('activate_ai_quote_knowledge', { p_id: parsed.data.id })
    if (error) return { ok: false, error: safeErrorMessage(error, 'ai.knowledge.activate', 'Unable to approve this guide. Please try again.') }
    return { ok: true, data: { id: data } }
  } catch (error) {
    return { ok: false, error: safeErrorMessage(error, 'ai.knowledge.activate', 'Unable to approve this guide. Please try again.') }
  }
}

export interface AiEvalCaseRecord {
  id: string
  quoteId: string
  quoteLabel: string
  memo: string
  leaks: string[]
  lastMetrics: AiDraftComparison | null
}

const evalSetSchema = z.object({ setLabel: z.string().trim().min(1).max(60) })
const evalMemoSchema = knowledgeIdSchema.extend({ memo: z.string().trim().min(1).max(8000) })

async function evalClient() {
  if (isDevNoAuthMode()) return { ok: false, code: 'AUTH_REQUIRED', error: 'Accuracy checks require authentication.' } as const
  const auth = await requireRole('admin')
  if (!auth.ok) return auth
  return { ok: true, data: await createClient() } as const
}

async function loadEvalQuoteDetails(supabase: SupabaseClient<Database>, quoteIds: string[]) {
  if (!quoteIds.length) return new Map<string, { quoteLabel: string; productNames: string[] }>()
  const { data, error } = await supabase.from('quotes')
    .select('id, work_type, quote_number:jobber_snapshot->>quoteNumber, quote_items(product_name_snapshot)')
    .is('deleted_at', null).in('id', quoteIds)
  if (error) throw error
  type Row = { id: string; work_type: string | null; quote_number: string | null; quote_items: Array<{ product_name_snapshot: string }> }
  return new Map(((data ?? []) as unknown as Row[]).map(row => {
    const number = row.quote_number?.trim().replace(/^#/, '') ?? ''
    const quoteLabel = [/^\d{1,20}$/.test(number) ? `#${number}` : 'Quote', redactContactDetails(row.work_type ?? '')].filter(Boolean).join(' · ')
    return [row.id, { quoteLabel, productNames: row.quote_items.map(item => item.product_name_snapshot) }]
  }))
}

export async function proposeEvalSet(input: unknown): Promise<ActionResult<{
  setLabel: string; quoteIds: string[]; quotes: Array<{ quoteId: string; quoteLabel: string }>
}>> {
  const parsed = evalSetSchema.safeParse(input)
  if (!parsed.success) return { ok: false, code: 'VALIDATION', error: 'Enter a sample set name between 1 and 60 characters.' }
  try {
    const client = await evalClient()
    if (!client.ok) return client
    const quoteIds = selectEvalQuotes(await loadEvalCandidates(client.data), AI_QUOTE_LIMITS.evalSetSize)
    const details = await loadEvalQuoteDetails(client.data, quoteIds)
    const quotes = quoteIds.flatMap(quoteId => {
      const quote = details.get(quoteId)
      return quote ? [{ quoteId, quoteLabel: quote.quoteLabel }] : []
    })
    return { ok: true, data: { setLabel: parsed.data.setLabel, quoteIds: quotes.map(quote => quote.quoteId), quotes } }
  } catch (error) {
    return { ok: false, error: safeErrorMessage(error, 'ai.eval.propose', 'Unable to suggest sample quotes. Please try again.') }
  }
}

export async function listEvalCases(input: unknown): Promise<ActionResult<AiEvalCaseRecord[]>> {
  const parsed = evalSetSchema.safeParse(input)
  if (!parsed.success) return { ok: false, code: 'VALIDATION', error: 'Enter a sample set name between 1 and 60 characters.' }
  try {
    const client = await evalClient()
    if (!client.ok) return client
    const cases = await loadEvalCases(client.data, parsed.data.setLabel)
    const details = await loadEvalQuoteDetails(client.data, cases.map(record => record.quote_id))
    return { ok: true, data: cases.flatMap(record => {
      const quote = details.get(record.quote_id)
      if (!quote) return []
      const memo = redactContactDetails(record.memo)
      return [{ id: record.id, quoteId: record.quote_id, quoteLabel: quote.quoteLabel, memo,
        leaks: detectEvalMemoLeaks(memo, quote.productNames), lastMetrics: record.last_metrics as unknown as AiDraftComparison | null }]
    }) }
  } catch (error) {
    return { ok: false, error: safeErrorMessage(error, 'ai.eval.list', 'Unable to load sample quotes. Please try again.') }
  }
}

export async function updateEvalCaseMemo(input: unknown): Promise<ActionResult<{ id: string; memo: string; leaks: string[] }>> {
  const parsed = evalMemoSchema.safeParse(input)
  if (!parsed.success) return { ok: false, code: 'VALIDATION', error: 'Enter valid sample notes between 1 and 8,000 characters.' }
  try {
    const client = await evalClient()
    if (!client.ok) return client
    const record = await loadEvalCase(client.data, parsed.data.id)
    if (!record) return { ok: false, code: 'VALIDATION', error: 'This sample is no longer available.' }
    const details = await loadEvalQuoteDetails(client.data, [record.quote_id])
    const memo = redactContactDetails(parsed.data.memo)
    const leaks = detectEvalMemoLeaks(memo, details.get(record.quote_id)?.productNames ?? [])
    const { data, error } = await client.data.from('ai_quote_eval_cases').update({ memo, last_metrics: null,
      last_draft_run_id: null, updated_at: new Date().toISOString() }).eq('id', parsed.data.id).select('id').maybeSingle()
    if (error) throw error
    if (!data) return { ok: false, code: 'VALIDATION', error: 'This sample is no longer available.' }
    return { ok: true, data: { id: parsed.data.id, memo, leaks } }
  } catch (error) {
    return { ok: false, error: safeErrorMessage(error, 'ai.eval.update', 'Unable to save sample notes. Please try again.') }
  }
}

export async function removeEvalCase(input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = knowledgeIdSchema.safeParse(input)
  if (!parsed.success) return { ok: false, code: 'VALIDATION', error: 'Choose a valid sample quote.' }
  try {
    const client = await evalClient()
    if (!client.ok) return client
    const { error } = await client.data.from('ai_quote_eval_cases').delete().eq('id', parsed.data.id)
    if (error) throw error
    return { ok: true, data: { id: parsed.data.id } }
  } catch (error) {
    return { ok: false, error: safeErrorMessage(error, 'ai.eval.remove', 'Unable to remove this sample. Please try again.') }
  }
}
