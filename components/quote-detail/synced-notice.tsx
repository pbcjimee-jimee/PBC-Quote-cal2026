'use client'

import { useEffect } from 'react'
import { Alert } from '@/components/ui/card'

/**
 * Save & Sync 직후 1회성 성공 배너.
 * 마운트 시 URL에서 ?synced=1 을 제거해 새로고침·뒤로가기·링크 공유 시 반복 표시를 막는다.
 */
export function SyncedNotice() {
  useEffect(() => {
    const url = new URL(window.location.href)
    if (!url.searchParams.has('synced')) return
    url.searchParams.delete('synced')
    const search = url.searchParams.toString()
    window.history.replaceState(null, '', url.pathname + (search ? `?${search}` : ''))
  }, [])

  return <Alert tone="success">Saved and synced to Jobber.</Alert>
}
