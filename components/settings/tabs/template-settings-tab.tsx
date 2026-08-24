'use client'

import { JobberProductServiceEditor, type JobberQuoteLinesChange } from '@/components/quote-form/jobber-product-service-editor'
import type { JobberQuoteLineItemDraft } from '@/components/quote-form/types'
import type { ProductServiceRecord } from '@/lib/product-services/types'
import type { QuoteLineTemplateRecord } from '@/lib/quote-line-templates/types'

export interface TemplateSettingsTabProps {
  templates: QuoteLineTemplateRecord[]
  productServices: ProductServiceRecord[]
  editingTemplateId: string | null
  templateName: string
  templateLines: JobberQuoteLineItemDraft[]
  message: string | null
  disabled: boolean
  onTemplateNameChange: (value: string) => void
  onTemplateLinesChange: (update: JobberQuoteLinesChange) => void
  onSave: () => void
  onCancel: () => void
  onEdit: (template: QuoteLineTemplateRecord) => void
  onDelete: (id: string) => void
}

type QuoteLineTemplateEditorProps = Pick<TemplateSettingsTabProps, 'templates' | 'productServices'> & Partial<Omit<TemplateSettingsTabProps, 'templates' | 'productServices'>>

export function QuoteLineTemplateEditor({
  templates,
  productServices,
  editingTemplateId = null,
  templateName = '',
  templateLines = [],
  message = null,
  disabled = false,
  onTemplateNameChange = () => undefined,
  onTemplateLinesChange = () => undefined,
  onSave = () => undefined,
  onCancel = () => undefined,
  onEdit = () => undefined,
  onDelete = () => undefined,
}: QuoteLineTemplateEditorProps) {
  return (
    <div className="space-y-5">
      <div className="pbc-panelhead">
        <div className="pbc-panelhead__copy">
          <h2 className="pbc-paneltitle">Template</h2>
          <p className="pbc-panelsub">Save reusable Product / Service line item and text item sets for new quotes.</p>
        </div>
      </div>

      <div className="pbc-formgroup">
        <label className="pbc-field">
          <span className="pbc-field__label">Template name</span>
          <input value={templateName} onChange={(event) => onTemplateNameChange(event.target.value)} className="pbc-input" placeholder="e.g. Standard interior quote" />
        </label>
        <JobberProductServiceEditor value={templateLines} productServices={productServices} onChange={onTemplateLinesChange} />
        <div className="pbc-panelhead__actions mt-4">
          <button type="button" onClick={onSave} disabled={disabled || !templateName.trim()} className="pbc-btn pbc-btn--primary">{disabled ? 'Saving...' : 'Save Template'}</button>
          {editingTemplateId ? <button type="button" onClick={onCancel} disabled={disabled} className="pbc-btn pbc-btn--ghost">Cancel</button> : null}
          {message ? <p className="pbc-panelsub">{message}</p> : null}
        </div>
      </div>

      <div className="pbc-list">
        {templates.length === 0 ? <p className="pbc-empty">No templates saved yet.</p> : null}
        {templates.map((template) => (
          <div key={template.id} className="pbc-listitem">
            <div className="pbc-listitem__main">
              <p className="pbc-listitem__title">{template.name}</p>
              <p className="pbc-listitem__meta">{template.items.length} line items</p>
              {template.items.length > 0 ? <p className="pbc-listitem__sub">{template.items.map((item) => item.name).join(', ')}</p> : null}
            </div>
            <div className="pbc-panelhead__actions">
              <button type="button" onClick={() => onEdit(template)} disabled={disabled} className="pbc-btn pbc-btn--ghost pbc-btn--sm">Edit</button>
              <button type="button" onClick={() => onDelete(template.id)} disabled={disabled} className="pbc-btn pbc-btn--danger pbc-btn--sm">Delete</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function TemplateSettingsTab(props: TemplateSettingsTabProps) {
  return <div className="pbc-formsection pbc-formsection--center"><QuoteLineTemplateEditor {...props} /></div>
}
