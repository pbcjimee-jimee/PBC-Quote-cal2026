# Inventory Mobile Add Disclosure and Colour Summary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hide the admin Inventory creation form behind an inline mobile Add disclosure and show each saved item's stored Colour in the collapsed mobile card.

**Architecture:** Keep one `InventoryManager` form state and one mounted creation section for both responsive modes. CSS alone hides the closed form at `max-width: 720px`, while desktop keeps the existing always-visible form; `InventoryMobileList` reads the existing normalized `item.colour` value without changing persistence or permissions.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript strict mode, Tailwind CSS 4 plus `app/styles/components.css`, Vitest, React DOM hydration test utilities.

## Global Constraints

- The mobile interaction breakpoint is exactly `max-width: 720px`.
- Admin receives the Add trigger and creation form; supervisor receives neither.
- Desktop keeps the existing always-visible creation form and twelve-column table.
- Collapsed mobile cards show Name, Category, Size / Serial, and Colour.
- Missing or empty Colour displays `-`; do not infer, backfill, or correct stored data.
- Supervisor can read Colour but cannot edit it.
- Reuse the existing `form`, `createInventoryItem`, validation, message, error, and `isPending` state; do not render a duplicate mobile form.
- Creation failure preserves the open form and entered values; success resets and closes; Cancel resets and closes without a Server Action.
- Keep the saved-item stable hidden editor target, one-open-card rule, failed-update preservation, and role-specific editor fields unchanged.
- Preserve 44px mobile targets, 16px mobile inputs, long-value wrapping, and zero document-level horizontal overflow at 375px and 390px.
- Do not change Supabase schema, migrations, Server Actions, RLS, Jobber, quotes, pricing, service-worker caching, dependencies, or Vercel configuration.
- Do not create or delete browser-QA rows when localhost is connected to production Supabase; creation success/failure is covered by hydrated tests unless a disposable local Supabase is explicitly used.
- Preserve the existing uncommitted `next-env.d.ts` change and never stage it.
- For every new behavior, add the covering test and run it to observe RED before
  production changes. Existing failure-preservation behavior may be captured as
  a GREEN characterization assertion in the same interaction suite; the new
  trigger, pending-control, Cancel, and success-close assertions must be RED.
- Every implementer and reviewer subagent must run with
  `model = "gpt-5.6-sol"` and `model_reasoning_effort = "high"`, overriding any
  generic lower-cost routing in the execution skill.
- Before creating the isolated feature worktree, commit this plan and the
  approved design amendment in the original checkout. They must be present in
  the feature branch base; never carry them as untracked or unstaged files.

---

## File Responsibility Map

- `components/inventory/inventory-manager.tsx`
  - render Colour in collapsed mobile summaries;
  - own the mobile Add disclosure state and transitions;
  - reuse the existing creation form and callbacks;
  - expose stable ARIA and CSS hooks.
- `app/styles/components.css`
  - place Colour on a full-width wrapping metadata row;
  - hide the trigger and Cancel action on desktop;
  - show the trigger and Cancel action on mobile;
  - hide only the closed mobile creation section;
  - force the open creation form to one column through 720px.
- `tests/inventory-ui.test.tsx`
  - enforce the four-field mobile summary, null fallback, role boundary, stable Add target, and unchanged desktop table.
- `tests/inventory-hydration.test.tsx`
  - exercise Add toggle, Cancel, pending, failure preservation, and success reset/closure with the real component state.
- `tests/pwa-mobile-ux.test.tsx`
  - enforce the responsive CSS boundary and overflow-safe layout hooks.
- `docs/UI-DESIGN-SYSTEM.md`
  - replace the previous three-field card contract and document the mobile Add disclosure.
- `docs/UI-PAGES.md`
  - document the Inventory user flow and state transitions.
- `PROGRESS.md`
  - record only the completed stable behavior and measured verification evidence.

---

### Task 1: Show stored Colour in every collapsed mobile item card

**Model:** Codex 5.6-Sol high

**Files:**
- Modify: `tests/inventory-ui.test.tsx`
- Modify: `tests/pwa-mobile-ux.test.tsx`
- Modify: `components/inventory/inventory-manager.tsx`
- Modify: `app/styles/components.css`

**Interfaces:**
- Consumes: `InventoryItemRecord.colour: string | null` from `lib/inventory/types.ts`.
- Produces: `.pbc-inventorymobile__colour`, a full-width child of `.pbc-inventorymobile__meta` displaying a stored value or `-`.
- Keeps unchanged: `InventoryMobileListProps`, desktop table columns, expanded editor fields, and all action callbacks.

**Acceptance criteria:**

- Every collapsed mobile card displays stored Colour or `-` for null/empty.
- Long Colour values have a full-width, wrapping, overflow-safe CSS contract.
- Supervisor sees Colour without receiving a Colour edit control.
- The desktop Inventory table still renders exactly twelve headers, including
  Colour.
- Focused UI and mobile CSS tests pass after an observed RED run.

- [ ] **Step 1: Write the failing four-field summary tests**

Change the shared fixture to carry a real colour and extend the existing collapsed-card test:

```tsx
const mobileItem: InventoryItemRecord = {
  // existing fields stay unchanged
  colour: 'Lexicon Quarter Extra Long Colour Name',
  // existing fields stay unchanged
}

expect(markup).toContain(
  '<small>Colour</small><b>Lexicon Quarter Extra Long Colour Name</b>'
)

for (const omitted of [
  'Brand / Spec',
  'Quantity',
  'Purchase Date',
  'Used Date',
  'Used Location',
  'Status',
  'Notes',
  'Save row',
  'Delete',
]) {
  expect(markup).not.toContain(omitted)
}
```

Add a dedicated null/empty fallback test using the existing `mobileCallbacks` and props:

```tsx
it.each([null, ''])('renders missing mobile Colour %s as -', (colour) => {
  const markup = renderToStaticMarkup(createElement(InventoryMobileList, {
    items: [{ ...mobileItem, colour }],
    categories: ['Tools'],
    editingRowId: null,
    rowEditForm: mobileEditForm,
    isPending: false,
    role: 'admin',
    ...mobileCallbacks,
  }))

  expect(markup).toContain('<small>Colour</small><b>-</b>')
})
```

Strengthen the supervisor test so it sees the saved summary but still has no Colour input:

```tsx
expect(markup).toContain(
  '<small>Colour</small><b>Lexicon Quarter Extra Long Colour Name</b>'
)
expect(markup).not.toContain(`aria-label="Colour for ${mobileItem.name}"`)
```

Strengthen the existing admin Manager render test so the desktop contract is
measured rather than assumed:

```tsx
expect(markup).toContain('pbc-inventorydesktop')
expect(markup).toMatch(/<th[^>]*>Colour<\/th>/)
expect(markup.match(/<th\b/g) ?? []).toHaveLength(12)
```

- [ ] **Step 2: Write the failing Colour layout contract**

Extend the Inventory 720px test in `tests/pwa-mobile-ux.test.tsx`:

```tsx
expect(css).toMatch(
  /\.pbc-inventorymobile__colour\s*{[^}]*grid-column:\s*1\s*\/\s*-1[^}]*min-width:\s*0[^}]*max-width:\s*100%[^}]*overflow-wrap:\s*anywhere/
)
expect(css).not.toMatch(
  /\.pbc-inventorymobile__colour\s*{[^}]*(white-space:\s*nowrap|width:\s*\d+px)/
)
```

- [ ] **Step 3: Run the tests and confirm the expected RED state**

Run:

```powershell
npm.cmd run test:run -- tests/inventory-ui.test.tsx tests/pwa-mobile-ux.test.tsx
```

Expected: failures identify the missing collapsed Colour markup, `-` fallback, and `.pbc-inventorymobile__colour` layout rule. Existing saved-card tests must still execute rather than error during setup.

- [ ] **Step 4: Add the minimal Colour summary markup**

Inside the existing `.pbc-inventorymobile__meta` span, after Size / Serial, add:

```tsx
<span className="pbc-inventorymobile__colour">
  <small>Colour</small>
  <b>{item.colour?.trim() || '-'}</b>
</span>
```

Read from `item.colour`, not `rowEditForm.colour`, so unsaved edit values never leak into a collapsed summary.

- [ ] **Step 5: Add the minimal wrapping CSS**

Beside the existing Inventory mobile metadata rules in `app/styles/components.css`, add:

```css
.pbc-inventorymobile__colour {
  grid-column: 1 / -1;
  min-width: 0;
  max-width: 100%;
  overflow-wrap: anywhere;
}
```

Keep the existing `.pbc-inventorymobile__meta b` wrapping rule and chevron grid placement unchanged.

- [ ] **Step 6: Run focused GREEN verification**

Run:

```powershell
npm.cmd run test:run -- tests/inventory-ui.test.tsx tests/pwa-mobile-ux.test.tsx
```

Expected: both files pass, including the existing saved-editor, supervisor, desktop, 44px, and responsive contracts.

- [ ] **Step 7: Commit Task 1 without staging unrelated files**

```powershell
git add -- components/inventory/inventory-manager.tsx app/styles/components.css tests/inventory-ui.test.tsx tests/pwa-mobile-ux.test.tsx
git diff --cached --check
git commit -m "feat: show inventory colour in mobile cards"
```

---

### Task 2: Add the admin-only mobile creation disclosure

**Model:** Codex 5.6-Sol high

**Files:**
- Modify: `tests/inventory-ui.test.tsx`
- Modify: `tests/inventory-hydration.test.tsx`
- Modify: `tests/pwa-mobile-ux.test.tsx`
- Modify: `components/inventory/inventory-manager.tsx`
- Modify: `app/styles/components.css`

**Interfaces:**
- Produces: `INVENTORY_MOBILE_ADD_FORM_ID = 'inventory-mobile-add-form'`.
- Produces: `.pbc-inventoryaddtrigger`, `.pbc-inventoryaddform`, `.pbc-inventoryaddform__fields`, `.pbc-inventoryaddform__actions`, and `.pbc-inventoryaddcancel`.
- Produces: `data-mobile-open="true" | "false"` on the single mounted creation section.
- Consumes: existing `form`, `EMPTY_FORM`, `resetForm`, `saveItem`, `createInventoryItem`, `message`, `error`, and `isPending` behavior.
- Keeps unchanged: `editingRowId`, `rowEditForm`, `resetRowEdit`, saved-card stable editor targets, role checks, action payload schema, and desktop form behavior.

**Acceptance criteria:**

- Admin gets one stable, mounted disclosure target; supervisor gets no trigger
  or creation form.
- Mobile starts closed, toggle preserves draft state, Cancel resets/closes
  without mutation, failure preserves, and success resets/closes.
- Trigger, submit, and Cancel are disabled while creation is pending.
- Desktop creation remains visible and the 640–720px form is one column.
- Hydration, focused Inventory, typecheck, and scoped lint checks pass after the
  new interaction contracts have been observed RED.

- [ ] **Step 1: Write the failing static Add disclosure contract**

Add an admin Manager test in `tests/inventory-ui.test.tsx`:

```tsx
it('renders one stable admin mobile Add disclosure target', () => {
  const markup = renderToStaticMarkup(createElement(InventoryManager, {
    initialItems: [mobileItem],
    role: 'admin',
  }))

  expect(markup).toContain('pbc-inventoryaddtrigger')
  expect(markup).toContain('aria-expanded="false"')
  expect(markup).toContain('aria-controls="inventory-mobile-add-form"')
  expect(markup).toContain('id="inventory-mobile-add-form"')
  expect(markup).toContain('class="pbc-formgroup pbc-inventoryaddform"')
  expect(markup).toContain('data-mobile-open="false"')
  expect(markup.match(/id="inventory-mobile-add-form"/g) ?? []).toHaveLength(1)
})
```

Strengthen the existing supervisor Manager test:

```tsx
expect(markup).not.toContain('pbc-inventoryaddtrigger')
expect(markup).not.toContain('id="inventory-mobile-add-form"')
expect(markup).not.toContain('placeholder="e.g. Weathershield"')
```

Keep the existing assertions that supervisor cannot see Add Item, Import CSV, or Delete.

- [ ] **Step 2: Write the failing responsive visibility contract**

Extend the existing Inventory 720px CSS test:

```tsx
const beforeNarrow = css.slice(0, css.indexOf('@media (max-width: 720px)'))

expect(css).toMatch(/\.pbc-inventoryaddtrigger\s*{[^}]*display:\s*none/)
expect(beforeNarrow).not.toMatch(/\.pbc-inventoryaddform[^}]*display:\s*none/)
expect(narrow).toMatch(/\.pbc-inventoryaddtrigger\s*{[^}]*display:\s*inline-flex/)
expect(narrow).toMatch(
  /\.pbc-inventoryaddform\[data-mobile-open="false"\]\s*{[^}]*display:\s*none/
)
expect(narrow).toMatch(/\.pbc-inventoryaddcancel\s*{[^}]*display:\s*inline-flex/)
expect(narrow).toMatch(
  /\.pbc-inventoryaddform__fields\s*{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s*!important/
)
expect(narrow).toMatch(
  /\.pbc-inventoryaddform__fields\s*>\s*\*\s*{[^}]*grid-column:\s*auto\s*!important/
)
```

The one-column assertions protect the 640–720px range where existing `sm:grid-cols-2` and `sm:col-span-2` utilities are otherwise active.

- [ ] **Step 3: Add hydrated-test selectors before adding production behavior**

In `tests/inventory-hydration.test.tsx`, add:

```tsx
const MOBILE_ADD_FORM_ID = 'inventory-mobile-add-form'

function findAddTrigger(container: TestElement): TestElement | undefined {
  return Array.from(container.querySelectorAll('button')).find((button) => (
    button.getAttribute('aria-controls') === MOBILE_ADD_FORM_ID
  ))
}

function findAddForm(container: TestElement): TestElement | undefined {
  return Array.from(container.querySelectorAll('section')).find((section) => (
    section.getAttribute('id') === MOBILE_ADD_FORM_ID
  ))
}

function findInputByPlaceholder(container: TestElement, placeholder: string): TestElement | undefined {
  return Array.from(container.querySelectorAll('input')).find((input) => (
    input.getAttribute('placeholder') === placeholder
  ))
}

function findButtonByLabel(container: TestElement, label: string): TestElement | undefined {
  return Array.from(container.querySelectorAll('button')).find((button) => (
    button.getAttribute('aria-label') === label
  ))
}
```

- [ ] **Step 4: Write the failing disclosure scaffold interaction test**

Use the existing real `InventoryManager`, custom DOM, and React `act` pattern:

```tsx
it('toggles the mobile Add form and Cancel clears it without a mutation', async () => {
  const { cleanup, document: testDocument } = installTestDom()
  let root: Root | null = null

  try {
    const { createRoot } = await import('react-dom/client')
    const container = testDocument.createElement('div')
    root = createRoot(container as unknown as Element)

    await act(async () => {
      root!.render(createElement(InventoryManager, { initialItems: [item] }))
    })

    const trigger = findAddTrigger(container)
    const addForm = findAddForm(container)
    const nameInput = findInputByPlaceholder(container, 'e.g. Weathershield')
    const colourInput = findInputByPlaceholder(container, 'Monument')
    const quantityInput = findInputByPlaceholder(container, '1')

    expect(trigger?.getAttribute('aria-expanded')).toBe('false')
    expect(addForm?.getAttribute('data-mobile-open')).toBe('false')

    await act(async () => {
      trigger!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(trigger?.getAttribute('aria-expanded')).toBe('true')
    expect(findAddForm(container)).toBe(addForm)

    await act(async () => {
      nameInput!.value = 'Unsaved mobile item'
      nameInput!.dispatchEvent(new Event('input', { bubbles: true }))
      colourInput!.value = 'Deep Ocean Blue'
      colourInput!.dispatchEvent(new Event('input', { bubbles: true }))
    })

    await act(async () => {
      trigger!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(trigger?.getAttribute('aria-expanded')).toBe('false')

    await act(async () => {
      trigger!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(trigger?.getAttribute('aria-expanded')).toBe('true')
    expect(nameInput?.value).toBe('Unsaved mobile item')
    expect(colourInput?.value).toBe('Deep Ocean Blue')

    const cancel = findButtonByLabel(container, 'Cancel adding inventory item')
    await act(async () => {
      cancel!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(trigger?.getAttribute('aria-expanded')).toBe('false')
    expect(addForm?.getAttribute('data-mobile-open')).toBe('false')
    expect(nameInput?.value).toBe('')
    expect(colourInput?.value).toBe('')
    expect(quantityInput?.value).toBe('1')
    expect(inventoryActions.createInventoryItem).not.toHaveBeenCalled()
    expect(inventoryActions.updateInventoryItem).not.toHaveBeenCalled()
    expect(inventoryActions.updateInventoryMovement).not.toHaveBeenCalled()
    expect(inventoryActions.deleteInventoryItem).not.toHaveBeenCalled()
    expect(inventoryActions.importInventoryCSV).not.toHaveBeenCalled()
  } finally {
    if (root) await act(async () => root?.unmount())
    cleanup()
  }
})
```

If the custom DOM requires an explicit `change` event after `input`, dispatch
both, matching the existing saved-editor test.

- [ ] **Step 5: Run the scaffold contracts and confirm the first RED state**

Run:

```powershell
npm.cmd run test:run -- tests/inventory-ui.test.tsx tests/inventory-hydration.test.tsx tests/pwa-mobile-ux.test.tsx
```

Expected: the static, CSS, and hydrated scaffold tests fail because the trigger,
stable target, Cancel path, and responsive hooks do not exist. The hydration
test must first fail its explicit `trigger`/form expectation; it must not report
an unrelated setup or import error.

- [ ] **Step 6: Implement only the mounted disclosure and Cancel scaffold**

Near the form constants and state, add:

```tsx
const INVENTORY_MOBILE_ADD_FORM_ID = 'inventory-mobile-add-form'

const [isMobileAddFormOpen, setIsMobileAddFormOpen] = useState(false)
```

Add a Cancel handler without touching saved-row edit state:

```tsx
function cancelMobileAddForm() {
  resetForm()
  setIsMobileAddFormOpen(false)
}
```

Render the admin-only trigger between `.pbc-panelhead__copy` and `.pbc-panelhead__actions`:

```tsx
{canAdminister ? (
  <button
    type="button"
    className="pbc-btn pbc-btn--primary pbc-inventoryaddtrigger"
    aria-label="Add inventory item"
    aria-expanded={isMobileAddFormOpen}
    aria-controls={INVENTORY_MOBILE_ADD_FORM_ID}
    onClick={() => setIsMobileAddFormOpen((current) => !current)}
  >
    {Icons.plus({ size: 14 })} Add item
  </button>
) : null}
```

Keep one creation section and add only stable responsive attributes:

```tsx
<section
  id={INVENTORY_MOBILE_ADD_FORM_ID}
  className="pbc-formgroup pbc-inventoryaddform"
  data-mobile-open={isMobileAddFormOpen ? 'true' : 'false'}
>
```

Extend the existing field and action classes:

```tsx
<div className="pbc-inventoryaddform__fields mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">

<div className="pbc-inventoryaddform__actions mt-3 flex flex-wrap gap-2">
```

Keep the existing Add Item button, add `aria-label="Save new inventory item"`,
and add the mobile-only Cancel action. Deliberately do not add pending disable
to the trigger or Cancel yet; Step 9 adds a RED test for it.

```tsx
<button
  type="button"
  onClick={cancelMobileAddForm}
  aria-label="Cancel adding inventory item"
  className="pbc-btn pbc-btn--ghost pbc-inventoryaddcancel"
>
  Cancel
</button>
```

Do not add `hidden` or `aria-hidden` to the section because those attributes would also hide the desktop form.

- [ ] **Step 7: Implement the minimal responsive CSS**

Beside the Inventory mobile rules, add the base visibility rules:

```css
.pbc-inventoryaddtrigger,
.pbc-inventoryaddcancel {
  display: none;
}
```

Inside the first existing `@media (max-width: 720px)` block, add:

```css
.pbc-inventoryaddtrigger {
  display: inline-flex;
  flex: 1 0 100%;
  justify-content: center;
}
.pbc-inventoryaddcancel { display: inline-flex; }
.pbc-inventoryaddform[data-mobile-open="false"] { display: none; }
.pbc-inventoryaddform__fields { grid-template-columns: minmax(0, 1fr) !important; }
.pbc-inventoryaddform__fields > * { grid-column: auto !important; min-width: 0; }
.pbc-inventoryaddform__actions .pbc-btn { flex: 1 1 96px; justify-content: center; }
```

The existing shared `.pbc-btn` and input rules already provide 44px targets and 16px input text below `1023.98px`; do not duplicate those tokens.

- [ ] **Step 8: Run the scaffold contracts and confirm GREEN**

Run:

```powershell
npm.cmd run test:run -- tests/inventory-ui.test.tsx tests/inventory-hydration.test.tsx tests/pwa-mobile-ux.test.tsx
```

Expected: the static, CSS, and open/toggle/Cancel contracts pass while existing
saved-card hydration tests remain green.

- [ ] **Step 9: Write pending/failure and success transition tests**

Now that the controls exist, add a failure-preservation test using the existing
`deferred<T>()` helper:

```tsx
const pendingCreate = deferred<{ ok: false; error: string }>()
inventoryActions.createInventoryItem.mockReturnValueOnce(pendingCreate.promise)
```

Render the manager, open the form, set Name to `Preserved new item` and Colour
to `Deep Ocean Blue`, and press the button labeled
`Save new inventory item`. Assert while pending:

```tsx
expect(trigger?.disabled).toBe(true)
expect(save?.disabled).toBe(true)
expect(cancel?.disabled).toBe(true)
expect(trigger?.getAttribute('aria-expanded')).toBe('true')
expect(nameInput?.value).toBe('Preserved new item')
expect(colourInput?.value).toBe('Deep Ocean Blue')
```

Resolve the deferred result and retain the existing failure-preservation
behavior as a characterization assertion:

```tsx
pendingCreate.resolve({ ok: false, error: 'Create failed.' })
await act(async () => {
  await pendingCreate.promise
})

expect(trigger?.disabled).toBe(false)
expect(trigger?.getAttribute('aria-expanded')).toBe('true')
expect(findAddForm(container)?.getAttribute('data-mobile-open')).toBe('true')
expect(nameInput?.value).toBe('Preserved new item')
expect(colourInput?.value).toBe('Deep Ocean Blue')
expect(container.textContent).toContain('Create failed.')
```

Add a success-reset test with this complete returned record:

```tsx
const createdItem: InventoryItemRecord = {
  ...item,
  id: '00000000-0000-4000-8000-000000000072',
  name: 'Created mobile item',
  colour: 'Deep Ocean Blue',
  sizeOrSerial: '15L',
}

inventoryActions.createInventoryItem.mockResolvedValueOnce({
  ok: true,
  data: createdItem,
})
```

After opening the form, entering `Created mobile item` and `Deep Ocean Blue`,
and pressing `Save new inventory item`, assert consumer-visible results:

```tsx
expect(trigger?.getAttribute('aria-expanded')).toBe('false')
expect(findAddForm(container)?.getAttribute('data-mobile-open')).toBe('false')
expect(nameInput?.value).toBe('')
expect(colourInput?.value).toBe('')
expect(quantityInput?.value).toBe('1')
expect(container.textContent).toContain('Inventory item added.')
expect(container.textContent).toContain('Created mobile item')
expect(container.textContent).toContain('Deep Ocean Blue')
```

The external action mock is permitted because these tests exercise the real
component state around the slow server boundary; primary assertions remain on
rendered state and input preservation.

- [ ] **Step 10: Run the transition tests and confirm the second RED state**

Run:

```powershell
npm.cmd run test:run -- tests/inventory-hydration.test.tsx
```

Expected: the tests reach real mounted controls. Pending assertions fail because
the disclosure trigger and Cancel remain enabled, and the success test fails
because the form remains open. Failure preservation itself stays GREEN.

- [ ] **Step 11: Implement pending locks and successful closure**

Add `disabled={isPending}` to both the Add disclosure trigger and mobile Cancel
button. In the existing successful `saveItem` branch, immediately after
`resetForm()`, add:

```tsx
setIsMobileAddFormOpen(false)
```

Do not put this state change in `finally` or the error branch, and do not call
`resetRowEdit()`.

- [ ] **Step 12: Run all Add interaction tests and confirm GREEN**

Run:

```powershell
npm.cmd run test:run -- tests/inventory-ui.test.tsx tests/inventory-hydration.test.tsx tests/pwa-mobile-ux.test.tsx
```

Expected: the static contract plus open/toggle/Cancel, pending failure, and
successful reset tests pass while existing saved-card hydration tests remain
green.

- [ ] **Step 13: Run the complete focused Inventory suite**

Run:

```powershell
npm.cmd run test:run -- tests/inventory-ui.test.tsx tests/inventory-hydration.test.tsx tests/pwa-mobile-ux.test.tsx tests/inventory-actions.test.ts tests/inventory-actions-supabase.test.ts
npm.cmd run typecheck
npm.cmd run lint -- components/inventory/inventory-manager.tsx tests/inventory-ui.test.tsx tests/inventory-hydration.test.tsx tests/pwa-mobile-ux.test.tsx
```

Expected: all focused tests, strict TypeScript, and scoped lint pass with no React hydration warning output.

- [ ] **Step 14: Commit Task 2 without staging unrelated files**

```powershell
git add -- components/inventory/inventory-manager.tsx app/styles/components.css tests/inventory-ui.test.tsx tests/inventory-hydration.test.tsx tests/pwa-mobile-ux.test.tsx
git diff --cached --check
git commit -m "feat: add mobile inventory creation disclosure"
```

---

### Task 3: Synchronize documentation and verify the complete feature

**Model:** Codex 5.6-Sol high

**Files:**
- Modify: `docs/UI-DESIGN-SYSTEM.md`
- Modify: `docs/UI-PAGES.md`
- Modify: `PROGRESS.md`
- Verify only: all Task 1 and Task 2 production/test files

**Interfaces:**
- Consumes: final verified behavior from Tasks 1 and 2.
- Produces: current source-of-truth documentation and reproducible QA evidence.
- Keeps unchanged: historical `docs/superpowers/specs/2026-08-05-app-wide-mobile-inventory-design.md`.

**Acceptance criteria:**

- Current UI source-of-truth docs describe the verified four-field card and
  Add disclosure behavior without rewriting historical specs.
- Focused tests and the full `verify` pipeline exit 0.
- Non-mutating browser QA passes at both mobile widths and desktop, with no
  document overflow or console errors.
- `PROGRESS.md` contains only stable behavior and exact verification evidence,
  with no live inventory or user data.
- The original checkout's unrelated `next-env.d.ts` change remains unstaged and
  unmodified.

- [ ] **Step 1: Update the current design-system contract**

In `docs/UI-DESIGN-SYSTEM.md`, replace the rule saying collapsed Inventory cards show only three fields with this binding behavior:

```markdown
- At `max-width: 720px`, Inventory uses disclosure cards. Collapsed cards show Name, Category, Size / Serial, and Colour; a missing Colour displays `-`, and long values wrap without document overflow. Admin initially sees a mobile-only `Add item` trigger that expands the single existing creation form inline. Cancel and successful save reset and close it, while a failed save preserves the open form and entered values. Desktop retains the always-visible creation form and twelve-column table.
```

- [ ] **Step 2: Update the Inventory page behavior specification**

In `docs/UI-PAGES.md` Inventory section, replace the exact three-field contract and add:

```markdown
At `max-width: 720px`, the admin creation form is initially collapsed behind an `Add item` button placed before search and filters. It opens inline using the same form state and Server Action as desktop. Cancel clears and closes without mutation, successful creation clears and closes, and failed creation stays open with entered values intact. Supervisor has no creation trigger or form. Each collapsed saved-item card shows Name, Category, Size / Serial, and the stored Colour; null or empty Colour displays `-`. Supervisor can read Colour but cannot edit it.
```

Retain the existing stable saved-editor target, pending lock, admin full-editor, supervisor movement-only, and desktop-table paragraphs.

- [ ] **Step 3: Run focused tests and the first full verification pass**

Run:

```powershell
npm.cmd run test:run -- tests/inventory-ui.test.tsx tests/inventory-hydration.test.tsx tests/pwa-mobile-ux.test.tsx tests/inventory-actions.test.ts tests/inventory-actions-supabase.test.ts
npm.cmd run verify
```

Capture the exact Vitest file/test totals, skipped environment tests, coverage percentages, build result, and production audit result from the output for `PROGRESS.md`.

- [ ] **Step 4: Perform non-mutating browser QA**

Use an authenticated local app at `375x812`, `390x844`, and `1280x900`.

At both mobile widths verify:

- Add Item fields are not initially visible and `Add item` is visible to admin;
- the trigger opens and closes the same inline form;
- entering Name and Colour, closing via the trigger, and reopening preserves them;
- Cancel clears the entered values and closes the form;
- stored Colour values appear in collapsed cards;
- if existing safe-to-read rows include null/empty or long Colour values,
  observe their `-` fallback and wrapping directly; otherwise record those two
  visual cases as unavailable in live data and use the component/CSS tests as
  the required evidence;
- `document.documentElement.scrollWidth === document.documentElement.clientWidth`;
- browser console error/warning count is zero.

At desktop verify:

- the creation form is initially visible without pressing Add;
- the mobile trigger and mobile Cancel are not visible;
- the table retains exactly twelve headers including Colour;
- existing Edit, Save, Cancel, Stock, and Delete controls remain present;
- document horizontal overflow is zero.

Do not press the creation submit or Delete against production-connected Supabase. Hydrated tests are the evidence for success, failure, and pending transitions.

- [ ] **Step 5: Record stable completion evidence**

Append a dated Inventory entry to `PROGRESS.md` describing:

- the mobile Add disclosure and its success/failure/Cancel behavior;
- four-field collapsed cards and `-` fallback;
- unchanged supervisor permissions and desktop workflow;
- exact focused and full verification results from Step 3;
- exact viewport, overflow, and console measurements from Step 4;
- no DB migration, dependency, Jobber, Vercel configuration, or production-data mutation.

Do not add live inventory values, user identifiers, emails, or transient row counts.

- [ ] **Step 6: Run fresh final verification after all documentation changes**

Run:

```powershell
npm.cmd run verify
git diff --check
git status --short
```

Expected: verification exits 0 and the whitespace check exits 0. The isolated
feature worktree contains only intended task files. A separate read-only status
check in the original checkout confirms that its unrelated `next-env.d.ts`
modification is still present and unstaged.

- [ ] **Step 7: Commit Task 3 without staging unrelated files**

```powershell
git add -- docs/UI-DESIGN-SYSTEM.md docs/UI-PAGES.md PROGRESS.md
git diff --cached --check
git commit -m "docs: record mobile inventory add flow"
```

- [ ] **Step 8: Review the full branch against the design**

Compare the branch diff from its merge base against:

- `docs/superpowers/specs/2026-08-10-inventory-mobile-add-colour-design.md`;
- every Global Constraint in this plan;
- all three task acceptance checks.

Require an independent code-review verdict with both specification compliance
and code-quality assessment. Audit each task's Acceptance criteria above.
Resolve every Critical or Important finding, rerun its covering tests, then
rerun the final verification command before declaring completion.
