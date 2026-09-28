'use client'

import { useEffect, useId, useState } from 'react'
import { searchProducts } from '@/lib/actions/products'
import type { ProductRecord } from '@/lib/products/types'

interface MaterialNameSearchProps {
  value: string
  errorKey: string
  onChange: (name: string) => void
  onSelect: (product: ProductRecord) => void
}

export function MaterialNameSearch({ value, errorKey, onChange, onSelect }: MaterialNameSearchProps) {
  const listId = useId()
  const [open, setOpen] = useState(false)
  const [results, setResults] = useState<ProductRecord[]>([])
  const [activeIndex, setActiveIndex] = useState(-1)
  const [status, setStatus] = useState('')
  const hasQuery = value.trim().length > 0
  const expanded = open && hasQuery

  useEffect(() => {
    if (!expanded) return
    let cancelled = false
    const timer = window.setTimeout(async () => {
      try {
        const result = await searchProducts({ query: value, limit: 8 })
        if (cancelled) return
        setResults(result.ok ? result.data : [])
        setStatus(result.ok ? (result.data.length ? '' : 'No matching products. Keep typing to search.') : result.error)
      } catch {
        if (!cancelled) setStatus('Unable to search products. Edit the name to try again.')
      }
    }, 200)
    return () => { cancelled = true; window.clearTimeout(timer) }
  }, [expanded, value])

  function close() {
    setOpen(false)
    setResults([])
    setActiveIndex(-1)
  }

  function select(product: ProductRecord) {
    close()
    onSelect(product)
  }

  return (
    <div className="pbc-material-name-search relative min-w-0 flex-1" onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget)) close()
    }}>
      <input
        type="text"
        value={value}
        onChange={(event) => {
          setResults([])
          setActiveIndex(-1)
          setStatus('Searching products...')
          setOpen(true)
          onChange(event.target.value)
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault()
            close()
          } else if (expanded && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
            event.preventDefault()
            setActiveIndex((index) => {
              if (!results.length) return -1
              if (index < 0) return event.key === 'ArrowDown' ? 0 : results.length - 1
              return (index + (event.key === 'ArrowDown' ? 1 : -1) + results.length) % results.length
            })
          } else if (event.key === 'Enter') {
            event.preventDefault()
            if (expanded && results[activeIndex]) select(results[activeIndex])
          }
        }}
        role="combobox"
        aria-label="Material name"
        aria-autocomplete="list"
        aria-expanded={expanded}
        aria-controls={expanded ? listId : undefined}
        aria-activedescendant={expanded && activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined}
        autoComplete="off"
        data-error-key={errorKey}
        className="pbc-input pbc-materialrow__name min-w-0 font-bold"
      />
      {expanded ? (
        <div className="pbc-dropdown">
          <div id={listId} role="listbox" aria-label="Matching materials">
            {results.map((product, index) => (
              <button
                key={product.id}
                id={`${listId}-${index}`}
                type="button"
                role="option"
                aria-selected={activeIndex === index}
                tabIndex={-1}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => select(product)}
                className={`pbc-dropdownitem${activeIndex === index ? ' pbc-dropdownitem--selected' : ''}`}
              >
                <span className="pbc-titletext block">{product.name}</span>
                <span className="pbc-listitem__meta block">RRP ${product.rrpPrice ?? product.marketPrice}</span>
              </button>
            ))}
          </div>
          {status ? <div role="status" className="pbc-dropdownitem pbc-dropdownitem--muted">{status}</div> : null}
        </div>
      ) : null}
    </div>
  )
}
