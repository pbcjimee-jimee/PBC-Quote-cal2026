# Quote Options Design

## Goal

Add optional quote add-ons to the PBC quote form. Each option is priced with the same material, labour, formula, and min/max selection model as the main quote, but option totals do not change the main quote final total.

## User Flow

On `/quotes/new` and quote edit pages:

1. The existing customer, Jobber lookup, main materials, and main calculation flow stay unchanged.
2. A new `Options` section appears below the main materials section.
3. The user can add, rename, expand/collapse, edit, and delete options.
4. Each option owns its own material rows, working-days/labour inputs derived from those rows, formula results, selected min/max, subtotal, labour total, material total, and option final total.
5. The right summary keeps the existing main final total and adds an `Optional Add-ons` block showing `Option 1 Total`, `Option 2 Total`, etc.
6. Option totals are displayed separately and are not added to `quotes.final_total`.

## Recommended UI Structure

Use the existing two-column quote form.

Left panel:

- `CustomerPanel`
- `MaterialsPanel` for the main quote
- New `QuoteOptionsPanel`
  - `+ Add Option`
  - One expandable `QuoteOptionEditor` per option
  - Each option reuses the existing material row/search behavior where practical

Right panel:

- Existing main `Calculation`
- Existing main `FormulaResults`
- Existing main `FinalSummary`
- New `OptionTotalsSummary`
  - Lists option title and option final total
  - Shows a small note that options are not included in main total

## Data Model

Add separate persisted option records rather than mixing options into main `quote_items`.

New table: `quote_options`

- `id uuid primary key`
- `quote_id uuid not null references quotes(id) on delete cascade`
- `title text not null`
- `working_days numeric(5,2) not null check >= 0`
- `labour_per_day numeric(5,2) not null check >= 0`
- `material_market numeric(10,2) not null check >= 0`
- `material_actual numeric(10,2) not null check >= 0`
- `formula1_total` through `formula5_total`
- `selected_min int not null check between 1 and 5`
- `selected_max int not null check between 1 and 5`
- `subtotal numeric(10,2) not null`
- `final_total numeric(10,2) not null`
- `position int not null default 0`

New table: `quote_option_items`

- Same snapshot shape as `quote_items`
- `option_id uuid not null references quote_options(id) on delete cascade`
- Includes product snapshot, prices, quantity, working/labour fields, area snapshot, custom flag, and position

RLS follows the existing v1.0 model: authenticated users can read/write all quote option tables. No role split is introduced.

## Calculation Rules

Each option uses the same functions as the main quote:

- `calculateFormulaLabourDays`
- `calculateAllFormulas`
- `calculateSubtotal`
- `calculateFinal`

The option final total is stored on `quote_options.final_total`; it is never added to `quotes.final_total`.

Pricing settings are not duplicated per option. Options use the quote's pricing settings snapshot, just like main quote recalculation on edit.

## Jobber Scope

This implementation imports and stores the Jobber quote snapshot as today. It does not write option sections back into Jobber.

If Jobber exposes option line items in the current fetch response, those can be preserved in the raw `jobber_snapshot`; mapping them into editable PBC options is out of scope for the first implementation unless the API shape is confirmed.

## Validation

Server actions validate:

- option title is required
- all option money and labour fields are non-negative
- option item quantity is positive
- selected min/max are 1 through 5

Client UI should prevent obvious invalid numeric entry, but server validation remains the source of truth.

## Tests

Add focused tests for:

- option calculation helper returns separate option totals without affecting main total
- `createQuote` stores options and option items
- `getQuote` and edit form mapping restore saved options
- `updateQuote` replaces option records and items for a quote
- UI renders option totals separately from main final total

## Out Of Scope

- Role-based access control
- Jobber mutation/write-back
- Automatic conversion of Jobber option sections into editable PBC options without confirmed API shape
- Changing the existing main quote formula behavior
