# Jobs calendar design QA

- Source visual truth: `C:/Users/kjm12/AppData/Local/Temp/codex-clipboard-66c8a664-48f4-4e87-bc4a-aaf54fbbc0fc.png`
- Implementation screenshot: `C:/Users/kjm12/AppData/Local/Temp/pbc-jobs-calendar-implementation.png`
- Combined comparison: `C:/Users/kjm12/AppData/Local/Temp/pbc-jobs-calendar-comparison.png`
- State: supervisor `Eric`, `/jobs?month=2026-08`, live Jobber job and visit data
- Source pixels: 2048 × 1234. Browser chrome was removed and the remaining 2048 × 1114 content was proportionally normalized to 1309 × 712.
- Implementation pixels and CSS viewport: 1265 × 712 at device density 1.

## Findings

No actionable P0, P1, or P2 findings remain.

- Fonts and typography: the implementation keeps the PBC application type system. Weekday headings, month label, dates, job titles, and secondary job metadata retain a clear hierarchy at the narrower implementation viewport.
- Spacing and layout rhythm: the seven-column month grid, toolbar, current-day emphasis, card spacing, and cell boundaries follow the reference composition. At 1265px the Unscheduled panel intentionally moves below the calendar so all seven weekdays remain visible; at widths above 1320px it returns to the right-side position shown in the reference.
- Colors and visual tokens: PBC semantic tokens replace Jobber's palette while preserving the same schedule-card affordance. Status colors remain semantic, and today's cell uses a pale warning surface with a stronger top edge.
- Image and asset quality: neither screen requires content imagery. Existing application icons and branding are preserved; no raster placeholders or substitute illustrations were introduced.
- Copy and content: the screen is narrowed to Job items only, as requested. Each card shows the Job title, number, and status; Unscheduled contains jobs without dated visits.

The full-view combined comparison is sufficiently high resolution to read the toolbar, weekday labels, job cards, status metadata, grid rhythm, and current-day treatment. A separate focused crop was not required.

## Comparison history

1. Initial implementation used the Job's full start/end range. Live evidence showed long-running and archived jobs repeated on every date, which was a P1 schedule-accuracy issue. The calendar was changed to use Jobber visit start/end dates.
2. The first visit query requested 50 nested visits for 50 jobs and hit Jobber's query-cost throttle, blocking the screen. The verified visit page was reduced to 10 and job-list pages to 20, after which live data loaded successfully.
3. At 1265px the right-side Unscheduled panel left only five weekdays visible, a P2 responsive issue. The panel now stacks below 1320px, and the post-fix screenshot shows Monday through Sunday together.

## Interaction and error checks

- Previous, Next, and Today month links expose the correct month URLs.
- Clicking Job #3103 navigated to `/jobs/[jobberJobId]` and rendered its revenue, expenses, profit, dates, and expense lines.
- Unscheduled jobs remain direct links to the same expense-detail route.
- Browser error log after the calendar-to-detail flow: 0 errors.

## Follow-up polish

- P3: a future iteration could add an optional compact/list toggle for users who need to scan financial totals without opening each Job.

final result: passed
