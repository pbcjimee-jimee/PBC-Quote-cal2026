import Link from 'next/link'
import { redirect } from 'next/navigation'
import { InventoryManager } from '@/components/inventory/inventory-manager'
import { Icons } from '@/components/ui/icons'
import { listInventory } from '@/lib/actions/inventory'
import { requireRole } from '@/lib/security/require-app-user'

export default async function InventoryPage() {
  const appUser = await requireRole('any')
  if (!appUser.ok) redirect('/login')

  const inventory = await listInventory({ limit: 500 })
  const isAdmin = appUser.profile.role === 'admin'

  return (
    <main>
      <header className="pbc-topbar">
        <div className="pbc-crumb">
          <span>{isAdmin ? 'Admin' : 'Supervisor'}</span>{Icons.arrowDown({ size: 14 })}<b>Inventory</b>
        </div>
        {isAdmin ? (
          <div className="pbc-topbar__right">
            <Link href="/settings" className="pbc-btn pbc-btn--ghost">{Icons.back({ size: 15 })} Back to settings</Link>
          </div>
        ) : null}
      </header>
      <div className="pbc-page">
        <div className="pbc-pagehead">
          <h1>Inventory</h1>
          <p>{isAdmin ? 'Manage warehouse inventory and movement records.' : 'Update stock quantities and usage details.'}</p>
          {!inventory.ok ? <p className="text-[var(--danger)]">{inventory.error}</p> : null}
        </div>
        <InventoryManager
          initialItems={inventory.ok ? inventory.data : []}
          role={appUser.profile.role}
        />
      </div>
    </main>
  )
}
