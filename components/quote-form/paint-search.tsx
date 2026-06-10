'use client'

import { useEffect, useState } from 'react'
import { searchProducts } from '@/lib/actions/products'
import type { ProductRecord } from '@/lib/products/types'
import type { MaterialItem } from './types'
import { createCustomMaterialItem, createProductMaterialItem } from './material-item-factory'

interface PaintSearchProps {
  onAdd: (item: MaterialItem) => void
}

export function PaintSearch({ onAdd }: PaintSearchProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<ProductRecord[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const timer = window.setTimeout(async () => {
      if (!query.trim()) {
        setResults([])
        setError(null)
        return
      }

      const result = await searchProducts({ query, limit: 8 })
      if (result.ok) {
        setResults(result.data)
        setError(null)
      } else {
        setResults([])
        setError(result.error)
      }
    }, 200)

    return () => window.clearTimeout(timer)
  }, [query])

  function addProduct(product: ProductRecord) {
    onAdd(createProductMaterialItem(product))
    setQuery('')
    setResults([])
  }

  function addCustom() {
    const name = query.trim()
    if (!name) return
    onAdd(createCustomMaterialItem(name))
    setQuery('')
    setResults([])
  }

  return (
    <div className="pbc-materialsearch relative mt-4">
      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            addCustom()
          }
        }}
        className="pbc-input"
        placeholder="Search paint or material..."
      />
      {error ? <p className="pbc-alert pbc-alert--danger mt-2">{error}</p> : null}
      {query.trim() ? (
        <div className="pbc-dropdown">
          {results.map((product) => (
            <button key={product.id} type="button" onClick={() => addProduct(product)} className="pbc-dropdownitem">
              <span className="pbc-titletext block">{product.name}</span>
              <span className="pbc-listitem__meta block">RRP ${product.marketPrice}</span>
            </button>
          ))}
          {results.length === 0 ? (
            <button type="button" onClick={addCustom} className="pbc-dropdownitem font-semibold text-[var(--primary)]">
              Add &quot;{query.trim()}&quot; as custom item
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
