'use server'

import { z } from 'zod'
import { safeErrorMessage } from '@/lib/actions/action-error'
import { isDevNoAuthMode, type ActionResult } from '@/lib/actions/types'
import type { KnowledgeStats } from '@/lib/ai-quote/knowledge-stats'
import { requireRole } from '@/lib/security/require-app-user'
import { createClient } from '@/lib/supabase/server'
import type { Database } from '@/lib/supabase/types'

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
