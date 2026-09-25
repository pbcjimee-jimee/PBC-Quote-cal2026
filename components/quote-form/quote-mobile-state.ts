import type { AreaScope } from './types'

export type QuoteWorkspaceSection = 'details' | 'work' | 'public' | 'review'
export type QuoteInputSection = Exclude<QuoteWorkspaceSection, 'review'>
export type MaterialScopeView = AreaScope | 'unassigned'

export interface QuoteUiTarget {
  section: QuoteWorkspaceSection
  field: string
  entityId?: string
  optionId?: string
  scope?: MaterialScopeView
}

export interface QuoteFormIssue extends QuoteUiTarget { message: string }

export interface QuoteMobileState {
  activeSection: QuoteInputSection
  activeMainScope: MaterialScopeView
  editingMainMaterialId: string | null
  editingPublicLineId: string | null
  expandedOptionId: string | null
  expandedOptionIds: string[]
  optionScopes: Record<string, MaterialScopeView>
  editingOptionMaterial: { optionId: string; materialId: string } | null
  focusTarget: QuoteUiTarget | null
}

export function createQuoteMobileState(isEdit: boolean): QuoteMobileState {
  return {
    activeSection: isEdit ? 'work' : 'details', activeMainScope: 'interior',
    editingMainMaterialId: null, editingPublicLineId: null,
    expandedOptionId: null, expandedOptionIds: [], optionScopes: {}, editingOptionMaterial: null, focusTarget: null,
  }
}

export function revealQuoteUiTarget(state: QuoteMobileState, target: QuoteUiTarget): QuoteMobileState {
  const next: QuoteMobileState = {
    ...state,
    activeSection: target.section === 'review' ? state.activeSection : target.section,
    focusTarget: target,
  }
  if (target.section === 'public') next.editingPublicLineId = target.entityId ?? null
  if (target.section === 'work') {
    if (target.optionId) {
      next.expandedOptionId = target.optionId
      next.expandedOptionIds = state.expandedOptionIds.includes(target.optionId)
        ? state.expandedOptionIds
        : [...state.expandedOptionIds, target.optionId]
      if (target.scope) next.optionScopes = { ...state.optionScopes, [target.optionId]: target.scope }
      if (target.entityId) next.editingOptionMaterial = { optionId: target.optionId, materialId: target.entityId }
    } else {
      if (target.scope) next.activeMainScope = target.scope
      next.editingMainMaterialId = target.entityId ?? null
    }
  }
  return next
}

export function getQuoteErrorKey(target: QuoteUiTarget): string {
  return target.section === 'work'
    ? `work:${target.optionId ?? 'main'}:${target.entityId ?? 'form'}:${target.field}`
    : `${target.section}:${target.entityId ?? 'form'}:${target.field}`
}
