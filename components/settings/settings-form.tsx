'use client'

import { useState, useTransition } from 'react'
import { updatePricingSettings } from '@/lib/actions/settings'
import type { PricingSettings } from '@/lib/calculator'
import type { ProductRecord } from '@/lib/products/types'

interface SettingsFormProps {
  initialProducts: ProductRecord[]
  initialSettings: PricingSettings
}

function toPercent(value: number | { toString(): string }): string {
  return String(Number(value.toString()) * 100)
}

function fromPercent(value: string): number {
  return Number(value || 0) / 100
}

export function SettingsForm({ initialProducts, initialSettings }: SettingsFormProps) {
  const [isPending, startTransition] = useTransition()
  const [activeTab, setActiveTab] = useState<'labour' | 'material'>('labour')
  const [materialQuery, setMaterialQuery] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [settings, setSettings] = useState({
    f1LabourRate: String(initialSettings.f1LabourRate),
    f2LabourRate: String(initialSettings.f2LabourRate),
    f3LabourRate: String(initialSettings.f3LabourRate),
    f4LabourRate: String(initialSettings.f4LabourRate),
    f5LabourRate: String(initialSettings.f5LabourRate),
    f2Margin: toPercent(initialSettings.f2Margin),
    f3Margin: toPercent(initialSettings.f3Margin),
    f4Margin: toPercent(initialSettings.f4Margin),
    f5Margin: toPercent(initialSettings.f5Margin),
  })

  function setField(field: keyof typeof settings, value: string) {
    setSettings((current) => ({ ...current, [field]: value }))
  }

  function save() {
    setMessage(null)
    startTransition(async () => {
      const result = await updatePricingSettings({
        f1LabourRate: Number(settings.f1LabourRate),
        f2LabourRate: Number(settings.f2LabourRate),
        f3LabourRate: Number(settings.f3LabourRate),
        f4LabourRate: Number(settings.f4LabourRate),
        f5LabourRate: Number(settings.f5LabourRate),
        f2Margin: fromPercent(settings.f2Margin),
        f3Margin: fromPercent(settings.f3Margin),
        f4Margin: fromPercent(settings.f4Margin),
        f5Margin: fromPercent(settings.f5Margin),
      })

      setMessage(result.ok ? 'Settings saved for future quotes.' : result.error)
    })
  }

  const filteredProducts = initialProducts.filter((product) => {
    const needle = materialQuery.trim().toLowerCase()
    if (!needle) return true
    return [
      product.manufacturer,
      product.type,
      product.name,
      product.base,
      product.sheen,
      product.unit,
      product.productCode,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
      .includes(needle)
  })

  return (
    <div className="rounded-md border border-gray-200 bg-white">
      <div className="flex border-b border-gray-200">
        <button type="button" onClick={() => setActiveTab('labour')} className={`px-4 py-3 text-sm font-medium ${activeTab === 'labour' ? 'border-b-2 border-slate-700 text-slate-900' : 'text-gray-500 hover:text-gray-900'}`}>
          Labour Rates
        </button>
        <button type="button" onClick={() => setActiveTab('material')} className={`px-4 py-3 text-sm font-medium ${activeTab === 'material' ? 'border-b-2 border-slate-700 text-slate-900' : 'text-gray-500 hover:text-gray-900'}`}>
          Material
        </button>
      </div>

      {activeTab === 'labour' ? (
        <div className="max-w-2xl p-5">
          <section className="space-y-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Labour Rates</h2>
            {[
              ['f1LabourRate', 'F1 (L500 / no margin)'],
              ['f2LabourRate', 'F2 (L460 / labour 30%)'],
              ['f3LabourRate', 'F3 (L460 / total 30%)'],
              ['f4LabourRate', 'F4 (L380 actual / 25%)'],
              ['f5LabourRate', 'F5 (L380 actual / 30%)'],
            ].map(([field, label]) => (
              <label key={field} className="grid gap-2 text-sm font-medium text-gray-700 sm:grid-cols-[1fr_160px] sm:items-center">
                <span>{label}</span>
                <input value={settings[field as keyof typeof settings]} onChange={(event) => setField(field as keyof typeof settings, event.target.value)} inputMode="decimal" className="rounded-md border border-gray-300 px-3 py-2 text-sm" />
              </label>
            ))}
          </section>

          <section className="mt-8 space-y-4 border-t border-gray-200 pt-6">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Margins</h2>
            {[
              ['f2Margin', 'F2 margin'],
              ['f3Margin', 'F3 margin'],
              ['f4Margin', 'F4 margin'],
              ['f5Margin', 'F5 margin'],
            ].map(([field, label]) => (
              <label key={field} className="grid gap-2 text-sm font-medium text-gray-700 sm:grid-cols-[1fr_160px] sm:items-center">
                <span>{label}</span>
                <input value={settings[field as keyof typeof settings]} onChange={(event) => setField(field as keyof typeof settings, event.target.value)} inputMode="decimal" className="rounded-md border border-gray-300 px-3 py-2 text-sm" />
              </label>
            ))}
          </section>

          <div className="mt-6 flex items-center gap-4">
            <button type="button" onClick={save} disabled={isPending} className="rounded-md bg-slate-700 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50">
              {isPending ? 'Saving...' : 'Save Settings'}
            </button>
            {message ? <p className="text-sm text-gray-600">{message}</p> : null}
          </div>
          <p className="mt-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-700">Changes affect future quotes only. Existing quotes preserve their snapshot.</p>
        </div>
      ) : (
        <div className="p-5">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Paint Materials</h2>
            <input value={materialQuery} onChange={(event) => setMaterialQuery(event.target.value)} className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm sm:max-w-xs" placeholder="Search material..." />
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-3 py-2 font-semibold">Brand</th>
                  <th className="px-3 py-2 font-semibold">Kind</th>
                  <th className="px-3 py-2 font-semibold">Base</th>
                  <th className="px-3 py-2 font-semibold">Sheen/Finish</th>
                  <th className="px-3 py-2 font-semibold">Volume (L)</th>
                  <th className="px-3 py-2 text-right font-semibold">Price (RRP)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredProducts.map((product) => (
                  <tr key={product.id} className="align-top">
                    <td className="px-3 py-2 font-medium text-gray-900">{product.manufacturer ?? '-'}</td>
                    <td className="px-3 py-2 text-gray-700">
                      <span className="block font-medium">{product.productLine ?? product.type ?? product.name}</span>
                      <span className="block text-xs text-gray-500">{product.name}</span>
                    </td>
                    <td className="px-3 py-2 text-gray-700">{product.base ?? '-'}</td>
                    <td className="px-3 py-2 text-gray-700">{product.sheen ?? '-'}</td>
                    <td className="px-3 py-2 text-gray-700">{product.volumeLitres ? `${product.volumeLitres}L` : product.unit}</td>
                    <td className="px-3 py-2 text-right font-mono text-gray-900">${product.rrpPrice ?? product.marketPrice}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-sm text-gray-500">{filteredProducts.length} materials</p>
        </div>
      )}
    </div>
  )
}
