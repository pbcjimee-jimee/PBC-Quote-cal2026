import Decimal from 'decimal.js'
import Link from 'next/link'
import type { ReactNode } from 'react'
import type { QuoteRecord } from '@/lib/dev-data'
import { JobberQuoteSummary } from '@/components/quote-form/customer-panel'
import { FinalSummary } from '@/components/quote-form/final-summary'
import { OptionTotalsSummary } from '@/components/quote-form/option-totals-summary'
import { calculateAreaSubtotalBreakdown } from '@/components/quote-form/quote-calculation-totals'
import type { AreaSubtotalGroup } from '@/components/quote-form/quote-calculation-totals'
import { mapSavedItemsToMaterials } from '@/components/quote-form/quote-record-mappers'
import type { AreaScope } from '@/components/quote-form/types'
import { QuoteDeleteButton } from '@/components/quote-list/quote-delete-button'
import { QuoteDuplicateButton } from '@/components/quote-list/quote-duplicate-button'
import { Card, SectionLabel } from '@/components/ui/card'
import { Icons } from '@/components/ui/icons'
import { retryJobberQuoteSync } from '@/lib/actions/quotes'
import { AREA_SCOPE_LABELS } from '@/lib/areas/constants'

interface QuoteDetailViewProps {
  quote: QuoteRecord
}

const DETAIL_PREVIEW_LIMIT = 8

function itemMaterialTotal(quote: QuoteRecord): Decimal {
  return quote.items.reduce(
    (total, item) => total.add(new Decimal(item.marketPriceSnapshot).mul(item.quantity)),
    new Decimal(0)
  )
}

function jobberLineTotal(line: QuoteRecord['jobberQuoteLines'][number]): string | null {
  if (line.totalPrice) return new Decimal(line.totalPrice).toFixed(2)
  if (!line.quantity || !line.unitPrice) return null
  return new Decimal(line.quantity).mul(line.unitPrice).toFixed(2)
}

function quoteLineItemsTotal(lines: QuoteRecord['jobberQuoteLines']): Decimal {
  return lines.reduce((total, line) => {
    const lineTotal = jobberLineTotal(line)
    return lineTotal ? total.add(lineTotal) : total
  }, new Decimal(0))
}

function formatQuoteDate(value: string): string {
  return new Intl.DateTimeFormat('en-AU', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value))
}

function formatQuoteDateTime(value: string): string {
  return new Intl.DateTimeFormat('en-AU', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function DRow({ label, mono, children }: { label: string; mono?: boolean; children: React.ReactNode }) {
  return (
    <div className="pbc-drow">
      <dt>{label}</dt>
      <dd className={mono ? 'mono' : ''}>{children}</dd>
    </div>
  )
}

function DetailMore({ count, children }: { count: number; children: ReactNode }) {
  if (count <= 0) return null

  return (
    <details className="pbc-detailmore">
      <summary>Show remaining {count} rows</summary>
      <div className="pbc-detailmore__body">
        {children}
      </div>
    </details>
  )
}

function JobberLineDetail({ line }: { line: QuoteRecord['jobberQuoteLines'][number] }) {
  const total = jobberLineTotal(line)

  return (
    <div className="pbc-dline" key={line.id}>
      <div className="min-w-0">
        <span className="pbc-dline__name">
          {line.name}
          <span className={`pbc-titem__tag ${line.kind === 'text' ? 'pbc-titem__tag--text' : ''}`}>
            {line.kind === 'text' ? 'TEXT' : 'LINE'}
          </span>
        </span>
        {line.description ? <p className="pbc-dline__desc">{line.description}</p> : null}
      </div>
      <div className="pbc-dline__price mono">
        {line.kind === 'line_item' && total ? (
          <>
            <span>{line.quantity ?? '1'} x ${line.unitPrice ?? '0.00'}</span>
            <b>${total}</b>
          </>
        ) : (
          <i>Description only</i>
        )}
      </div>
    </div>
  )
}

function PriceRevisionDetail({ revision }: { revision: QuoteRecord['priceRevisions'][number] }) {
  const actor = revision.changedByName ?? revision.changedByEmail ?? 'Unknown user'
  const eventLabel = revision.eventType === 'created' ? 'Created' : 'Updated'
  const delta = revision.previousSubtotal
    ? new Decimal(revision.newSubtotal).sub(revision.previousSubtotal)
    : null
  const optionsDelta = revision.previousOptionsSubtotal && revision.newOptionsSubtotal
    ? new Decimal(revision.newOptionsSubtotal).sub(revision.previousOptionsSubtotal)
    : null
  const hasOptionsTotal = revision.newOptionsSubtotal !== null || revision.previousOptionsSubtotal !== null

  return (
    <div className="pbc-dline">
      <div className="min-w-0">
        <span className="pbc-dline__name">
          Revision {revision.revisionNumber}
          <span className={`pbc-titem__tag ${revision.eventType === 'updated' ? 'pbc-titem__tag--text' : ''}`}>
            {eventLabel}
          </span>
        </span>
        <p className="pbc-dline__desc">
          {actor} - {formatQuoteDateTime(revision.changedAt)}
        </p>
      </div>
      <div className="pbc-dline__price mono">
        {revision.previousSubtotal ? (
          <>
            <span>{`Main quote $${revision.previousSubtotal} -> $${revision.newSubtotal}`}</span>
            <b>{delta && delta.gte(0) ? '+' : ''}${delta?.toFixed(2)}</b>
          </>
        ) : (
          <>
            <span>Main quote initial amount</span>
            <b>${revision.newSubtotal}</b>
          </>
        )}
        {hasOptionsTotal ? (
          revision.previousOptionsSubtotal && revision.newOptionsSubtotal ? (
            <>
              <span>{`Options $${revision.previousOptionsSubtotal} -> $${revision.newOptionsSubtotal}`}</span>
              <b>{optionsDelta && optionsDelta.gte(0) ? '+' : ''}${optionsDelta?.toFixed(2)}</b>
            </>
          ) : (
            <>
              <span>Options initial amount</span>
              <b>${revision.newOptionsSubtotal ?? revision.previousOptionsSubtotal}</b>
            </>
          )
        ) : null}
      </div>
    </div>
  )
}

function MaterialDetail({ item }: { item: QuoteRecord['items'][number] }) {
  return (
    <div className="pbc-dmat" key={item.id}>
      <span className="pbc-swatch pbc-swatch--sm" data-base={item.productNameSnapshot} />
      <span className="pbc-dmat__main">
        <span className="pbc-dmat__name">{item.productNameSnapshot}</span>
        <span className="pbc-dmat__meta">
          {item.areaNameSnapshot ?? 'No area'}
          {item.workingDays && item.labourPerDay ? ` - ${item.workingDays} days x ${item.labourPerDay} labour` : ''}
        </span>
      </span>
      <span className="pbc-dmat__qty mono">{item.quantity} x ${item.marketPriceSnapshot}</span>
      <span className="pbc-dmat__line mono">${new Decimal(item.marketPriceSnapshot).mul(item.quantity).toFixed(2)}</span>
    </div>
  )
}

function JobberSyncFailurePanel({ quote }: { quote: QuoteRecord }) {
  async function retryJobberSync() {
    'use server'
    await retryJobberQuoteSync(quote.id)
  }

  if (quote.jobberSyncStatus !== 'failed') return null

  return (
    <form action={retryJobberSync} className="pbc-alert pbc-alert--danger">
      <span>
        <b>Jobber sync failed</b>
        {quote.jobberSyncError ? ` - ${quote.jobberSyncError}` : ''}
      </span>
      <button type="submit" className="pbc-btn pbc-btn--ghost pbc-btn--sm">
        Retry Jobber sync
      </button>
    </form>
  )
}

function getPreferredFormulaScopes(
  quote: QuoteRecord,
  areaBreakdown: { interior: AreaSubtotalGroup; exterior: AreaSubtotalGroup; roof: AreaSubtotalGroup }
): AreaScope[] {
  const workType = quote.workType?.toLowerCase()
  const scopesWithRows = new Set(
    quote.items
      .map((item) => item.areaScopeSnapshot)
      .filter((scope): scope is AreaScope => scope === 'interior' || scope === 'exterior' || scope === 'roof')
  )

  if (workType === 'interior' && scopesWithRows.has('interior')) return ['interior']
  if (workType === 'exterior' && scopesWithRows.has('exterior')) return ['exterior']
  if (workType === 'roof' && scopesWithRows.has('roof')) return ['roof']

  const scopes: AreaScope[] = []
  if (scopesWithRows.has('interior') || !areaBreakdown.interior.subtotal.isZero()) scopes.push('interior')
  if (scopesWithRows.has('exterior') || !areaBreakdown.exterior.subtotal.isZero()) scopes.push('exterior')
  if (scopesWithRows.has('roof') || !areaBreakdown.roof.subtotal.isZero()) scopes.push('roof')
  return scopes.length ? scopes : ['interior', 'exterior', 'roof']
}

export function QuoteDetailView({ quote }: QuoteDetailViewProps) {
  const materialTotal = itemMaterialTotal(quote)
  const subtotal = new Decimal(quote.subtotal)
  const labourTotal = Decimal.max(subtotal.sub(materialTotal), 0)
  const areaBreakdown = calculateAreaSubtotalBreakdown({
    materials: mapSavedItemsToMaterials(quote.items),
    selectedMin: quote.selectedMin,
    selectedMax: quote.selectedMax,
    areaFormulaSelections: {
      interior: {
        selectedMin: quote.interiorSelectedMin ?? quote.selectedMin,
        selectedMax: quote.interiorSelectedMax ?? quote.selectedMax,
      },
      exterior: {
        selectedMin: quote.exteriorSelectedMin ?? quote.selectedMin,
        selectedMax: quote.exteriorSelectedMax ?? quote.selectedMax,
      },
      roof: {
        selectedMin: quote.roofSelectedMin ?? quote.selectedMin,
        selectedMax: quote.roofSelectedMax ?? quote.selectedMax,
      },
    },
    settings: quote.pricingSettingsSnapshot,
  })
  const jobberFinancialSummary = quote.jobberSnapshot && !quote.jobberSnapshot.jobExpensesError
    ? quote.jobberSnapshot.financialSummary
    : null
  const creatorName = quote.createdByName ?? quote.createdByEmail ?? 'Unknown user'
  const optionSummaries = quote.options.map((option) => {
    const optionAreaBreakdown = calculateAreaSubtotalBreakdown({
      materials: mapSavedItemsToMaterials(option.items),
      selectedMin: option.selectedMin,
      selectedMax: option.selectedMax,
      settings: quote.pricingSettingsSnapshot,
    })

    return {
      id: option.id,
      title: option.title,
      subtotal: new Decimal(option.subtotal),
      finalTotal: new Decimal(option.finalTotal),
      interiorSubtotal: optionAreaBreakdown.interior.subtotal,
      exteriorSubtotal: optionAreaBreakdown.exterior.subtotal,
      roofSubtotal: optionAreaBreakdown.roof.subtotal,
    }
  })

  const finalSubtotal = areaBreakdown.finalSubtotal
  const lineItemsTotal = quoteLineItemsTotal(quote.jobberQuoteLines)
  const visibleJobberLines = quote.jobberQuoteLines.slice(0, DETAIL_PREVIEW_LIMIT)
  const hiddenJobberLines = quote.jobberQuoteLines.slice(DETAIL_PREVIEW_LIMIT)
  const visibleItems = quote.items.slice(0, DETAIL_PREVIEW_LIMIT)
  const hiddenItems = quote.items.slice(DETAIL_PREVIEW_LIMIT)
  const formulaScopes = getPreferredFormulaScopes(quote, areaBreakdown)

  return (
    <main>
      <header className="pbc-topbar">
        <div className="pbc-crumb">
          <Link href="/quotes">Quotes</Link>
          {Icons.arrowDown({ size: 14 })}
          <b className="truncate">{quote.customerName || 'Untitled Quote'}</b>
        </div>
        <div className="pbc-topbar__right">
          <span className="pbc-readonly">{Icons.lock({ size: 15 })} Read-only</span>
          <Link href={`/quotes/${quote.id}/edit`} className="pbc-btn pbc-btn--ghost">
            {Icons.edit({ size: 15 })} Edit quote
          </Link>
          <QuoteDuplicateButton quoteId={quote.id} className="pbc-btn pbc-btn--ghost">
            {Icons.template({ size: 15 })} Duplicate
          </QuoteDuplicateButton>
        </div>
      </header>

      <div className="pbc-page">
        <div className="pbc-pagehead pbc-pagehead--detail">
          <div className="min-w-0">
            <Link href="/quotes" className="pbc-back">{Icons.back({ size: 15 })} Back to Quotes</Link>
            <h1>{quote.customerName || 'Untitled Quote'}</h1>
            <p className="pbc-detailaddr">{Icons.pin({ size: 15 })} {quote.customerAddress || 'No address'}</p>
          </div>
          <div className="pbc-detailtags">
            <Link href={`/quotes/${quote.id}/edit`} className="pbc-btn pbc-btn--ghost">
              {Icons.edit({ size: 15 })} Edit
            </Link>
            <QuoteDuplicateButton quoteId={quote.id} className="pbc-btn pbc-btn--ghost">
              {Icons.template({ size: 15 })} Duplicate
            </QuoteDuplicateButton>
            <QuoteDeleteButton quoteId={quote.id} redirectToQuotes />
          </div>
        </div>

        <JobberSyncFailurePanel quote={quote} />

        <div className="pbc-dgrid">
          {/* Summary */}
          <Card>
            <SectionLabel icon={Icons.user({ size: 16 })}>Summary</SectionLabel>
            <dl className="pbc-dlist">
              {quote.jobberQuoteId ? <DRow label="Jobber ID" mono>#{quote.jobberQuoteId}</DRow> : null}
              {quote.workType ? <DRow label="Work type">{quote.workType}</DRow> : null}
              <DRow label="Created by">{creatorName}</DRow>
              <DRow label="Created on">{formatQuoteDate(quote.createdAt)}</DRow>
              <DRow label="Total working days" mono>{quote.workingDays}</DRow>
              <DRow label="Total man-days" mono>{quote.labourPerDay}</DRow>
            </dl>
            <div className="pbc-dexgst">
              <span>Final subtotal ex GST</span>
              <b className="mono">${finalSubtotal.toFixed(2)}</b>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
              <div className="flex justify-between gap-2">
                <span className="text-[var(--muted)]">Interior</span>
                <span className="mono font-semibold">${areaBreakdown.interior.subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-[var(--muted)]">Exterior</span>
                <span className="mono font-semibold">${areaBreakdown.exterior.subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-[var(--muted)]">Roof</span>
                <span className="mono font-semibold">${areaBreakdown.roof.subtotal.toFixed(2)}</span>
              </div>
            </div>
          </Card>

          {/* Formula results */}
          <Card>
            <SectionLabel
              icon={Icons.layers({ size: 16 })}
              aside={formulaScopes.length === 1 ? (
                <span className="pbc-chip">
                  Range F{areaBreakdown[formulaScopes[0]].selectedMin}-F{areaBreakdown[formulaScopes[0]].selectedMax}
                </span>
              ) : undefined}
            >
              Formula results
            </SectionLabel>
            <div className="pbc-dformulas">
              {formulaScopes.map((scope, scopeIndex) => {
                const group = areaBreakdown[scope]
                const label = AREA_SCOPE_LABELS[scope]

                return (
                  <div key={scope} className={scopeIndex > 0 ? 'pbc-divider' : ''}>
                    {formulaScopes.length > 1 ? (
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <h3 className="pbc-paneltitle">{label}</h3>
                        <span className="pbc-chip">Range F{group.selectedMin}-F{group.selectedMax}</span>
                      </div>
                    ) : null}
                    <div className="pbc-dformulas">
                      {group.results.map((row) => {
                        const mark = group.selectedMin === row.formulaNum ? 'lo' : group.selectedMax === row.formulaNum ? 'hi' : ''
                        return (
                          <div key={`${scope}-${row.formulaNum}`} className={`pbc-dformula ${mark ? 'pbc-dformula--' + mark : ''}`}>
                            <span className="pbc-dformula__code">F{row.formulaNum}</span>
                            <span className="pbc-dformula__short">{row.name}</span>
                            {mark ? (
                              <span className={`pbc-dformula__mark pbc-dformula__mark--${mark}`}>{mark === 'lo' ? 'LOW' : 'HIGH'}</span>
                            ) : (
                              <span />
                            )}
                            <span className="mono pbc-dformula__amt">${row.total.toFixed(2)}</span>
                          </div>
                        )
                      })}
                      <div className="pbc-dlines__total">
                        <span>{label} selected subtotal</span>
                        <b className="mono">${group.subtotal.toFixed(2)}</b>
                      </div>
                    </div>
                  </div>
                )
              })}
              {quote.jobberQuoteLines.length > 0 ? (
                <div className="pbc-dlines__total">
                  <span>Line items subtotal</span>
                  <b className="mono">${lineItemsTotal.toFixed(2)}</b>
                </div>
              ) : null}
            </div>
          </Card>

          <FinalSummary
            labourTotal={labourTotal}
            materialTotal={materialTotal}
            areaBreakdown={areaBreakdown}
            jobberFinancialSummary={jobberFinancialSummary}
            className="pbc-dspan"
          />

          {quote.priceRevisions.length > 0 ? (
            <Card className="pbc-dspan">
              <SectionLabel
                icon={Icons.dollar({ size: 16 })}
                aside={<span className="pbc-chip">{quote.priceRevisions.length} revisions</span>}
              >
                Price History
              </SectionLabel>
              <div className="pbc-dlines">
                {quote.priceRevisions.map((revision) => (
                  <PriceRevisionDetail key={revision.id} revision={revision} />
                ))}
              </div>
            </Card>
          ) : null}

          {/* Jobber data */}
          {quote.jobberSnapshot ? (
            <Card className="pbc-dspan">
              <SectionLabel icon={Icons.template({ size: 16 })}>Jobber Data</SectionLabel>
              <JobberQuoteSummary quote={quote.jobberSnapshot} />
            </Card>
          ) : null}

          {/* Internal memos */}
          <Card className="pbc-dspan">
            <SectionLabel
              icon={Icons.edit({ size: 16 })}
              aside={quote.memos.length ? <span className="pbc-chip">{quote.memos.length} memos</span> : undefined}
            >
              Internal Memos
            </SectionLabel>
            <div className="space-y-3">
              {quote.memos.length === 0 ? <p className="pbc-empty">No internal memos saved.</p> : null}
              {quote.memos.map((memo, index) => (
                <article key={memo.id} className="pbc-dmemo">
                  <h3>Memo {index + 1}</h3>
                  <p>{memo.body}</p>
                </article>
              ))}
            </div>
          </Card>

          {/* Product / service lines */}
          <Card className="pbc-dspan">
            <SectionLabel
              icon={Icons.template({ size: 16 })}
              aside={<span className="pbc-chip">{quote.jobberQuoteLines.length} items</span>}
            >
              App Product / Service
            </SectionLabel>
            <div className="pbc-dlines">
              {quote.jobberQuoteLines.length === 0 ? <p className="pbc-empty">No product or service lines saved.</p> : null}
              {visibleJobberLines.map((line) => <JobberLineDetail key={line.id} line={line} />)}
              <DetailMore count={hiddenJobberLines.length}>
                {hiddenJobberLines.map((line) => <JobberLineDetail key={line.id} line={line} />)}
              </DetailMore>
            </div>
          </Card>

          {/* Materials */}
          <Card className="pbc-dspan">
            <SectionLabel
              icon={Icons.palette({ size: 16 })}
              aside={<span className="pbc-chip">{quote.items.length} materials</span>}
            >
              Materials
            </SectionLabel>
            <div className="pbc-dmats">
              {quote.items.length === 0 ? <p className="pbc-empty">No materials saved.</p> : null}
              {visibleItems.map((item) => <MaterialDetail key={item.id} item={item} />)}
              <DetailMore count={hiddenItems.length}>
                {hiddenItems.map((item) => <MaterialDetail key={item.id} item={item} />)}
              </DetailMore>
              <div className="pbc-dlines__total">
                <span>Material total (RRP)</span>
                <b className="mono">${materialTotal.toFixed(2)}</b>
              </div>
            </div>
          </Card>

          {optionSummaries.length ? (
            <Card className="pbc-dspan">
              <OptionTotalsSummary options={optionSummaries} />
            </Card>
          ) : null}
        </div>
      </div>
    </main>
  )
}
