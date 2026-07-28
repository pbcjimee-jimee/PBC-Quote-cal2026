'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { searchProducts } from '@/lib/actions/products'
import { Alert } from '@/components/ui/card'
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
  const [activeIndex, setActiveIndex] = useState(-1)
  const [isDismissed, setIsDismissed] = useState(false)
  const [isSearching, setIsSearching] = useState(false)
  const requestIdRef = useRef(0)
  const listboxId = useId()

  useEffect(() => {
    // 진행 중이던 이전 요청의 늦은 응답이 상태를 덮어쓰지 않도록 토큰을 갱신한다
    const requestId = ++requestIdRef.current

    if (!query.trim()) return

    const timer = window.setTimeout(async () => {
      const result = await searchProducts({ query, limit: 8 })
      if (requestId !== requestIdRef.current) return

      setIsSearching(false)
      if (result.ok) {
        setResults(result.data)
        setError(null)
        setActiveIndex(result.data.length > 0 ? 0 : -1)
      } else {
        setResults([])
        setError(result.error)
        setActiveIndex(-1)
      }
    }, 200)

    return () => window.clearTimeout(timer)
  }, [query])

  const isOpen = Boolean(query.trim()) && !isDismissed

  function resetSearch() {
    requestIdRef.current += 1
    setQuery('')
    setResults([])
    setActiveIndex(-1)
    setIsDismissed(false)
    setIsSearching(false)
  }

  function addProduct(product: ProductRecord) {
    onAdd(createProductMaterialItem(product))
    resetSearch()
  }

  function addCustom() {
    const name = query.trim()
    if (!name) return
    onAdd(createCustomMaterialItem(name))
    resetSearch()
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setIsDismissed(false)
      setActiveIndex((index) => Math.min(index + 1, results.length - 1))
      return
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex((index) => Math.max(index - 1, 0))
      return
    }

    if (event.key === 'Escape') {
      if (isOpen) {
        event.preventDefault()
        setIsDismissed(true)
        setActiveIndex(-1)
      }
      return
    }

    if (event.key === 'Enter') {
      event.preventDefault()
      // 닫힌 상태·검색 완료 전에는 어떤 항목도 추가하지 않는다 ($0 커스텀 자재 오추가 방지)
      if (!isOpen || isSearching) return
      const activeProduct = activeIndex >= 0 ? results[activeIndex] : undefined
      if (activeProduct) {
        addProduct(activeProduct)
        return
      }
      addCustom()
    }
  }

  return (
    <div className="pbc-materialsearch relative mt-4">
      <input
        value={query}
        onChange={(event) => {
          const nextQuery = event.target.value
          setQuery(nextQuery)
          setIsDismissed(false)
          if (nextQuery.trim()) {
            setIsSearching(true)
          } else {
            setIsSearching(false)
            setResults([])
            setError(null)
            setActiveIndex(-1)
          }
        }}
        onKeyDown={handleKeyDown}
        role="combobox"
        aria-expanded={isOpen}
        aria-controls={listboxId}
        aria-autocomplete="list"
        aria-activedescendant={
          isOpen && !isSearching && activeIndex >= 0 ? `${listboxId}-option-${activeIndex}` : undefined
        }
        className="pbc-input"
        placeholder="Search paint or material..."
      />
      {error ? <Alert tone="danger" className="mt-2">{error}</Alert> : null}
      {isOpen ? (
        <div id={listboxId} role="listbox" aria-label="Paint or material results" className="pbc-dropdown">
          {isSearching ? (
            <span role="presentation" className="pbc-dropdownitem pbc-dropdownitem--muted block">
              Searching...
            </span>
          ) : (
            <>
              {results.map((product, index) => (
                <button
                  key={product.id}
                  id={`${listboxId}-option-${index}`}
                  type="button"
                  role="option"
                  aria-selected={index === activeIndex}
                  onClick={() => addProduct(product)}
                  onMouseEnter={() => setActiveIndex(index)}
                  className={`pbc-dropdownitem ${index === activeIndex ? 'pbc-dropdownitem--selected' : ''}`}
                >
                  <span className="pbc-titletext block">{product.name}</span>
                  <span className="pbc-listitem__meta block">RRP ${product.marketPrice}</span>
                </button>
              ))}
              {results.length === 0 ? (
                <button
                  id={`${listboxId}-option-custom`}
                  type="button"
                  role="option"
                  aria-selected={true}
                  onClick={addCustom}
                  className="pbc-dropdownitem pbc-dropdownitem--selected font-semibold text-[var(--primary)]"
                >
                  Add &quot;{query.trim()}&quot; as custom item
                </button>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </div>
  )
}
