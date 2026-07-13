import Link from 'next/link'
import { InventoryManager } from '@/components/inventory/inventory-manager'
import { Icons } from '@/components/ui/icons'
import { listInventory } from '@/lib/actions/inventory'

export default async function InventoryPage() {
  const inventory = await listInventory({ limit: 500 })

  return (
    <main>
      <header className="pbc-topbar">
        <div className="pbc-crumb">
          <span>Admin</span>{Icons.arrowDown({ size: 14 })}<span>Settings</span>{Icons.arrowDown({ size: 14 })}<b>Inventory</b>
        </div>
        <div className="pbc-topbar__right">
          <Link href="/settings" className="pbc-btn pbc-btn--ghost">{Icons.back({ size: 15 })} Back to settings</Link>
        </div>
      </header>
      <div className="pbc-page">
        <div className="pbc-pagehead">
          <h1>Inventory</h1>
          <p>Manage warehouse paint, tools, purchase dates, usage dates and site notes.</p>
          {!inventory.ok ? <p className="text-[var(--danger)]">{inventory.error}</p> : null}
        </div>
        <InventoryManager initialItems={inventory.ok ? inventory.data : []} />
      </div>
    </main>
  )
}
