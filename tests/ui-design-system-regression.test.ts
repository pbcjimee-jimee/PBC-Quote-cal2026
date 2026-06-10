import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('UI design system regression', () => {
  it('keeps UI-DESIGN-SYSTEM as the documented visual source of truth', () => {
    const designSystem = readFileSync('docs/UI-DESIGN-SYSTEM.md', 'utf8')
    const agentMap = readFileSync('docs/AGENT-MAP.md', 'utf8')
    const legacyDocs = [
      'docs/UI-DESIGN.md',
      'docs/UI-QUOTE-FORM.md',
      'docs/UI-PAGES.md',
    ]

    expect(designSystem).toContain('Current UI source of truth')
    expect(designSystem).toContain('pbc-dropdown')
    expect(designSystem).toContain('Do not use inline `style`')
    expect(agentMap).toContain('Latest visual styling source of truth: `docs/UI-DESIGN-SYSTEM.md`')

    for (const docPath of legacyDocs) {
      expect(readFileSync(docPath, 'utf8'), `${docPath} should point to current styling docs`).toContain('docs/UI-DESIGN-SYSTEM.md')
    }
  })

  it('defines shared classes for common quote UI surfaces instead of local visual recipes', () => {
    const css = readFileSync('app/styles/components.css', 'utf8')

    for (const className of [
      '.pbc-btn--soft',
      '.pbc-dropdown',
      '.pbc-dropdownitem',
      '.pbc-optioncard',
      '.pbc-optioncard__head',
      '.pbc-chip--muted',
    ]) {
      expect(css, `${className} is missing from shared component CSS`).toContain(className)
    }

    expect(css).toContain('linear-gradient(145deg, var(--primary), var(--primary-strong))')
    expect(css).not.toContain('linear-gradient(145deg, #0b66d8, #0a4fad)')
  })

  it('uses shared primitives and classes in high-traffic quote components', () => {
    const primitiveSource = readFileSync('components/ui/card.tsx', 'utf8')
    const quoteCard = readFileSync('components/quote-list/quote-card.tsx', 'utf8')
    const productServiceEditor = readFileSync('components/quote-form/jobber-product-service-editor.tsx', 'utf8')
    const paintSearch = readFileSync('components/quote-form/paint-search.tsx', 'utf8')
    const quoteOptions = readFileSync('components/quote-form/quote-options-panel.tsx', 'utf8')
    const formulaResults = readFileSync('components/quote-form/formula-results.tsx', 'utf8')

    expect(primitiveSource).toContain('export function buttonClassName')
    expect(primitiveSource).toContain('export function Button')
    expect(primitiveSource).toContain('export function Input')
    expect(primitiveSource).toContain('export function Textarea')

    expect(quoteCard).toContain("variant: 'soft'")
    expect(quoteCard).not.toContain('style={{ background:')

    expect(productServiceEditor).toContain('pbc-dropdown')
    expect(productServiceEditor).toContain('pbc-dropdownitem')
    expect(productServiceEditor).toContain('Icons.trash')
    expect(productServiceEditor).not.toContain('shadow-[var(--shadow-pop)]')

    expect(paintSearch).toContain('pbc-dropdown')
    expect(paintSearch).not.toContain('rounded-[var(--r-md)] border border-[var(--border)] bg-white')

    expect(quoteOptions).toContain('pbc-optioncard')
    expect(quoteOptions).toContain('Button')
    expect(quoteOptions).not.toContain('border-b border-[var(--border-soft)] bg-white p-3')

    expect(formulaResults).toContain('pbc-chip--muted')
    expect(formulaResults).not.toContain("bg-white text-[var(--muted)]")
  })
})
