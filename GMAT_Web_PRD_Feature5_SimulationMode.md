# Feature 5 — Exam Simulation Mode

**Parent doc:** GMAT-WEB Simulator PRD v1.0
**Version:** 1.0 · March 2026 · Author: Hoang Tran

---

## Table of Contents

1. [Problem Statement](#1-problem-statement)
2. [Feature Overview](#2-feature-overview)
3. [US-5.1 — Exam Setup: Section Order Selection](#us-51--exam-setup-section-order-selection)
4. [US-5.2 — Question Bank Configuration](#us-52--question-bank-configuration)
5. [US-5.3 — Section Execution: Strict Forward-Only Navigation](#us-53--section-execution-strict-forward-only-navigation)
6. [US-5.4 — Section Timer](#us-54--section-timer)
7. [US-5.5 — Optional Break Between Sections](#us-55--optional-break-between-sections)
8. [US-5.6 — Score Report Screen](#us-56--score-report-screen)
9. [US-5.7 — Post-Exam Review (Deferred)](#us-57--post-exam-review-deferred)
10. [US-5.8 — Exam History & Analytics Integration](#us-58--exam-history--analytics-integration)
11. [Features Disabled in This Mode](#features-disabled-in-this-mode)
12. [Data Model Changes](#data-model-changes)
13. [Acceptance Criteria (consolidated)](#acceptance-criteria-consolidated)
14. [Implementation Notes](#implementation-notes)

---

## 1. Problem Statement

The existing `timed` mode runs a single question set in one continuous session. It does not replicate the structural reality of the actual GMAT Focus Edition exam:

- The real exam has **3 separate sections**, each with its own countdown.
- The real exam requires the candidate to **choose section order** at the start.
- The real exam **does not allow backward navigation** within a section.
- The real exam offers a **10-minute optional break** between sections.
- The real exam's score report shows **only the final score and section breakdown** — no per-question review at the testing center.

Without these constraints, practice sessions fail to build the psychological and strategic habits needed for test day: pacing under per-section pressure, committing to answers without backtracking, and managing energy across a 2h15m sitting.

---

## 2. Feature Overview

**Exam Simulation Mode** is a new, standalone exam mode (alongside `timed`, `practice`, `review`) that replicates the Pearson VUE GMAT Focus Edition experience as closely as possible within a web interface.

### What this mode IS
- A full 3-section exam with real timing constraints per section
- Strict forward-only navigation (no back button)
- Section order selection before the exam begins
- Optional 10-minute break between sections
- Score report showing total + section scores only (no inline review)
- Per-question review accessible separately, after leaving the score report

### What this mode IS NOT
- Not a replacement for the existing `timed` mode (which remains for single-section practice)
- Not adaptive (no CAT algorithm — questions are drawn from the configured bank in order)
- Not an official score predictor

### Route
```
/exam/simulation/setup     → setup wizard (order + question bank)
/exam/simulation/[id]      → active exam (section execution)
/exam/simulation/[id]/break → optional break screen
/exam/simulation/[id]/score → score report
```

---

## US-5.1 — Exam Setup: Section Order Selection

> **As a user** starting an Exam Simulation,
> **I want to** choose the order of the three sections before the exam begins,
> **So that** I practice my personal optimal section order strategy, exactly as I will on test day.

### Setup Wizard Flow

The setup wizard has two steps rendered as a full-screen modal or dedicated `/exam/simulation/setup` page.

**Step 1 — Section Order**

| Attribute | Detail |
|---|---|
| **UI** | Three draggable section cards: `Quantitative Reasoning`, `Verbal Reasoning`, `Data Insights`. User drags to reorder, or clicks arrow buttons to move up/down. |
| **Default order** | Quant → Verbal → DI (most common strategic choice — pre-selected but editable). |
| **Display** | Each card shows: section name, question count (pulled from configured bank), time allocation (45 min each). |
| **Constraint** | All 3 sections must be present. Cannot remove or duplicate a section. |

**Step 2 — Question Bank**

See US-5.2.

**Confirmation screen** (final step before launch):

| Field | Value shown |
|---|---|
| Section order | e.g. "1. Quant → 2. DI → 3. Verbal" |
| Questions per section | e.g. "Quant: 21 · DI: 20 · Verbal: 23" |
| Total questions | 64 |
| Total time | ~2h 15m (3 × 45 min + breaks if taken) |
| Break preference | "Optional 10-min breaks enabled" (toggle, default ON) |

"Begin Exam" button triggers a 5-second countdown before the first section loads, simulating the Pearson VUE test start sequence.

---

## US-5.2 — Question Bank Configuration

> **As a user** setting up an Exam Simulation,
> **I want to** assign question sets to each section either from existing sets or via a dedicated import,
> **So that** I can run a full mock exam with any question source I have available.

### Path A — Assign Existing Question Sets

| Attribute | Detail |
|---|---|
| **Trigger** | User selects "Use existing question sets" in Step 2 of setup wizard. |
| **UI** | For each section (in the chosen order), a dropdown lists available question sets filtered by section type: Quant sets for Quant section, Verbal sets for Verbal, DI sets for DI. |
| **Validation** | Each section must have a set assigned. "Begin Exam" button disabled until all 3 are assigned. |
| **Question count warning** | If a set has fewer than the recommended question count (Quant: 21, Verbal: 23, DI: 20), show amber warning: "This set has only X questions — section will end early." |

### Path B — Import Full Exam File

| Attribute | Detail |
|---|---|
| **Trigger** | User selects "Import full exam file" in Step 2. |
| **Supported formats** | DOCX, PDF, TXT — same parsers as existing import flow. |
| **Expected structure** | File must contain a section delimiter pattern: `## Quantitative Reasoning`, `## Verbal Reasoning`, `## Data Insights` (case-insensitive). Questions below each header are assigned to that section automatically. |
| **Fallback** | If section delimiters are not detected, the import wizard prompts the user to manually assign page/question ranges to each section. |
| **Validation** | Same question count warnings as Path A. |

### Path C — Mixed (existing sets + import)

User may mix: e.g. import Quant from a file, use an existing set for Verbal, use another existing set for DI. The setup wizard allows per-section source selection independently.

---

## US-5.3 — Section Execution: Strict Forward-Only Navigation

> **As a user** in Exam Simulation mode,
> **I want** the interface to prevent me from navigating back to previous questions within a section,
> **So that** I build the discipline of committing to answers, exactly as required on test day.

| Attribute | Detail |
|---|---|
| **Back button** | Hidden entirely. Not just disabled — removed from the DOM for this mode. |
| **Progress dots** | Still shown (for orientation), but clicking a previous dot does nothing. Dots are not interactive for past questions. |
| **Keyboard shortcut** | `B` (navigate back) is unbound in simulation mode. |
| **Answer change** | User CAN change their answer on the current question before clicking "Next →". Once "Next →" is clicked, the answer is locked and the user moves forward. |
| **"Next →" confirmation** | On unanswered questions: clicking "Next →" shows a one-line inline warning: "You haven't selected an answer. Proceed anyway?" with "Yes, skip" and "Go back" options. This is the only moment where staying on the current question is allowed. |
| **Flag for review** | Flag button is **removed** in simulation mode. Flagging implies the intent to revisit — which is not possible. |
| **Confidence rating** | Removed in simulation mode. |
| **Section end** | After answering the last question in a section and clicking "Next →", a section summary screen appears (see US-5.5 / US-5.6 transition). |

### Section Summary Screen (between sections)

Shown after the last question in each section (except the last section):

| Element | Detail |
|---|---|
| **Header** | "Section 1 of 3 — Quantitative Reasoning — Complete" |
| **Stats shown** | Questions answered: X / Y · Questions skipped: Z · Time used: MM:SS · Time remaining: MM:SS |
| **No per-question detail** | No answer review, no correct/incorrect indicators — just the aggregate stats above. |
| **Next action** | If breaks enabled: "Take a 10-minute break" button + "Skip break, continue →" link. If breaks disabled: "Begin Section 2 →" button. |

---

## US-5.4 — Section Timer

> **As a user** in Exam Simulation mode,
> **I want** each section to have its own 45-minute countdown that auto-submits when it expires,
> **So that** I experience the real pressure of per-section time management.

| Attribute | Detail |
|---|---|
| **Timer scope** | Each section has an independent 45-minute countdown. Timer resets to 45:00 at the start of each new section. |
| **Display** | Prominent top-center placement (not top-right corner as in `timed` mode). Format: `MM:SS`. Section label shown next to timer: "Quant · 44:12". |
| **Warning states** | 10:00 remaining: amber color + subtle pulse. 5:00 remaining: red color + stronger pulse. 1:00 remaining: red + "⚠️ 1 minute remaining" toast. |
| **Auto-submit** | When timer reaches 0:00: all unanswered questions in the section are recorded as skipped, and the exam advances to the section summary screen automatically. |
| **No pause** | Timer cannot be paused except during the optional break (which has its own separate timer). |
| **Per-question ring** | The per-question 2-min ring (Feature 2) is **active** in simulation mode. Both timers are shown simultaneously: section timer (top-center) + question ring (top-right of question card). |
| **Tab visibility** | Timer continues running if user switches browser tabs. Use `Date`-based elapsed time, not interval-counting, to handle tab-switch accurately. |

---

## US-5.5 — Optional Break Between Sections

> **As a user** who has completed a section,
> **I want** the option to take a 10-minute break before the next section begins,
> **So that** I practice managing my energy across the full exam, exactly as I will at the test center.

| Attribute | Detail |
|---|---|
| **Break screen route** | `/exam/simulation/[id]/break` |
| **Trigger** | Shown on Section Summary Screen after sections 1 and 2 (never after the final section). |
| **Break timer** | 10:00 countdown, displayed as a large circular ring in the center of the screen. |
| **Copy** | "You are on break. Section 2 begins automatically when the timer ends — or click 'End Break Early' to continue now." |
| **Auto-resume** | When break timer reaches 0:00, the next section loads automatically with a 3-second countdown: "Section 2 starting in 3… 2… 1…" |
| **End break early** | Button available at all times. Clicking it shows a confirmation: "Are you sure? Remaining break time will be lost." |
| **Break timer behavior** | Break timer does NOT affect the section timer. The next section's 45-minute countdown starts fresh after the break ends. |
| **Skip break** | On the Section Summary Screen, user may click "Skip break, continue →" to bypass the break screen entirely. |
| **Break disabled** | If user toggled breaks OFF in setup, Section Summary Screen shows only "Begin Section 2 →" with no break option. |

---

## US-5.6 — Score Report Screen

> **As a user** who has completed all 3 sections,
> **I want** to see a score report showing my total score and section scores — without per-question detail,
> **So that** I experience the same psychological moment as test day and calibrate my real score expectations.

### Score Calculation

| Score | Formula |
|---|---|
| **Section score** | Raw percentage correct × section weight, scaled to 60–90 range per section (GMAT Focus Edition scale). |
| **Total score** | Sum of 3 section scaled scores. Range: 205–805. |
| **Note** | This is a **simulated score**, not GMAC's proprietary algorithm. Display a disclaimer: "Estimated score based on raw accuracy. Not equivalent to an official GMAT score." |

### Score Report UI

| Element | Detail |
|---|---|
| **Header** | "GMAT Focus Edition — Simulated Score Report" |
| **Total score** | Large, centered display. e.g. `645`. Color: green if ≥ target, amber if within 30 points below, red if > 30 below. |
| **Target score** | User's target (680) shown as a reference line: "Target: 680 · Gap: −35". |
| **Section breakdown** | Three cards: Quant / Verbal / DI. Each shows: scaled score (60–90), raw accuracy (%), time used, questions skipped. |
| **No question detail** | No per-question answer list, no correct/incorrect indicators, no explanations. This screen is intentionally minimal. |
| **CTA** | Two buttons: "Review this exam →" (navigates to `/results/[sessionId]` — the standard results page with full review) and "Return to Dashboard". |
| **"Review this exam"** | This is the only path to per-question review. The score report itself does not show it. This mirrors the real test: you see your score at the center, and access the Enhanced Score Report later online. |

---

## US-5.7 — Post-Exam Review (Deferred)

> **As a user** who has left the score report screen,
> **I want** to be able to review every question from the simulation exam at any time afterward,
> **So that** I can do a full error log and categorization session without time pressure.

| Attribute | Detail |
|---|---|
| **Access point** | Dashboard → Past Exams → [exam entry] → "Review". Also accessible from the "Review this exam →" CTA on the score report. |
| **Review interface** | Standard `/results/[sessionId]` page — identical to the results page used by `timed` and `practice` modes. All Smart Error Log features (US-1.1 through US-1.4) are fully available here. |
| **Section grouping** | In the results page, questions are grouped by section with section headers and their respective timers shown. |
| **Categorization** | Full Content / Process / Habit categorization available. Pattern Tracker picks up simulation exam errors the same as practice session errors. |
| **Timing** | No time limit on when review can be accessed. A simulation exam stays in the dashboard indefinitely. |

---

## US-5.8 — Exam History & Analytics Integration

> **As a user** who has completed multiple simulation exams,
> **I want** to see my simulation scores tracked over time in the analytics dashboard,
> **So that** I can measure score progression toward my target.

| Attribute | Detail |
|---|---|
| **Dashboard widget** | New "Simulated Scores" card on `/analytics`. Line chart: x-axis = exam date, y-axis = total score (205–805). Target score shown as a horizontal dashed line. |
| **Section trend** | Toggle to view individual section score trends (Quant / Verbal / DI) overlaid on the same chart. |
| **Exam list** | Below the chart: table of all simulation exams with columns: Date · Total Score · Quant · Verbal · DI · Time Used · "Review" link. |
| **Integration with Error Log** | Errors from simulation exams feed into the Pattern Tracker (US-1.4) the same as practice session errors. Simulation errors are tagged with a `[SIM]` badge in the Pattern Tracker to distinguish them from isolated practice errors. |

---

## Features Disabled in This Mode

The following features from other modes and this PRD are **explicitly removed** in Exam Simulation mode to preserve exam fidelity:

| Feature | Status in Simulation Mode | Reason |
|---|---|---|
| Back navigation | ❌ Removed | Real exam does not allow it |
| Flag for review | ❌ Removed | Implies revisiting — not possible |
| Confidence rating | ❌ Removed | Not part of real exam UX |
| Immediate feedback (practice mode) | ❌ N/A | Mode is not active |
| Per-question explanation popup | ❌ Removed | No in-exam review |
| CR Missing Link gate (Feature 3) | ❌ Removed | Adds friction not present in real exam |
| RC Passage Map gate (Feature 4) | ❌ Removed | Same reason |
| Error categorization during exam | ❌ Removed | Only available post-exam in Review |
| Pause exam | ❌ Removed | Real exam cannot be paused |
| Keyboard shortcut `B` (back) | ❌ Unbound | — |
| Per-question 2-min ring (Feature 2) | ✅ Active | Retained — triage discipline still needed |
| Triage banner at 2 min (Feature 2) | ✅ Active | Retained — triage discipline still needed |

---

## Data Model Changes

### New table: `simulation_exams`

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid`, PK | — |
| `user_id` | `uuid`, FK | — |
| `created_at` | `timestamptz` | When exam was started |
| `completed_at` | `timestamptz`, nullable | Null if abandoned |
| `section_order` | `text[]` | e.g. `["quant", "verbal", "di"]` |
| `status` | `text` | `"in_progress"` \| `"completed"` \| `"abandoned"` |
| `total_score` | `integer`, nullable | Simulated total score (205–805) |
| `breaks_enabled` | `boolean` | Whether breaks were configured |

### New table: `simulation_sections`

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid`, PK | — |
| `simulation_exam_id` | `uuid`, FK → `simulation_exams` | — |
| `section_type` | `text` | `"quant"` \| `"verbal"` \| `"di"` |
| `section_order` | `integer` | 1, 2, or 3 |
| `question_set_id` | `uuid`, FK, nullable | If using existing set |
| `session_id` | `uuid`, FK → `exam_sessions` | Links to existing session/response data |
| `scaled_score` | `integer`, nullable | 60–90 |
| `raw_correct` | `integer`, nullable | — |
| `raw_total` | `integer`, nullable | — |
| `time_used_seconds` | `integer`, nullable | — |
| `questions_skipped` | `integer`, nullable | — |
| `started_at` | `timestamptz`, nullable | — |
| `completed_at` | `timestamptz`, nullable | — |
| `break_taken_after` | `boolean` | Whether user took the break after this section |

### Additions to `exam_sessions` table

| Column | Type | Notes |
|---|---|---|
| `simulation_exam_id` | `uuid`, FK → `simulation_exams`, nullable | Links section session to its parent simulation exam |
| `simulation_section_order` | `integer`, nullable | 1, 2, or 3 |

### localStorage fallback

Add `gmat_simulation_exams` and `gmat_simulation_sections` keys following the same pattern as existing `gmat_sessions`.

---

## Acceptance Criteria (consolidated)

### Setup
1. Setup wizard has two steps: section order (draggable cards) and question bank (existing sets or import or mixed).
2. Default section order is Quant → Verbal → DI, pre-selected but editable.
3. "Begin Exam" is disabled until all 3 sections have a question bank assigned.
4. A question count warning appears if any section has fewer questions than recommended.
5. A 5-second countdown appears before the first section loads after "Begin Exam" is clicked.

### Section Execution
6. The back button is completely absent from the DOM in simulation mode.
7. Clicking "Next →" on an unanswered question shows an inline confirmation before proceeding.
8. After the last question in a section, the Section Summary Screen appears with aggregate stats only (no per-question detail).

### Timers
9. Each section has an independent 45-minute countdown, displayed top-center.
10. Timer uses `Date`-based elapsed time, not interval-counting (handles tab-switch correctly).
11. At 10:00 remaining: amber pulse. At 5:00: red pulse. At 1:00: toast notification.
12. At 0:00: unanswered questions are recorded as skipped and the exam advances automatically.
13. The per-question 2-min ring (Feature 2) is active and displayed simultaneously with the section timer.

### Break
14. After sections 1 and 2, the Section Summary Screen offers a break option.
15. Break screen shows a 10:00 circular countdown.
16. Break auto-resumes the next section at 0:00 with a 3-second countdown.
17. "End break early" requires a confirmation dialog.
18. If breaks were disabled in setup, the break screen never appears.

### Score Report
19. Score report shows total score (205–805) and three section scores (60–90) only.
20. No per-question answer detail is shown on the score report screen.
21. Target score (680) is shown as a reference with gap indicator.
22. "Review this exam →" navigates to the standard results page (`/results/[sessionId]`).
23. A disclaimer is shown: "Estimated score — not equivalent to an official GMAT score."

### Analytics
24. Simulation exams appear in a dedicated "Simulated Scores" card on the analytics page.
25. A line chart tracks total score over time with the target score as a reference line.
26. Simulation errors feed into the Pattern Tracker with a `[SIM]` badge.

---

## Implementation Notes

### Reusing existing infrastructure

Simulation mode is not built from scratch. Each section runs as a standard `exam_session` internally — the existing question rendering, answer recording, and timer logic all apply. The simulation layer adds:

1. **Orchestration**: a parent `simulation_exam` record that sequences 3 `exam_session` records.
2. **UI restrictions**: stripping the back button, flag button, and confidence rating via a `mode === "simulation"` prop passed down the component tree.
3. **Break screen**: a new interstitial route between section sessions.
4. **Score report**: a new results screen that aggregates 3 `exam_session` results.

### Recommended implementation order

| # | Task | Effort |
|---|---|---|
| 1 | Schema: `simulation_exams` + `simulation_sections` tables | ~1h |
| 2 | Setup wizard UI (section order + question bank assignment) | ~3h |
| 3 | Section orchestration (sequencing 3 sessions, tracking state) | ~3h |
| 4 | UI restrictions (remove back/flag/confidence in simulation mode) | ~1h |
| 5 | Section timer (independent per-section, Date-based, auto-submit) | ~2h |
| 6 | Section Summary Screen | ~1h |
| 7 | Break screen with countdown + auto-resume | ~2h |
| 8 | Score report screen with simulated scoring | ~2h |
| 9 | Analytics integration (score chart + Pattern Tracker tagging) | ~2h |

**Total estimated effort: ~17 hours**

---

*Feature 5 addendum to GMAT-WEB Simulator PRD v1.0 · March 2026*
*GMAT Focus Edition · April 2, 2026 · Target: 680+*
