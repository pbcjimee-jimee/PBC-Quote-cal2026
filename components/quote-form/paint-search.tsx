'use client'

import { useEffect, useState } from 'react'
import { searchProducts } from '@/lib/actions/products'
import type { ProductRecord } from '@/lib/products/types'
import type { MaterialItem } from './types'

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
    onAdd({
      id: crypto.randomUUID(),
      productId: product.id,
      name: product.name,
      manufacturer: product.manufacturer,
      type: product.type,
      unit: product.unit,
      category: product.category,
      productLine: product.productLine,
      base: product.base,
      sheen: product.sheen,
      volumeLitres: product.volumeLitres,
      productCode: product.productCode,
      marketPrice: product.marketPrice,
      actualPrice: product.marketPrice,
      quantity: '1',
      isCustom: false,
    })
    setQuery('')
    setResults([])
  }

  function addCustom() {
    const name = query.trim()
    if (!name) return
    onAdd({
      id: crypto.randomUUID(),
      name,
      marketPrice: '0',
      actualPrice: '0',
      quantity: '1',
      isCustom: true,
    })
    setQuery('')
    setResults([])
  }

  return (
    <div className="relative">
      <input value={query} onChange={(event) => setQuery(event.target.value)} className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" placeholder="Search paint or material..." />
      {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
      {query.trim() ? (
        <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-md border border-gray-200 bg-white shadow-lg">
          {results.map((product) => (
            <button key={product.id} type="button" onClick={() => addProduct(product)} className="block w-full px-3 py-2 text-left hover:bg-gray-50">
              <span className="block text-sm font-medium text-gray-900">{product.name}</span>
              <span className="block text-xs text-gray-500">
                {product.manufacturer ?? 'Unknown'} - {product.type ?? 'Paint'} - {product.base ?? '-'} - {product.sheen ?? '-'} - {product.unit}
              </span>
              <span className="block text-xs font-medium text-gray-700">RRP ${product.marketPrice}</span>
            </button>
          ))}
          {results.length === 0 ? (
            <button type="button" onClick={addCustom} className="block w-full px-3 py-2 text-left text-sm text-blue-600 hover:bg-blue-50">
              Add &quot;{query.trim()}&quot; as custom item
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
