# Murajaah Modal Redesign Notes (Revised)

## Final Decision
Adopt a **single smart flow** with progressive disclosure.

This is the best fit for enterprise UX here because it optimizes both:
- speed for frequent task (recent pages from latest tasmi)
- flexibility for edge/advanced task (specific pages from earlier juz)

Without creating two equal competing modes that increase cognitive load.

## Why Not the 2 Original Options
- Manual-only: too much repetitive input for high-frequency use.
- Big dual toggle (two separate modes): discoverable but often confusing, especially in busy classroom workflow.

## Target UX Model
### 1) Range Source
- `Auto (Latest tasmi)` (default)
- `Specific page`

### 2) Range Builder
- `Last N pages` (quick chips: 1, 3, 5, 10 + dropdown)
- `Manual from-to`

### 3) Persistent Live Preview
- `Pages X-Y`
- `Juz`
- `Estimated surah/ayat coverage`

### 4) Existing Form Fields
- Surah/Ayat/Grade/Date remain
- auto-fill from preview window when possible
- always manually editable (clear override behavior)

## UX Rules (Enterprise)
- One primary action only: `Save Report`.
- Keep defaults safe and prefilled:
  - source = auto latest tasmi
  - builder = last 3 pages
- Validation shown inline and near field:
  - page 1-604
  - from <= to
  - max span constraint (configurable)
- Prevent silent state conflicts:
  - changing source/builder re-computes one canonical range object
  - never store split/derived page values in multiple local states

## Technical Architecture
### Shared Domain Helper
- Add `src/lib/murajaahRange.ts`:
  - `computeMurajaahRange(input) -> { pageFrom, pageTo, juz, isValid, error }`
  - `deriveRangePreview(range) -> UI preview model`

### Single Source of Truth in UI
- Replace ad-hoc `reviewAnchorPage + reviewCount + local math` with canonical state.
- Reuse same section component in:
  - `src/components/teacher/QuickReportModal.tsx`
  - `src/app/teacher/EditReportModal.tsx`

### Data Contract / Auditability
- Keep `page_from/page_to/juzuk` as the saved canonical values.
- Save selection metadata in `reading_progress` for traceability, e.g.:
  - `murajaah_selection.source = auto_latest_tasmi | specific_page`
  - `murajaah_selection.builder = last_n | manual_range`
  - `murajaah_selection.input = {...}`

### Validation Layering
- Client-side: immediate inline feedback.
- API-side (`/api/teacher/reports`): enforce hard checks for `New Murajaah` too (not just UI).

## Accessibility & Usability
- Keyboard-first operable controls.
- Explicit label + helper text (avoid placeholder-only guidance).
- Announce validation errors for screen readers.
- Touch-friendly targets for mobile teachers.

## Rollout Plan
1. Build shared range helper + unit tests.
2. Implement redesigned section in `QuickReportModal`.
3. Reuse exact same section in `EditReportModal`.
4. Add API validation for `New Murajaah` range integrity.
5. Add telemetry events:
  - default path usage vs custom path
  - validation error frequency
  - save success rate / latency

## Acceptance Criteria
- Teacher can submit in <= 3 interactions for default recent-pages flow.
- Teacher can submit specific old pages without workaround.
- Same interaction model in Add and Edit modal.
- Invalid ranges are blocked at both UI and API.
- No regression in existing report charts and records display.
