# Timer UX Implementation Spec

## Scope
- Add timer-driven UX to:
1. `src/app/teacher/EditReportModal.tsx` (Old Murajaah in `test` mode).
2. `src/components/admin/JuzTestModal.tsx` (live Juz/Hizb test entry).
- Primary outcomes:
1. Improve consistency of memorization quality checks.
2. Reduce teacher interaction cost during live testing.
3. Capture timing evidence for quality control.

## Current Baseline (from code)
- Old Murajaah test mode already has structured scoring and pass/fail computation in:
1. `src/app/teacher/EditReportModal.tsx:142`
2. `src/app/teacher/EditReportModal.tsx:478`
- Juz Test modal already has full criteria scoring, weighted total logic, and submit path in:
1. `src/components/admin/JuzTestModal.tsx:185`
2. `src/components/admin/JuzTestModal.tsx:252`
- Both UIs currently use dense per-question `<select>` controls, and no timing metadata is captured.

## Product Decisions

### 1) Timer Model
- `session_timer`: total elapsed test time.
- `active_timer`: time spent while timer is running (excludes pauses).
- `criterion_timer`: optional per-criterion elapsed time (only while criterion is focused/active).
- `event_log`: timestamped timer events
  (`start`, `pause`, `resume`, `overtime`, `delay_marked`, `end`).

### 2) Timing Modes
- `strict`: fixed target duration, no +time shortcut.
- `standard`: fixed target + `+15s` quick add.
- `coaching`: soft target (alerts only), no hard fail behavior.

### 3) Alerts
- `warning` at 75% consumed.
- `critical` at 90% consumed.
- `overtime` after target expires.

### 4) Teacher Actions
- `Start`, `Pause`, `Resume`, `End`.
- `+15s` (standard only).
- `Mark Delay` (logs hesitation/assist events without interrupting flow).

## UX Layout Plan

### Old Murajaah Test (`EditReportModal`)
- Inject a sticky timer bar inside the modal body, shown only when:
1. report type is Old Murajaah/Murajaah.
2. `oldMurajaahMode === "test"`.
- Placement target: immediately above current test cards around
  `src/app/teacher/EditReportModal.tsx:478`.
- Bar content:
1. Left: mode badge (`Standard/Strict/Coaching`) + pace label.
2. Center: `MM:SS` + thin progress bar.
3. Right: action buttons (`Start/Pause`, `+15s`, `Mark Delay`, `End`).
- Keep existing amber visual language for consistency.

### Juz Test (`JuzTestModal`)
- Add timer row below modal header and above Section 1.
- Placement target: around `src/components/admin/JuzTestModal.tsx:339`.
- Keep bilingual structure intact; timer labels can be EN-first now, AR later if needed.
- Same control pattern as Old Murajaah for consistency across workflows.

## Time Estimation Rules (v1)
- Purpose: auto-fill a practical target duration while allowing teacher override.

### Old Murajaah Test
- Inputs:
1. page range (`page_from`, `page_to`) from `src/app/teacher/EditReportModal.tsx:399`.
2. question count from `OLD_MURAJAAH_TEST_QUESTION_CONFIG` + two additional criteria.
- Formula:
1. `pages = max(1, abs(page_to - page_from) + 1)` (or 1 for single page mode).
2. `base = pages * 75s`.
3. `question_time = total_questions * 18s`.
4. `target_seconds = clamp(base + question_time, 180, 1200)`.

### Juz/Hizb Test
- Inputs:
1. computed page range from `calculatePageRange` in `src/components/admin/JuzTestModal.tsx:126`.
2. dynamic config from `getQuestionConfig` in `src/components/admin/JuzTestModal.tsx:72`.
- Formula:
1. `pages = max(1, page_to - page_from + 1)`.
2. `base = pages * 60s` for Juz, `pages * 70s` for Hizb.
3. `question_time = total_questions * 15s`.
4. `target_seconds = clamp(base + question_time, 300, 1800)`.

## Data Model

### Old Murajaah (`reports.reading_progress`)
- Extend existing `reading_progress.test_assessment` object with:
1. `timer_meta: {`
2. `  mode: "strict" | "standard" | "coaching";`
3. `  target_seconds: number;`
4. `  elapsed_seconds: number;`
5. `  active_seconds: number;`
6. `  pause_count: number;`
7. `  delay_marks: number;`
8. `  overtime_seconds: number;`
9. `  started_at?: string;`
10. ` ended_at?: string;`
11. ` events?: Array<{ type: string; at_ms: number }>;`
12. `}`

### Juz Tests (`juz_tests`)
- Short-term (no migration): add `timer_meta` inside `section2_scores` root object as sibling key.
- Preferred long-term: add `timer_meta jsonb` column on `juz_tests`.
- If column is added later, keep backward compatibility by reading either location.

## Frontend Architecture

### Shared Hook
- Add `src/hooks/useAssessmentTimer.ts`:
1. pure timer logic (state machine + `setInterval`).
2. actions: `start`, `pause`, `resume`, `end`, `addSeconds`, `markDelay`.
3. computed flags: `isRunning`, `isOvertime`, `warningLevel`.
4. export serializable snapshot for payload.

### Shared UI Component
- Add `src/components/assessment/AssessmentTimerBar.tsx`:
1. receives timer state/actions from hook.
2. style variants: `amber` (Old Murajaah), `indigo` (Juz test).
3. compact mobile layout with wrapped buttons.

### Keyboard Shortcuts (desktop-first)
- `Space`: start/pause/resume.
- `D`: mark delay.
- `+`: add 15s (standard mode only).
- `E`: end timer.
- Implement inside timer bar with proper cleanup in `useEffect`.

## Interaction Optimizations

### 1) Quick Score Chips
- Replace each score `<select>` with horizontal chips `0..5`
  (or `0/1/2` in future strict rubric mode).
- Keep keyboard support:
1. `1..6` map to `0..5` for current criterion.
2. `Tab` naturally advances criterion.

### 2) Criterion Focus Tracking
- Track currently edited criterion key, then accumulate `criterion_timer`.
- Minimum viable: track only card-level time, not per question sub-slot.

### 3) Submission Guardrails
- On submit:
1. if timer never started, ask confirmation.
2. if elapsed < minimum threshold (e.g., 90s Old Murajaah, 180s Juz), show warning confirmation.
3. attach timer snapshot into payload regardless of warnings.

## File-Level Change Plan

### Phase 1 (MVP timer, low risk)
1. Create `src/hooks/useAssessmentTimer.ts`.
2. Create `src/components/assessment/AssessmentTimerBar.tsx`.
3. Integrate into Old Murajaah test area in `src/app/teacher/EditReportModal.tsx`.
4. Integrate into Juz modal in `src/components/admin/JuzTestModal.tsx`.
5. Persist timer meta:
   - Old Murajaah: include in `reading_progress.test_assessment`.
   - Juz: include in POST payload in `src/components/admin/JuzTestModal.tsx:257`.
6. Extend typing in `src/lib/murajaahMode.ts` and `src/types/teacher.ts` for safer consumption.

### Phase 2 (teacher speed)
1. Replace score selects with score chips in:
   - `src/app/teacher/EditReportModal.tsx`
   - `src/components/admin/JuzTestModal.tsx`
2. Add criterion focus timing and keyboard shortcuts.

### Phase 3 (analytics + consistency)
1. Add DB migration for `juz_tests.timer_meta jsonb` (optional but recommended).
2. Normalize read path in history views:
   - `src/components/teacher/JuzTestHistoryModal.tsx`
   - `src/components/teacher/EditJuzTestForm.tsx`
3. Add quality labels in UI summaries: `On-time`, `Overtime`, `High delay frequency`.

## API Impact
- `src/app/api/teacher/reports/route.ts` already passes through
  `reading_progress`, so Old Murajaah timer metadata requires no route change.
- `src/app/api/admin/juz-tests/route.ts` accepts arbitrary payload keys in POST/PUT
  currently; timer metadata can be included immediately.
- For stronger safety, add explicit runtime validation for timer payload fields
  in a later hardening pass.

## QA Plan

### Functional
1. Timer starts/pauses/resumes/ends correctly in both modals.
2. Warning/critical/overtime transitions fire at correct thresholds.
3. `Mark Delay` increments and persists.
4. Timer snapshot persists after submit and survives edit/reload path.

### Regression
1. Existing score calculations unchanged:
   - Old Murajaah total in `src/app/teacher/EditReportModal.tsx:142`.
   - Juz total in `src/components/admin/JuzTestModal.tsx:185`.
2. Existing pass/fail toggles remain intact.
3. No visual overlap/clipping on mobile for modal action areas.

### Accessibility
1. Timer controls reachable by keyboard.
2. Alert states are not color-only (include text labels).
3. Buttons have explicit aria labels.

## Visual Direction
- Keep each module’s current style identity:
1. Old Murajaah: warm amber, lightweight glass background.
2. Juz test: indigo/blue header identity.
- Improve hierarchy:
1. Prominent timer digits.
2. Secondary metadata (mode, target, delay count) in compact chips.
3. Low-noise warning styling until critical threshold.

## Rollout Recommendation
1. Ship Phase 1 behind feature flag `NEXT_PUBLIC_ENABLE_ASSESSMENT_TIMER`.
2. Collect 1 week of usage with 2-3 teachers.
3. Tune default target formulas before Phase 2 chip refactor.
