# App-wide Mobile UX and Inventory Cards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every current route comfortable at iPhone widths and replace the Inventory mobile table with a three-field disclosure card that opens the existing role-appropriate editor.

**Architecture:** Keep one shared mobile sizing contract in the existing CSS token/component files, then add narrowly scoped responsive adapters. `InventoryManager` remains the single state owner; a colocated `InventoryMobileList` receives the same edit state and callbacks as the desktop table, so no server, permission, or data contract is duplicated.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript strict, Tailwind CSS 4 layout utilities, shared `pbc-*` CSS classes, Vitest, React static rendering, in-app browser viewport QA.

**Source spec:** `docs/superpowers/specs/2026-08-05-app-wide-mobile-inventory-design.md`

## Global Constraints

- Mobile shell breakpoint is exactly `max-width: 1023.98px`.
- Narrow card breakpoint is exactly `max-width: 720px`.
- Minimum mobile interaction target is exactly `44px`.
- Mobile input/select font size is exactly `16px`.
- Collapsed Inventory cards show only Name, Category, and Size / Serial.
- Desktop Inventory retains all twelve current columns.
- Admin retains full Inventory edit/delete capability; supervisor retains movement-only capability.
- Settings and Users dense tables keep internal horizontal scrolling; document-level horizontal scrolling is never allowed.
- Jobs seven-column calendar labels keep their documented compact exception and existing 44px job cells.
- No database migration, server-action contract change, RLS change, Jobber mutation, new external dependency, service-worker cache change, or deployment is part of this plan.
- Preserve the existing unrelated `next-env.d.ts` working-tree modification and stage only task-owned files.
- A failing test, typecheck, lint, build, browser overflow measurement, or console check must be corrected before advancing to the next task.

---

## File map

- Modify `app/styles/tokens.css`: shared mobile size tokens only.
- Modify `app/styles/components.css`: global mobile controls, shell overrides, Inventory cards, and quote-specific responsive selectors.
- Modify `components/layout/app-header.tsx`: mobile sign-out, auto-sized role navigation, and Settings descendant active state.
- Modify `components/inventory/inventory-manager.tsx`: mobile card renderer wired to the existing state/actions.
- Modify `components/quote-form/formula-results.tsx`: dedicated interactive Formula choice class.
- Modify `components/quote-form/quote-form.tsx`: mark the top local Save as mobile-redundant.
- Modify `tests/pwa-mobile-ux.test.tsx`: binding CSS token, interaction, shell, and responsive visibility contracts.
- Modify `tests/app-header-ui.test.tsx`: mobile header behavior and Settings active state.
- Modify `tests/inventory-ui.test.tsx`: collapsed/expanded Inventory role behavior.
- Modify `tests/quote-ui.test.tsx`: quote-specific mobile controls.
- Modify `docs/UI-DESIGN-SYSTEM.md`, `docs/UI-PAGES.md`, `docs/PWA-QA.md`, and `PROGRESS.md`: binding rules and actual verification evidence.

---

### Task 1: Shared mobile sizing contract

**Model:** Codex 5.6-Sol high

**Input docs to read first:**
- `docs/UI-DESIGN-SYSTEM.md`
- `docs/superpowers/specs/2026-08-05-app-wide-mobile-inventory-design.md`

**Files:**
- Modify: `tests/pwa-mobile-ux.test.tsx`
- Modify: `app/styles/tokens.css`
- Modify: `app/styles/components.css`

**Interfaces:**
- Produces CSS custom properties `--mobile-tap-target`, `--mobile-input-font-size`, `--mobile-control-font-size`, `--mobile-page-inset`, and `--mobile-layout-gap`.
- Produces the binding mobile control contract consumed by every later task.
- Does not change component markup or desktop computed styles.

- [x] **Step 1: Add failing mobile token and interaction tests**

Add this test beside the existing binding mobile rules in `tests/pwa-mobile-ux.test.tsx`, and update the existing 16px/44px assertions to expect the new CSS variables instead of duplicated literals:

```tsx
it('defines app-wide mobile size tokens and applies them to shared controls', () => {
  const tokens = readFileSync('app/styles/tokens.css', 'utf8')
  const css = readFileSync('app/styles/components.css', 'utf8')
  const mobile = getMediaBlock(css, 'max-width: 1023.98px')
  const narrow = getMediaBlock(css, 'max-width: 720px')

  expect(tokens).toContain('--mobile-tap-target: 44px')
  expect(tokens).toContain('--mobile-input-font-size: 16px')
  expect(tokens).toContain('--mobile-control-font-size: 14px')
  expect(tokens).toContain('--mobile-page-inset: 16px')
  expect(tokens).toContain('--mobile-layout-gap: 16px')

  for (const selector of [
    '.pbc-btn',
    '.pbc-tab',
    '.pbc-toggle button',
    'button.pbc-dropdownitem',
    'a.pbc-dropdownitem',
    '.pbc-checkfield',
    '.pbc-stocktoggle',
    '.pbc-statuscontrol',
    '.pbc-monthselect select',
    '.pbc-back',
    '.pbc-detailmore summary',
    '.pbc-detaildesc summary',
  ]) {
    expect(mobile).toContain(selector)
  }

  expect(mobile).toContain('min-height: var(--mobile-tap-target)')
  expect(mobile).toContain('font-size: var(--mobile-input-font-size)')
  expect(mobile).toContain('font-size: var(--mobile-control-font-size)')
  expect(narrow).toContain('padding: 22px var(--mobile-page-inset) 48px')
  expect(narrow).toContain('padding: var(--mobile-page-inset)')
})
```

In the pre-existing `defines the binding mobile input...` test, replace exact `font-size: 16px` expectations with `font-size: var(--mobile-input-font-size)` and replace the compact-button literal `44px` expectations with `var(--mobile-tap-target)`.

- [x] **Step 2: Run the test and confirm RED**

Run:

```powershell
npm.cmd run test:run -- tests/pwa-mobile-ux.test.tsx
```

Expected: FAIL because the five mobile tokens and expanded selector contract do not exist.

- [x] **Step 3: Add the exact mobile tokens**

Append to the `:root` block in `app/styles/tokens.css`:

```css
  /* ── 모바일 상호작용 / 레이아웃 ───────────────────────── */
  --mobile-tap-target: 44px;
  --mobile-input-font-size: 16px;
  --mobile-control-font-size: 14px;
  --mobile-page-inset: 16px;
  --mobile-layout-gap: 16px;
```

- [x] **Step 4: Apply the tokens only inside current mobile media blocks**

In `app/styles/components.css`, replace the current mobile input and compact target literals and extend the `max-width: 1023.98px` block with:

```css
  .pbc-input,
  .pbc-textarea,
  .pbc-tableinput,
  .pbc-search__input,
  .pbc-statuscontrol,
  .pbc-rate__money input,
  .pbc-ptable__money input,
  .pbc-monthselect select {
    font-size: var(--mobile-input-font-size);
  }

  .pbc-btn,
  .pbc-tab,
  .pbc-toggle button,
  button.pbc-dropdownitem,
  a.pbc-dropdownitem,
  .pbc-checkfield,
  .pbc-stocktoggle,
  .pbc-statuscontrol,
  .pbc-monthselect select,
  .pbc-back,
  .pbc-detailmore summary,
  .pbc-detaildesc summary {
    min-height: var(--mobile-tap-target);
  }

  .pbc-btn,
  .pbc-tab,
  .pbc-toggle button,
  button.pbc-dropdownitem,
  a.pbc-dropdownitem,
  .pbc-checkfield,
  .pbc-stocktoggle,
  .pbc-back,
  .pbc-detailmore summary,
  .pbc-detaildesc summary {
    font-size: var(--mobile-control-font-size);
  }

  .pbc-iconbtn,
  .pbc-iconbtn--compact,
  .pbc-btn--sm {
    min-width: var(--mobile-tap-target);
    min-height: var(--mobile-tap-target);
  }
```

In the `max-width: 720px` block, change the existing page and card declarations to:

```css
  .pbc-page { padding: 22px var(--mobile-page-inset) 48px; }
  .pbc-card--pad { padding: var(--mobile-page-inset); }
```

Do not change the Jobs calendar font sizes or its `44px` job-cell geometry.

- [x] **Step 5: Run focused tests and static checks**

Run:

```powershell
npm.cmd run test:run -- tests/pwa-mobile-ux.test.tsx tests/jobs-ui.test.tsx
npm.cmd run typecheck
npm.cmd run lint -- tests/pwa-mobile-ux.test.tsx
git diff --check
```

Expected: all commands PASS; the Jobs calendar contract remains unchanged.

- [x] **Step 6: Commit the shared contract**

```powershell
git add -- app/styles/tokens.css app/styles/components.css tests/pwa-mobile-ux.test.tsx
git commit -m "style: define app-wide mobile control sizing"
```

---

### Task 2: Mobile shell, navigation, and topbar behavior

**Model:** Codex 5.6-Sol high

**Input docs to read first:**
- `docs/UI-DESIGN-SYSTEM.md`
- `docs/PWA-QA.md`

**Files:**
- Modify: `tests/app-header-ui.test.tsx`
- Modify: `tests/pwa-mobile-ux.test.tsx`
- Modify: `components/layout/app-header.tsx`
- Modify: `app/styles/components.css`

**Interfaces:**
- Reuses existing `signOut` server action without changing its signature.
- Produces `.pbc-mobile-header__brandrow` and `.pbc-mobile-signout` markup.
- Changes `isNavItemActive('/settings', pathname)` to accept `/settings/*`.
- Produces an auto-column mobile navigation grid for both role counts.

- [x] **Step 1: Make hydration state controllable in the header test**

Extend `headerState` in `tests/app-header-ui.test.tsx`:

```tsx
const headerState = vi.hoisted(() => ({
  collapsed: false,
  hydrated: false,
  pathname: '/quotes/new',
}))
```

Update the `useSyncExternalStore` mock:

```tsx
useSyncExternalStore: vi.fn((
  _subscribe: unknown,
  _getSnapshot: unknown,
  getServerSnapshot?: () => unknown
) => getServerSnapshot?.name === 'getServerHydratedSnapshot'
  ? headerState.hydrated
  : headerState.collapsed),
```

- [x] **Step 2: Add failing header behavior tests**

Add:

```tsx
it('renders an accessible mobile sign-out action', () => {
  const markup = renderToStaticMarkup(createElement(AppHeader, { userProfile }))
  const mobileHeader = markup.slice(markup.indexOf('<header'), markup.indexOf('</header>'))

  expect(mobileHeader).toContain('pbc-mobile-header__brandrow')
  expect(mobileHeader).toContain('pbc-mobile-signout')
  expect(mobileHeader).toContain('aria-label="Sign out"')
  expect(mobileHeader).toContain('<form')
})

it('marks Settings active for descendant routes after hydration', () => {
  headerState.hydrated = true
  headerState.pathname = '/settings/users'
  const markup = renderToStaticMarkup(createElement(AppHeader, { userProfile }))
  const mobileHeader = markup.slice(markup.indexOf('<header'), markup.indexOf('</header>'))

  expect(mobileHeader).toMatch(/<a(?=[^>]*href="\/settings")(?=[^>]*class="[^"]*is-active)[^>]*>/)
  headerState.hydrated = false
})
```

Add a CSS contract test to `tests/pwa-mobile-ux.test.tsx`:

```tsx
it('keeps the mobile shell full-width and role navigation auto-sized', () => {
  const css = readFileSync('app/styles/components.css', 'utf8')
  const mobile = getMediaBlock(css, 'max-width: 1023.98px')
  const narrow = getMediaBlock(css, 'max-width: 560px')

  expect(css).toMatch(/\.pbc-mobile-nav\s*{[^}]*grid-auto-flow:\s*column[^}]*grid-auto-columns:\s*minmax\(0,\s*1fr\)/)
  expect(mobile).toMatch(/\.pbc-route-progress\s*{[^}]*inset-inline-start:\s*0/)
  expect(mobile).toMatch(/\.pbc-topbar\s*{[^}]*position:\s*static/)
  expect(mobile).toMatch(/\.pbc-topbar__right\s*{[^}]*flex-wrap:\s*wrap/)
  expect(narrow).toMatch(/\.pbc-mobile-header__brandrow\s*{[^}]*width:\s*100%/)
})
```

Update the old fixed-five-column expectations in the same file to require
`grid-auto-flow: column` and `grid-auto-columns: minmax(0, 1fr)` instead of
`repeat(5, ...)`.

- [x] **Step 3: Run the tests and confirm RED**

```powershell
npm.cmd run test:run -- tests/app-header-ui.test.tsx tests/pwa-mobile-ux.test.tsx
```

Expected: FAIL because mobile sign-out, descendant Settings matching, automatic columns, static topbar, and full-width progress are absent.

- [x] **Step 4: Implement Settings descendant matching**

Change only the Settings branch in `isNavItemActive`:

```tsx
if (href === '/settings') {
  return pathname === '/settings' || pathname.startsWith('/settings/')
}
```

- [x] **Step 5: Add the mobile sign-out to the brand row**

Replace the current standalone mobile brand link with this structure inside
`.pbc-mobile-header__inner`:

```tsx
<div className="pbc-mobile-header__brandrow">
  <IntentLink href={roleHome} className="pbc-mobile-header__brand">
    <span className="pbc-brand__mark !h-9 !w-9 !text-sm">P</span>
    <span className="text-sm font-extrabold text-[var(--foreground)]">PBC Quote</span>
  </IntentLink>
  <form action={signOut}>
    <button
      type="submit"
      aria-label="Sign out"
      title="Sign out"
      className="pbc-iconbtn pbc-mobile-signout"
    >
      {Icons.signOut({ size: 18 })}
    </button>
  </form>
</div>
```

Keep the existing role-filtered mobile navigation immediately after this row.

- [x] **Step 6: Implement the shell CSS overrides**

Change the base mobile header/navigation declarations to:

```css
.pbc-mobile-header__brandrow { display: flex; flex-shrink: 0; align-items: center; justify-content: space-between; gap: 8px; }
.pbc-mobile-header__brand { display: flex; min-height: var(--mobile-tap-target); align-items: center; gap: 10px; }
.pbc-mobile-nav { display: grid; min-width: 0; grid-auto-flow: column; grid-auto-columns: minmax(0, 1fr); gap: 4px; }
.pbc-mobile-signout { flex-shrink: 0; }
```

Add to `max-width: 1023.98px`:

```css
  .pbc-route-progress { inset-inline-start: 0; }
  .pbc-topbar { position: static; }
  .pbc-topbar__right { min-width: 0; flex-wrap: wrap; }
```

Update the `max-width: 720px` `.pbc-topbar__right` declaration so it also has
`flex-wrap: wrap`. In `max-width: 560px`, replace the current brand width rule
with:

```css
  .pbc-mobile-header__brandrow { width: 100%; }
  .pbc-mobile-nav { width: 100%; }
```

Remove the duplicated fixed-five-column rules from both `560px` and
`359.98px` blocks; keep their icon-above-label and 44px target rules.

- [x] **Step 7: Run focused tests and lint**

```powershell
npm.cmd run test:run -- tests/app-header-ui.test.tsx tests/pwa-mobile-ux.test.tsx
npm.cmd run typecheck
npm.cmd run lint -- components/layout/app-header.tsx tests/app-header-ui.test.tsx tests/pwa-mobile-ux.test.tsx
git diff --check
```

Expected: PASS.

- [x] **Step 8: Commit the mobile shell**

```powershell
git add -- components/layout/app-header.tsx app/styles/components.css tests/app-header-ui.test.tsx tests/pwa-mobile-ux.test.tsx
git commit -m "feat: fix mobile app shell navigation"
```

---

### Task 3: Inventory mobile disclosure cards

**Model:** Codex 5.6-Sol high

**Input docs to read first:**
- `docs/UI-PAGES.md` §5 and §7
- `docs/superpowers/specs/2026-08-05-app-wide-mobile-inventory-design.md`
- `docs/CODING-STYLE.md`

**Files:**
- Modify: `tests/inventory-ui.test.tsx`
- Modify: `tests/pwa-mobile-ux.test.tsx`
- Modify: `components/inventory/inventory-manager.tsx`
- Modify: `app/styles/components.css`

**Interfaces:**
- Export `InventoryFormState` so the presentational mobile renderer can be tested with explicit state.
- Export `InventoryMobileList(props: InventoryMobileListProps)` from the existing client module.
- `InventoryManager` remains the only state owner and passes `editingRowId`, `rowEditForm`, pending state, role, and existing callbacks.
- Server action calls and payloads remain exclusively in `InventoryManager`.

- [x] **Step 1: Add a reusable Inventory test fixture and explicit edit form**

At the top of `tests/inventory-ui.test.tsx`, import the new exports and define:

```tsx
import {
  InventoryManager,
  InventoryMobileList,
  type InventoryFormState,
} from '@/components/inventory/inventory-manager'

const mobileItem: InventoryItemRecord = {
  id: '00000000-0000-4000-8000-000000000061',
  name: 'WaterTite',
  category: 'Tools',
  brand: 'Zinsser',
  modelSpecification: null,
  colour: null,
  sizeOrSerial: '10L',
  quantity: '1.00',
  purchaseDate: null,
  usedDate: null,
  usedLocationText: null,
  status: 'in_stock',
  notes: null,
  active: true,
  sourceYear: '2026',
  createdAt: '2026-08-05T00:00:00.000Z',
  updatedAt: '2026-08-05T00:00:00.000Z',
}

const mobileEditForm: InventoryFormState = {
  name: 'WaterTite',
  category: 'Tools',
  brand: 'Zinsser',
  modelSpecification: '',
  colour: '',
  sizeOrSerial: '10L',
  quantity: '1.00',
  purchaseDate: '',
  usedDate: '',
  usedLocationText: '',
  status: 'in_stock',
  notes: '',
}

const mobileCallbacks = {
  onEdit: vi.fn(),
  onChangeEditField: vi.fn(),
  onAddCustomCategory: vi.fn(),
  onSaveEdit: vi.fn(),
  onCancelEdit: vi.fn(),
  onDelete: vi.fn(),
}
```

Add `vi` to the existing Vitest import.

- [x] **Step 2: Add failing collapsed and role-specific expanded tests**

```tsx
it('renders a collapsed mobile card with only the approved summary fields', () => {
  const markup = renderToStaticMarkup(createElement(InventoryMobileList, {
    items: [mobileItem],
    categories: ['Tools'],
    editingRowId: null,
    rowEditForm: mobileEditForm,
    isPending: false,
    role: 'admin',
    ...mobileCallbacks,
  }))

  expect(markup).toContain('class="pbc-inventorymobile')
  expect(markup).toContain('aria-expanded="false"')
  expect(markup).toContain('WaterTite')
  expect(markup).toContain('Category')
  expect(markup).toContain('Tools')
  expect(markup).toContain('Size / Serial')
  expect(markup).toContain('10L')
  expect(markup).not.toContain('Brand / Spec')
  expect(markup).not.toContain('Purchase Date')
  expect(markup).not.toContain('Used Location')
  expect(markup).not.toContain('Save row')
})

it('renders the complete admin editor only while its mobile card is expanded', () => {
  const markup = renderToStaticMarkup(createElement(InventoryMobileList, {
    items: [mobileItem],
    categories: ['Tools'],
    editingRowId: mobileItem.id,
    rowEditForm: mobileEditForm,
    isPending: false,
    role: 'admin',
    ...mobileCallbacks,
  }))

  expect(markup).toContain('aria-expanded="true"')
  for (const label of ['Name', 'Category', 'Brand', 'Model / Specification', 'Colour', 'Size / Serial', 'Quantity', 'Purchase Date', 'Used Date', 'Used Location', 'Status', 'Notes']) {
    expect(markup).toContain(label)
  }
  expect(markup).toContain('aria-label="Save row WaterTite"')
  expect(markup).toContain('aria-label="Cancel row edit WaterTite"')
  expect(markup).toContain('aria-label="Delete WaterTite"')
})

it('limits the expanded supervisor mobile card to movement fields', () => {
  const markup = renderToStaticMarkup(createElement(InventoryMobileList, {
    items: [mobileItem],
    categories: ['Tools'],
    editingRowId: mobileItem.id,
    rowEditForm: mobileEditForm,
    isPending: false,
    role: 'supervisor',
    ...mobileCallbacks,
  }))

  for (const label of ['Quantity', 'Used Date', 'Used Location', 'Status']) {
    expect(markup).toContain(label)
  }
  expect(markup).not.toContain('aria-label="Name for WaterTite"')
  expect(markup).not.toContain('Search or add category')
  expect(markup).not.toContain('aria-label="Delete WaterTite"')
  expect(markup).toContain('aria-label="Save row WaterTite"')
})
```

- [x] **Step 3: Add the failing responsive visibility contract**

Add to `tests/pwa-mobile-ux.test.tsx`:

```tsx
it('switches Inventory from the desktop table to disclosure cards at 720px', () => {
  const css = readFileSync('app/styles/components.css', 'utf8')
  const narrow = getMediaBlock(css, 'max-width: 720px')

  expect(css).toMatch(/\.pbc-inventorymobile\s*{[^}]*display:\s*none/)
  expect(narrow).toMatch(/\.pbc-inventorydesktop\s*{[^}]*display:\s*none/)
  expect(narrow).toMatch(/\.pbc-inventorymobile\s*{[^}]*display:\s*grid/)
  expect(narrow).toContain('overflow-wrap: anywhere')
  expect(narrow).toContain('min-height: var(--mobile-tap-target)')
})
```

- [x] **Step 4: Run the tests and confirm RED**

```powershell
npm.cmd run test:run -- tests/inventory-ui.test.tsx tests/pwa-mobile-ux.test.tsx
```

Expected: FAIL because `InventoryMobileList` and its CSS do not exist.

- [x] **Step 5: Export the form type and define the mobile renderer props**

Change the current form type declaration to:

```tsx
export type InventoryFormState = {
  name: string
  category: string
  brand: string
  modelSpecification: string
  colour: string
  sizeOrSerial: string
  quantity: string
  purchaseDate: string
  usedDate: string
  usedLocationText: string
  status: InventoryStatus
  notes: string
}
```

Add this exact prop type after `InventoryTableProps`:

```tsx
export type InventoryMobileListProps = Omit<InventoryTableProps, 'onToggleStatus'>
```

- [x] **Step 6: Add a compact reusable mobile field helper**

Place this helper above `InventoryMobileList` in the same file:

```tsx
function MobileInventoryField({
  itemName,
  label,
  field,
  value,
  onChange,
  type = 'text',
  inputMode,
}: {
  itemName: string
  label: string
  field: Exclude<keyof InventoryFormState, 'status'>
  value: string
  onChange: (field: keyof InventoryFormState, value: string) => void
  type?: 'text' | 'date'
  inputMode?: 'decimal'
}) {
  return (
    <label className="pbc-field">
      <span className="pbc-field__label">{label}</span>
      <input
        value={value}
        type={type}
        inputMode={inputMode}
        onChange={(event) => onChange(field, event.target.value)}
        className="pbc-input"
        aria-label={`${label} for ${itemName}`}
      />
    </label>
  )
}
```

- [x] **Step 7: Implement `InventoryMobileList` with the approved fields**

Add an exported component next to `InventoryTable`. Its structure must be:

```tsx
export function InventoryMobileList({
  items,
  categories,
  editingRowId,
  rowEditForm,
  isPending,
  onEdit,
  onChangeEditField,
  onAddCustomCategory,
  onSaveEdit,
  onCancelEdit,
  onDelete,
  role,
}: InventoryMobileListProps) {
  const canAdminister = role === 'admin'
  const canSaveEdit = Boolean(rowEditForm.name.trim())
    && Number.isFinite(Number(rowEditForm.quantity))
    && Number(rowEditForm.quantity) >= 0

  return (
    <div className="pbc-inventorymobile" role="list">
      {items.map((item) => {
        const isEditing = editingRowId === item.id
        const editorId = `inventory-mobile-editor-${item.id}`
        const itemClass = [
          'pbc-inventorymobile__item',
          item.status === 'out' ? 'is-out' : '',
        ].filter(Boolean).join(' ')

        return (
          <article key={item.id} className={itemClass} role="listitem">
            <button
              type="button"
              className="pbc-inventorymobile__summary"
              aria-expanded={isEditing}
              aria-controls={editorId}
              onClick={() => isEditing ? onCancelEdit() : onEdit(item)}
            >
              <span className="pbc-inventorymobile__name">{item.name}</span>
              <span className="pbc-inventorymobile__meta">
                <span><small>Category</small><b>{item.category ?? '-'}</b></span>
                <span><small>Size / Serial</small><b>{item.sizeOrSerial ?? '-'}</b></span>
              </span>
              <span className="pbc-inventorymobile__chevron" aria-hidden="true">
                {Icons.arrowDown({ size: 16 })}
              </span>
            </button>

            {isEditing ? (
              <div id={editorId} className="pbc-inventorymobile__editor">
                <div className="pbc-inventorymobile__fields">
                  {canAdminister ? (
                    <>
                      <MobileInventoryField itemName={item.name} label="Name" field="name" value={rowEditForm.name} onChange={onChangeEditField} />
                      <div className="pbc-field">
                        <span className="pbc-field__label">Category</span>
                        <CategoryPicker
                          value={rowEditForm.category}
                          categories={categories}
                          disabled={isPending}
                          onChange={(value) => onChangeEditField('category', value)}
                          onAddCustomCategory={(category) => onAddCustomCategory(category, 'row')}
                        />
                      </div>
                      <MobileInventoryField itemName={item.name} label="Brand" field="brand" value={rowEditForm.brand} onChange={onChangeEditField} />
                      <MobileInventoryField itemName={item.name} label="Model / Specification" field="modelSpecification" value={rowEditForm.modelSpecification} onChange={onChangeEditField} />
                      <MobileInventoryField itemName={item.name} label="Colour" field="colour" value={rowEditForm.colour} onChange={onChangeEditField} />
                      <MobileInventoryField itemName={item.name} label="Size / Serial" field="sizeOrSerial" value={rowEditForm.sizeOrSerial} onChange={onChangeEditField} />
                    </>
                  ) : null}

                  <MobileInventoryField itemName={item.name} label="Quantity" field="quantity" value={rowEditForm.quantity} onChange={onChangeEditField} inputMode="decimal" />
                  {canAdminister ? <MobileInventoryField itemName={item.name} label="Purchase Date" field="purchaseDate" value={rowEditForm.purchaseDate} onChange={onChangeEditField} type="date" /> : null}
                  <MobileInventoryField itemName={item.name} label="Used Date" field="usedDate" value={rowEditForm.usedDate} onChange={onChangeEditField} type="date" />
                  <MobileInventoryField itemName={item.name} label="Used Location" field="usedLocationText" value={rowEditForm.usedLocationText} onChange={onChangeEditField} />

                  <div className="pbc-field">
                    <span className="pbc-field__label">Status</span>
                    <label className="pbc-input pbc-statuscontrol">
                      <input
                        type="checkbox"
                        checked={rowEditForm.status === 'out'}
                        onChange={(event) => onChangeEditField('status', event.target.checked ? 'out' : 'in_stock')}
                        disabled={isPending}
                        aria-label={`Mark out ${item.name} while editing`}
                        className="pbc-checkbox"
                      />
                      <span>{rowEditForm.status === 'out' ? 'Out' : 'In stock'}</span>
                    </label>
                  </div>

                  {canAdminister ? (
                    <label className="pbc-field pbc-inventorymobile__notes">
                      <span className="pbc-field__label">Notes</span>
                      <textarea
                        value={rowEditForm.notes}
                        onChange={(event) => onChangeEditField('notes', event.target.value)}
                        className="pbc-textarea"
                        aria-label={`Notes for ${item.name}`}
                      />
                    </label>
                  ) : null}
                </div>

                <div className="pbc-inventorymobile__actions">
                  <button type="button" onClick={onSaveEdit} disabled={isPending || !canSaveEdit} aria-label={`Save row ${item.name}`} className="pbc-btn pbc-btn--primary">Save</button>
                  <button type="button" onClick={onCancelEdit} disabled={isPending} aria-label={`Cancel row edit ${item.name}`} className="pbc-btn pbc-btn--ghost">Cancel</button>
                  {canAdminister ? <button type="button" onClick={() => onDelete(item.id)} disabled={isPending} aria-label={`Delete ${item.name}`} className="pbc-btn pbc-btn--danger">Delete</button> : null}
                </div>
              </div>
            ) : null}
          </article>
        )
      })}
    </div>
  )
}
```

Do not call a server action, add a confirmation step, or maintain separate form
state inside this component.

- [x] **Step 8: Wire both renderers to the same manager state**

Add `pbc-inventorydesktop` to the existing table wrapper:

```tsx
<div className="pbc-tablewrap pbc-inventorydesktop">
```

Immediately after the existing `InventoryTable` inside each category section,
render `InventoryMobileList` with the same values and callbacks except
`onToggleStatus`, which remains desktop-only:

```tsx
<InventoryMobileList
  items={group.items}
  categories={categories}
  editingRowId={editingRowId}
  rowEditForm={rowEditForm}
  isPending={isPending}
  onEdit={startEdit}
  onChangeEditField={setRowField}
  onAddCustomCategory={addCustomCategory}
  onSaveEdit={saveRowEdit}
  onCancelEdit={resetRowEdit}
  onDelete={removeItem}
  role={role}
/>
```

- [x] **Step 9: Add Inventory card CSS and the 720px mode switch**

Add base styles near the existing Inventory table/category styles:

```css
.pbc-inventorymobile { display: none; }
.pbc-inventorymobile__item { min-width: 0; border: 1px solid var(--border); border-radius: var(--r-md); background: var(--surface); box-shadow: var(--shadow-soft); }
.pbc-inventorymobile__item.is-out { border-color: color-mix(in srgb, var(--danger) 34%, var(--border)); background: var(--danger-soft); }
.pbc-inventorymobile__summary { display: grid; width: 100%; min-width: 0; grid-template-columns: minmax(0, 1fr) auto; gap: 8px; padding: 12px; border: 0; border-radius: inherit; background: transparent; text-align: left; color: var(--foreground); }
.pbc-inventorymobile__name { min-width: 0; font-size: 15px; font-weight: 800; overflow-wrap: anywhere; }
.pbc-inventorymobile__meta { grid-column: 1; display: grid; min-width: 0; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.pbc-inventorymobile__meta span { min-width: 0; }
.pbc-inventorymobile__meta small { display: block; color: var(--muted-2); font-size: 12px; font-weight: 700; }
.pbc-inventorymobile__meta b { display: block; margin-top: 2px; color: var(--muted); font-size: 14px; overflow-wrap: anywhere; }
.pbc-inventorymobile__chevron { grid-column: 2; grid-row: 1 / span 2; align-self: center; color: var(--primary); transition: transform .16s ease; }
.pbc-inventorymobile__summary[aria-expanded="true"] .pbc-inventorymobile__chevron { transform: rotate(180deg); }
.pbc-inventorymobile__item.is-out .pbc-inventorymobile__name,
.pbc-inventorymobile__item.is-out .pbc-inventorymobile__meta b { text-decoration: line-through; text-decoration-thickness: 2px; }
.pbc-inventorymobile__editor { padding: 0 12px 12px; border-top: 1px solid var(--border-soft); }
.pbc-inventorymobile__fields { display: grid; gap: 12px; padding-top: 12px; }
.pbc-inventorymobile__notes { min-width: 0; }
.pbc-inventorymobile__actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
```

Add inside `max-width: 720px`:

```css
  .pbc-inventorydesktop { display: none; }
  .pbc-inventorymobile { display: grid; min-width: 0; max-width: 100%; gap: var(--mobile-layout-gap); }
  .pbc-inventorymobile__summary { min-height: var(--mobile-tap-target); }
  .pbc-inventorymobile__name,
  .pbc-inventorymobile__meta b { overflow-wrap: anywhere; }
  .pbc-inventorymobile__actions .pbc-btn { flex: 1 1 96px; justify-content: center; }
```

- [x] **Step 10: Run focused Inventory tests and checks**

```powershell
npm.cmd run test:run -- tests/inventory-ui.test.tsx tests/pwa-mobile-ux.test.tsx tests/inventory-actions.test.ts tests/inventory-actions-supabase.test.ts
npm.cmd run typecheck
npm.cmd run lint -- components/inventory/inventory-manager.tsx tests/inventory-ui.test.tsx tests/pwa-mobile-ux.test.tsx
git diff --check
```

Expected: PASS. Fix every failure before continuing.

- [x] **Step 11: Commit Inventory mobile cards**

```powershell
git add -- components/inventory/inventory-manager.tsx app/styles/components.css tests/inventory-ui.test.tsx tests/pwa-mobile-ux.test.tsx
git commit -m "feat: add mobile inventory cards"
```

---

### Task 4: Quote-specific mobile interaction refinements

**Model:** Codex 5.6-Sol high

**Input docs to read first:**
- `docs/UI-QUOTE-FORM.md`
- `docs/UI-DESIGN-SYSTEM.md`

**Files:**
- Modify: `tests/quote-ui.test.tsx`
- Modify: `tests/pwa-mobile-ux.test.tsx`
- Modify: `components/quote-form/formula-results.tsx`
- Modify: `components/quote-form/quote-form.tsx`
- Modify: `app/styles/components.css`

**Interfaces:**
- Produces `.pbc-formulachoice`, which applies only to interactive Low / High labels.
- Produces `.pbc-topbar__local-save`, which identifies only the local Save duplicated by the mobile total bar.
- Does not change calculation state, save payloads, Jobber sync availability, or navigation guards.

- [x] **Step 1: Add failing quote markup tests**

Add to `tests/quote-ui.test.tsx`:

```tsx
it('marks Formula Low and High labels as mobile-sized choices', () => {
  const markup = renderToStaticMarkup(createElement(FormulaResults, {
    results: [{
      formulaNum: 1,
      name: 'Standard labour',
      total: new Decimal('500.00'),
    }],
    selectedMin: 1,
    selectedMax: 1,
    onSelectedMinChange: vi.fn(),
    onSelectedMaxChange: vi.fn(),
  }))

  expect(markup.match(/pbc-formulachoice/g)).toHaveLength(2)
})

it('marks only the top local Save as redundant on mobile', () => {
  const markup = renderToStaticMarkup(createElement(QuoteForm, {
    settings: quoteRecord.pricingSettingsSnapshot,
    areas: [],
    productServices: [],
    quoteLineTemplates: [],
    initialQuote: quoteRecord,
  }))
  const topbar = markup.slice(markup.indexOf('pbc-topbar'), markup.indexOf('pbc-page'))
  const mobileBar = markup.slice(markup.indexOf('pbc-mobile-totalbar'))

  expect(topbar).toContain('pbc-topbar__local-save')
  expect(topbar).toContain('Save &amp; Sync to Jobber')
  expect(mobileBar).toContain('Save')
  expect(mobileBar).not.toContain('pbc-topbar__local-save')
})
```

Add this import beside the other quote-form component imports:

```tsx
import { FormulaResults } from '@/components/quote-form/formula-results'
```

Reuse the file's existing `Decimal`, `quoteRecord`, and Vitest imports exactly
as shown above.

Add to `tests/pwa-mobile-ux.test.tsx`:

```tsx
it('expands Formula choices and hides only the redundant top Save on narrow screens', () => {
  const css = readFileSync('app/styles/components.css', 'utf8')
  const mobile = getMediaBlock(css, 'max-width: 1023.98px')
  const narrow = getMediaBlock(css, 'max-width: 720px')

  expect(mobile).toMatch(/\.pbc-formulachoice\s*{[^}]*min-height:\s*var\(--mobile-tap-target\)/)
  expect(narrow).toMatch(/\.pbc-topbar__local-save\s*{[^}]*display:\s*none/)
})
```

- [x] **Step 2: Run tests and confirm RED**

```powershell
npm.cmd run test:run -- tests/quote-ui.test.tsx tests/pwa-mobile-ux.test.tsx
```

Expected: FAIL because neither class exists.

- [x] **Step 3: Add the Formula choice class without changing radio behavior**

Change both Low and High label class strings in
`components/quote-form/formula-results.tsx` from `pbc-chip ...` to:

```tsx
className={`pbc-chip pbc-formulachoice cursor-pointer border ${isMin ? '' : 'pbc-chip--muted'}`}
```

and:

```tsx
className={`pbc-chip pbc-formulachoice cursor-pointer border ${isMax ? '' : 'pbc-chip--muted'}`}
```

- [x] **Step 4: Mark the top local Save only**

Change the top local-save button in `components/quote-form/quote-form.tsx` to:

```tsx
<button
  type="button"
  onClick={() => saveQuote('local')}
  disabled={isPending}
  className="pbc-btn pbc-btn--primary pbc-topbar__local-save"
>
  {Icons.check({ size: 15 })} {localSaveLabel}
</button>
```

Do not add this class to the bottom mobile Save or Jobber sync button.

- [x] **Step 5: Add exact responsive CSS**

Inside `max-width: 1023.98px`:

```css
  .pbc-formulachoice { min-height: var(--mobile-tap-target); justify-content: center; padding-inline: 16px; font-size: var(--mobile-control-font-size); }
```

Inside `max-width: 720px`:

```css
  .pbc-topbar__local-save { display: none; }
```

- [x] **Step 6: Run focused quote regression tests and checks**

```powershell
npm.cmd run test:run -- tests/quote-ui.test.tsx tests/pwa-mobile-ux.test.tsx tests/quote-actions.test.ts tests/jobber-option-mapping.test.ts
npm.cmd run typecheck
npm.cmd run lint -- components/quote-form/formula-results.tsx components/quote-form/quote-form.tsx tests/quote-ui.test.tsx
git diff --check
```

Expected: PASS with no calculation or save tests changed.

- [x] **Step 7: Commit quote mobile refinements**

```powershell
git add -- components/quote-form/formula-results.tsx components/quote-form/quote-form.tsx app/styles/components.css tests/quote-ui.test.tsx tests/pwa-mobile-ux.test.tsx
git commit -m "style: refine mobile quote interactions"
```

---

### Task 5: Full automated regression verification

**Model:** Codex 5.6-Sol high

**Files:**
- No planned file changes.

**Interfaces:**
- Verifies every prior task against the repository's complete quality gate.

- [x] **Step 1: Run the combined focused suite**

```powershell
npm.cmd run test:run -- tests/pwa-mobile-ux.test.tsx tests/app-header-ui.test.tsx tests/inventory-ui.test.tsx tests/inventory-actions.test.ts tests/inventory-actions-supabase.test.ts tests/quote-ui.test.tsx tests/jobs-ui.test.tsx tests/settings-ui.test.tsx tests/users-ui.test.tsx
```

Expected: PASS.

- [x] **Step 2: Run the complete repository verification command**

```powershell
npm.cmd run verify
```

Expected: `git diff --check`, TypeScript, ESLint, all Vitest files, coverage,
Next production build, and production dependency audit all PASS.

- [x] **Step 3: Stop on any failure**

For a failure, record the exact failing command and first relevant error, write
or strengthen the narrowest regression test when behavior is not already
covered, correct only the owning file from Tasks 1-4, rerun the failing command,
then rerun `npm.cmd run verify`. Do not advance to browser QA until it passes.

- [x] **Step 4: Confirm repository scope**

```powershell
git status --short
git diff --name-only HEAD~4..HEAD
```

Expected: the four commits contain only the plan-owned source and test files
from Tasks 1-4, and the isolated execution worktree is clean. The unrelated
`next-env.d.ts` modification remains only in the original main worktree. Do not
create an empty commit when verification requires no changes.

---

### Task 6: Browser verification at mobile and desktop sizes

**Model:** Codex 5.6-Sol high

**Input docs to read first:**
- `docs/PWA-QA.md`
- `docs/UI-DESIGN-SYSTEM.md`

**Files:**
- Modify only when a reproducible failure requires a regression fix in a Task 1-4 owning file.

**Interfaces:**
- Uses the existing authenticated local app at `http://192.168.1.167:3000`.
- Does not save, delete, import, sync, refresh external data, or otherwise mutate user data during visual QA.

- [x] **Step 1: Open or reuse the local authenticated browser session**

Use `browser:control-in-app-browser`. Reuse the existing Inventory/Quotes tab
when available. Start the development server only if the current URL does not
respond; use the repository's existing `npm.cmd run dev -- --hostname 0.0.0.0`
command and keep it in the background.

- [x] **Step 2: Verify the mobile shell at `375x812`**

Check admin navigation, the 44px mobile sign-out button, active Settings state
on `/settings/users`, full-width route progress, wrapping Settings actions, and
non-sticky page topbars. Measure:

```js
({
  viewport: document.documentElement.clientWidth,
  documentWidth: document.documentElement.scrollWidth,
  overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
})
```

Expected: `overflow === 0`.

Execution evidence: at hydrated `375x812`, Settings was active on
`/settings/users` and `[data-route-progress]` was visible at opacity `1`, height
`3px`, left `0`, and width `360px`, exactly matching the `360px` layout viewport.

- [x] **Step 3: Verify all primary routes at `375x812`**

Visit in this order, resolving the first existing quote/job detail link from its
list rather than hard-coding an ID:

1. `/quotes`
2. `/quotes/new`
3. first `/quotes/[id]`
4. first `/quotes/[id]/edit`
5. `/settings`
6. `/settings/users`
7. `/jobs`
8. first `/jobs/[jobberJobId]`
9. `/inventory`

For each route, require document overflow `0`. Dense Settings, Users, and job
expense table wrappers may report an internal `scrollWidth` larger than their
client width; their parent document may not.

- [x] **Step 4: Verify Inventory interaction without mutation at `375x812`**

On `/inventory`:

- confirm each collapsed card visibly contains only Name, Category, and Size / Serial;
- confirm long names wrap inside the card;
- open one normal item and confirm the editor remains inside the viewport;
- cancel without saving;
- open one Out item and confirm danger styling and strike-through;
- focus search and filter controls and confirm computed font size `16px`;
- confirm visible card/button heights are at least `44px`;
- confirm `.pbc-inventorydesktop` is hidden and `.pbc-inventorymobile` is displayed;
- confirm the category badge and CSV controls wrap without overflow.

Do not press Save, Delete, Import, Refresh, or Jobber Sync.

Execution evidence: hydrated `375x812` search changed `112 → 1 → 112`; the
card changed `false → true`, mounted its editor at top `453.5px` within the
`812px` viewport, and Cancel restored `false` with editor count `0`.

- [x] **Step 5: Repeat the route and Inventory measurements at `390x844`**

Expected for every route: document overflow `0`, no topbar hidden behind the
app header, no clipped primary action, and no new console warning/error.

- [x] **Step 6: Verify desktop preservation at `1280x900`**

On `/inventory`, require:

- `.pbc-inventorydesktop` is visible;
- `.pbc-inventorymobile` is hidden;
- the twelve headers are Name, Category, Brand / Spec, Colour, Size / Serial,
  Qty, Purchase Date, Used Date, Used Location, Stock, Notes, Actions;
- existing inline Edit, Save, Cancel, Stock, and Delete controls remain present.

Spot-check Quotes, Settings, and Jobs to confirm desktop topbars remain sticky
and desktop control density is unchanged.

Execution evidence: at `1280x900`, desktop/mobile display modes and the exact
twelve headers passed; Edit exposed Save and Cancel, Cancel restored the row,
Stock and Delete remained present, and document overflow was `0`.

- [x] **Step 7: Inspect browser logs and reset the viewport**

Expected: zero new console errors and zero new warnings caused by the changed
components. Reset the temporary viewport override before finalizing the tab.

- [x] **Step 8: Correct any browser failure before advancing**

For each reproducible failure, add the narrowest CSS/markup contract to the
owning test file, confirm it fails, implement the minimal correction in the
owning component/CSS file, rerun that focused test, and repeat the failed
viewport measurement. Commit a correction with:

```powershell
# Shell/header regression:
git add -- tests/pwa-mobile-ux.test.tsx tests/app-header-ui.test.tsx components/layout/app-header.tsx app/styles/components.css

# Inventory regression:
git add -- tests/pwa-mobile-ux.test.tsx tests/inventory-ui.test.tsx components/inventory/inventory-manager.tsx app/styles/components.css

# Quote regression:
git add -- tests/pwa-mobile-ux.test.tsx tests/quote-ui.test.tsx components/quote-form/formula-results.tsx components/quote-form/quote-form.tsx app/styles/components.css

git commit -m "fix: resolve mobile viewport regression"
```

Run only the one `git add` command matching the owning regression, then inspect
`git diff --cached --name-only` before committing. Never stage `next-env.d.ts`.

---

### Task 7: Documentation, final verification, and handoff

**Model:** Codex 5.6-Sol high

**Files:**
- Modify: `docs/UI-DESIGN-SYSTEM.md`
- Modify: `docs/UI-PAGES.md`
- Modify: `docs/PWA-QA.md`
- Modify: `PROGRESS.md`
- Modify: `docs/superpowers/plans/2026-08-05-app-wide-mobile-inventory.md` (check completed steps)

**Interfaces:**
- Makes the new CSS/mobile behavior binding for future work.
- Records only commands and browser measurements actually completed.

- [x] **Step 1: Update the design-system mobile rules**

Add these binding rules to `docs/UI-DESIGN-SYSTEM.md`:

```markdown
- Shared mobile interaction values come from `app/styles/tokens.css`: 44px minimum target, 16px input text, 14px interactive text, and 16px narrow insets/gaps.
- At `max-width: 1023.98px`, default buttons, tabs, toggles, actionable dropdown rows, check rows, stock controls, back links, and disclosure summaries must expose at least a 44px target.
- Page topbars are non-sticky on the mobile shell and their action groups wrap; the app header remains the only sticky top navigation surface.
- Dense Settings/Users/expense tables may scroll inside `.pbc-tablewrap`, but the document must never scroll horizontally.
- At `max-width: 720px`, Inventory uses disclosure cards; collapsed cards show only Name, Category, and Size / Serial. Desktop retains the twelve-column table.
```

- [x] **Step 2: Update page behavior documentation**

In `docs/UI-PAGES.md` §5, document the exact Inventory collapsed fields,
tap-to-expand behavior, one-open-card rule, admin full editor, supervisor
movement-only editor, and desktop table preservation. In §7, document
auto-sized role navigation, mobile sign-out, wrapping/non-sticky topbars, and
Settings descendant active state.

- [x] **Step 3: Record actual QA evidence**

In `docs/PWA-QA.md`, append a dated `2026-08-05 app-wide mobile verification`
section containing the exact completed viewport sizes, route list, overflow
measurements, console result, desktop Inventory result, and the explicit note
that supervisor-only editor rendering was verified by automated tests when no
supervisor browser session was used. Do not mark iPhone physical-device checks
complete unless they were actually performed.

In `PROGRESS.md`, append a completed summary naming the Inventory card behavior,
shared control/shell changes, focused test totals, full verification results,
browser viewports, and commit IDs produced during execution.

Supplemental evidence: commit `b93c132` verifies all four supervisor movement
fields and the absence of every admin-only field plus Delete. Browser console
errors/warnings were `0/0`; no physical iPhone QA was performed.

- [x] **Step 4: Mark this plan's completed checkboxes**

Change each executed `- [ ]` to `- [x]`. Leave a checkbox open only when the
corresponding command or browser check was not performed, and explain that
specific omission in `docs/PWA-QA.md`.

- [x] **Step 5: Run final verification after documentation changes**

```powershell
npm.cmd run verify
git diff --check
git status --short
```

Expected: verification PASS; only the documentation/plan files are uncommitted,
plus the preserved unrelated `next-env.d.ts` modification.

- [x] **Step 6: Commit documentation and evidence**

```powershell
git add -- docs/UI-DESIGN-SYSTEM.md docs/UI-PAGES.md docs/PWA-QA.md PROGRESS.md docs/superpowers/plans/2026-08-05-app-wide-mobile-inventory.md
git commit -m "docs: record app-wide mobile UX"
```

- [x] **Step 7: Confirm final repository state**

```powershell
git status --short --branch
git log -7 --oneline
```

Expected: feature commits are on the execution branch, no task-owned file is
uncommitted, and `next-env.d.ts` remains the only pre-existing main-worktree
modification when returning to or merging into main.

---

## Execution handoff

Plan execution must start in an isolated worktree created with
`superpowers:using-git-worktrees`. Implement tasks in order. Each focused test
must be observed failing before its implementation, and every failure must pass
before the next task begins.
