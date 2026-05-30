# Quote Workspace Area Subtotals Design

## Goal

Make the quote editor easier to use on one screen while showing separate Interior and Exterior pricing inside the same quote. All visible option totals should use GST-exclusive subtotal amounts, and the final quote summary should show Interior subtotal, Exterior subtotal, and Final subtotal.

## User Flow

On `/quotes/new` and quote edit pages:

1. The user assigns each material row to an existing Interior or Exterior area.
2. The quote summary calculates Interior and Exterior independently from those scoped material rows.
3. The summary shows:
   - Interior subtotal, ex GST
   - Exterior subtotal, ex GST
   - Final subtotal, ex GST
   - GST 10% as a separate informational row
4. Optional add-ons stay separate from the main quote total.
5. Each option summary shows GST-exclusive subtotal pricing, grouped into Interior and Exterior when option rows have scopes.
6. Material rows without an Interior or Exterior scope are shown as unassigned and excluded from Interior/Exterior subtotals until assigned.
7. The left quote input flow scrolls inside its own panel instead of forcing one long page scroll.
8. The app sidebar with Overview, New Quote, and Settings can collapse to an icon rail and expand again.
9. Product / Service line item sorting keeps drag-and-drop but adds fast controls so long line lists can be reordered without dragging across the page.

## Scope

In scope:

- Client-side derived area subtotal calculations for the main quote and quote options.
- Quote form summary UI changes.
- Quote detail summary UI changes using saved snapshots.
- GST-exclusive option total display.
- Desktop quote workspace layout using the original two-column page-scroll editor, with internal scrolling only inside the Product / Service row list.
- Collapsible global app sidebar.
- Faster Product / Service line sorting controls.
- Unit and server-rendered UI tests for the new calculation and rendering behavior.

Out of scope:

- Database schema changes.
- Changing the five pricing formulas.
- Changing how `quotes.subtotal`, `quotes.final_total`, `quote_options.subtotal`, or `quote_options.final_total` are stored.
- Adding new external dependencies.
- Writing option sections back to Jobber Build Option Set.
- Replacing the existing Product / Service write-back model.

## Calculation Model

The existing calculator remains the source of truth for formula math:

- `calculateAllFormulas`
- `calculateSubtotal`
- `calculateFinal`

The new grouped subtotal logic is a client/server helper around existing material rows:

1. Filter material rows by `areaScope === 'interior'` or saved `areaScopeSnapshot === 'interior'`.
2. Calculate formulas from only those rows.
3. Calculate that group's subtotal from the same selected min/max formula pair.
4. Repeat for `exterior`.
5. Final subtotal is `interiorSubtotal + exteriorSubtotal`.

Unassigned rows:

- Rows with no `areaScope` / `areaScopeSnapshot` are not included in either grouped subtotal.
- UI shows an unassigned warning with the count and material amount.
- Save remains allowed because older or partially entered quotes may not have areas yet.

GST:

- Main quote stored `final_total` remains GST-inclusive.
- The prominent visible quote amount is `subtotal` / grouped final subtotal, ex GST.
- GST is shown as `finalTotal - subtotal`.
- Options display `quote_options.subtotal`, not `quote_options.final_total`, in all option summary blocks.

## UI Structure

The quote page becomes a workspace under the app header.

Implemented desktop layout:

```text
App sidebar | Header
            | Quote action bar
            | Workspace
            | ---------------------------------------------------------------
            | Left editor panel                       | Sticky Calculation
            | Customer Info                           | Formula results
            | Product / Service                       | Interior subtotal
            | Materials                               | Exterior subtotal
            | Options                                 | Final subtotal
            | Internal Memos                          | Option summaries
            | ---------------------------------------------------------------
```

The page keeps the original document scroll behavior. The Calculation panel stays sticky on desktop and does not use an independent scroll container. The only internal scroll area in the quote editor is the Product / Service row list, so long public line-item lists can be reordered without stretching that section indefinitely. On smaller screens, the columns stack and use natural page scroll to avoid cramped panels.

Recommended section behavior:

- Customer / Jobber: first section in the left editor panel.
- Product / Service: directly below Customer Info so public Jobber-facing lines are edited before internal materials.
- Materials: directly below Product / Service with search and Interior/Exterior area scope controls.
- Materials: show Interior and Exterior labour totals from assigned rows so users can compare Working Days, Labour / Day, and Labour Days without leaving the material section.
- Options: below Materials and priced separately from the main quote.
- Internal Memos: app-only notes at the end of the left editor panel.
- Calculation: right-side sticky panel with Interior/Exterior labour totals, grouped subtotals, formula results, GST, Jobber profit, and option subtotal summaries.

## Collapsible Sidebar

The existing `AppHeader` owns the desktop sidebar. It should become a client-side collapsible shell:

- Expanded width: current 16rem (`w-64`).
- Collapsed width: icon rail around 4.5rem.
- The main layout padding changes from `lg:pl-64` to a CSS-variable-driven padding.
- The toggle is stored in `localStorage` so the user's preference survives reload.
- Collapsed state keeps icons visible and uses accessible labels or `title` attributes for Overview, New Quote, Settings, and Sign out.
- Mobile behavior stays header-based; no new mobile drawer is required for this task.

## Faster Product / Service Sorting

Keep existing drag-and-drop, auto-scroll the Product / Service row list while dragging near its top or bottom edge, and add explicit controls per row:

- Move to top
- Move up
- Move down
- Move to bottom

Rules:

- Controls are disabled at the first or last row where appropriate.
- Drag auto-scroll is limited to the Product / Service row list and does not move the full quote page.
- Reordering updates the same `jobberQuoteLines` array used by drag-and-drop.
- Saved `position` fields continue to come from the current array order.
- Jobber write-back continues using the existing sorted payload path.

## Data Persistence

No new database columns are required.

Main quote persistence remains:

- Store the overall quote subtotal in `quotes.subtotal`.
- Store GST-inclusive total in `quotes.final_total`.
- Store row area snapshots in `quote_items.area_scope_snapshot`.

Option persistence remains:

- Store option subtotal in `quote_options.subtotal`.
- Store GST-inclusive option total in `quote_options.final_total`.
- Store row area snapshots in `quote_option_items.area_scope_snapshot`.

Grouped Interior/Exterior totals are derived at render time from saved item snapshots. This avoids a migration and keeps older quotes readable.

## Error Handling

- If a grouped calculation fails validation, the summary shows the existing save error path rather than crashing the page.
- If there are scoped rows in only one group, the other group shows `$0.00`.
- If every material row is unassigned, grouped subtotals show `$0.00` and the unassigned warning explains that rows need Interior/Exterior area assignment.
- If an option has no scoped rows, its summary shows option subtotal `$0.00` for grouped totals and keeps the option subtotal from its formula result available in the expanded editor.

## Testing

Add focused tests for:

- Main quote totals split Interior and Exterior material rows and exclude unassigned rows.
- Option summaries render `subtotal`/ex GST values instead of `finalTotal`/GST-inclusive values.
- Quote detail pages render saved option subtotal values.
- The quote form uses the original two-column page-scroll layout, includes an internally scrollable Product / Service row list, and keeps the Calculation panel sticky without `overflow-y-auto`.
- The app sidebar renders a collapse toggle and supports collapsed labels.
- Product / Service line sorting helpers move rows top/up/down/bottom without mutating the original array.

## Documentation Updates

Update these docs alongside implementation:

- `docs/CALCULATION.md`: clarify grouped subtotals are derived displays and option summaries show ex GST subtotal.
- `docs/CALCULATION-API.md`: document any new quote-form subtotal helper API if exported for tests.
- `docs/UI-QUOTE-FORM.md`: describe the two-column page-scroll layout, Product / Service row-list scroll, grouped totals, option subtotal display, and faster sorting controls.
- `docs/UI-DESIGN.md`: describe collapsible app sidebar behavior.
- `docs/ARCHITECTURE.md`: clarify no DB migration is required; grouping derives from area snapshots.
- `docs/DB-SCHEMA.md`: clarify stored totals remain unchanged and grouped totals are derived.
- `PROGRESS.md`: record the design and plan documents plus implementation verification when complete.
