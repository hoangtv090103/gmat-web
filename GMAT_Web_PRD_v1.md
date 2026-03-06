# GMAT-WEB Simulator — Product Requirements Document

**Feature Roadmap:** Smart Error Log · 2-Min Triage · CR Missing Link · RC Passage Map
**Version:** 1.0 · March 2026 · Author: Hoang Tran

---

## Table of Contents

1. [Background & Context](#1-background--context)
2. [Feature 1 — Smart Error Log](#2-feature-1--smart-error-log)
3. [Feature 2 — Per-Question 2-Min Timer & Triage](#3-feature-2--per-question-2-min-timer--triage-enforcement)
4. [Feature 3 — CR Missing Link Input](#4-feature-3--cr-missing-link-input)
5. [Feature 4 — RC Passage Map](#5-feature-4--rc-passage-map)
6. [Data Model Changes](#6-data-model-changes)
7. [Implementation Order & Effort Estimates](#7-implementation-order--effort-estimates)

---

## 1. Background & Context

### 1.1 Current State

`gmat-web` is a functional exam simulator: it can import question banks, run timed/practice/review sessions, and surface basic accuracy and time-per-question analytics. The core exam loop works well.

However, the product currently serves **doing** — it does not serve **learning**. The gap between "I completed a session" and "I understand why I keep making the same mistakes" is entirely manual today.

### 1.2 The Learning Workflow This PRD Addresses

The target user (Hoang, GMAT April 2 2026, target 680+) follows a structured study routine built on four pillars:

1. **Error categorization** — every mistake is classified as Content, Process, or Habit immediately after the session.
2. **Pattern detection** — recurring errors (same topic × same category across multiple sessions) are surfaced and prioritized.
3. **Technique enforcement** — specific methods (Missing Link for CR, Passage Map for RC) must be applied *before* answer selection, not after.
4. **Time discipline** — the 2-minute rule is non-negotiable; the system should enforce it, not rely on willpower alone.

None of these four pillars are currently supported by `gmat-web`. This PRD specifies exactly how to add them.

### 1.3 Scope Boundaries

**✅ In Scope**
- Smart Error Log with Content / Process / Habit categorization
- Per-question 2-minute countdown widget with Triage enforcement
- CR Missing Link input field, shown before answer choices unlock
- RC Passage Map structured input per paragraph
- Pattern tracking: alert when same topic × category appears ≥ 2 times
- Minimal schema additions to support the above

**❌ Out of Scope**
- AI-generated explanations or hints
- Spaced repetition / flashcard system
- Multi-user / shared question banks
- Mobile-native app

---

## 2. Feature 1 — Smart Error Log

### 2.1 Problem Statement

The current results page shows which questions were wrong (My Answer vs. Correct Answer) but provides no structured way to categorize *why* they were wrong. Without categorization, the user cannot distinguish a knowledge gap from a method error from carelessness — and the system cannot detect recurring patterns.

The existing "Error Type" column in the results table simply shows "Review needed" for every wrong answer, which is useless for targeted remediation.

---

### US-1.1 — Inline Categorization After Submission

> **As a user** who has just submitted an exam session,
> **I want to** immediately categorize each wrong answer as Content, Process, or Habit,
> **So that** I can build an accurate error log without switching to a separate tool.

| Attribute | Detail |
|---|---|
| **Trigger** | User lands on `/results/[sessionId]` after completing a timed or practice session. |
| **Entry point** | Each row in the Question Review table that shows ❌ or ⏭️ has a new inline expansion zone below it. |
| **Required fields** | • **Error Category** (required before saving): Content / Process / Habit — rendered as 3 large toggle buttons, not a dropdown.<br>• **Note** (optional): free-text input, placeholder "What will I do differently?", max 200 chars. |
| **Saving** | Auto-save on category selection. Note saves on blur. No explicit "Save" button needed. |
| **Visual state** | Once categorized, the row header shows a colored badge: 🔴 Content / 🟡 Process / 🔵 Habit. Uncategorized wrong answers show a pulsing amber dot to prompt action. |
| **Constraint** | If the session is in "review" mode (no answers submitted), categorization is disabled — the UI shows "Categorization only available after timed or practice sessions." |

---

### US-1.2 — Error Category Definitions

Shown in UI as tooltips on the toggle buttons.

| Category | Definition | Example |
|---|---|---|
| 🔴 **Content** | Missing knowledge: formula, rule, or concept not known. | "Did not know the harmonic mean formula for round-trip speed." |
| 🟡 **Process** | Wrong method applied despite knowing the material. | "Chose weaker CR attack instead of the control-group evidence." |
| 🔵 **Habit** | Carelessness, skipped step, or time pressure error. | "Used with-replacement logic even though problem said without replacement." |

---

### US-1.3 — Error Log Summary Section (bottom of Results page)

> **As a user** reviewing my session results,
> **I want** a consolidated Error Log table at the bottom of the page,
> **So that** I can see all my mistakes, their categories, and my notes in one place — and export them.

| Attribute | Detail |
|---|---|
| **Location** | Replaces the existing bare "Error Log" table at the bottom of the results page. |
| **Columns** | Q# · Topic · Difficulty · My Answer · Correct Answer · Category (badge) · Note (truncated, expand on click) · Time Spent |
| **Filtering** | Filter tabs above the table: `All` \| `Content` \| `Process` \| `Habit`. Default: All. |
| **Export** | "Export Error Log" → downloads `.csv`. Filename: `error-log-[sessionId]-[date].csv` |
| **Empty state** | If no wrong answers: "🎉 Perfect score — no errors to log!" |
| **Uncategorized prompt** | If wrong answers exist but none are categorized yet: amber banner "⚠️ Categorize your errors to enable pattern tracking." |

---

### US-1.4 — Cross-Session Pattern Tracker (Analytics page)

> **As a user** who has completed multiple sessions,
> **I want to** see which error patterns repeat across sessions,
> **So that** I can identify my most persistent weaknesses and prioritize them.

| Attribute | Detail |
|---|---|
| **Location** | New "Pattern Tracker" card on `/analytics`, positioned above the existing Weakness Areas card. |
| **Pattern definition** | A pattern = same **topic** AND same **error category** appearing in ≥ 2 distinct sessions. |
| **Table columns** | Topic · Category badge · Count · Sessions · Last Seen · Status |
| **Status tiers** | 🔴 CRITICAL (≥4 occurrences) · 🟠 WATCH (3) · 🟡 EMERGING (2) |
| **Alert** | When a new session creates or escalates a pattern → toast: "⚠️ Recurring pattern detected: Without-replacement · Habit · 3rd time." |
| **Empty state** | "No recurring patterns yet. Categorize at least 2 sessions to enable pattern detection." |
| **Drill-down** | Clicking a pattern row opens a slide-over panel listing all contributing questions with session dates and notes. |

---

### US-1.5 — Persistence

| Attribute | Detail |
|---|---|
| **Supabase (primary)** | Add `error_category` (text) and `note` (text) columns to `question_responses` table. No new table needed. |
| **localStorage (fallback)** | Existing `gmat_responses` key — add `error_category` and `note` fields to each response object. Auto-migrate on read: if field missing, treat as `undefined`. |
| **Auto-save timing** | Debounce note saves by 800ms to avoid excessive writes. |

### 2.2 Acceptance Criteria

1. After submitting a session, each wrong answer row shows 3 category toggle buttons (Content / Process / Habit).
2. Selecting a category auto-saves and shows a colored badge within 300ms.
3. Uncategorized wrong answers show a pulsing amber dot until categorized.
4. The Error Log table shows all wrong answers with correct columns and filter tabs.
5. Exporting the error log downloads a valid `.csv` with all columns populated.
6. On the Analytics page, the Pattern Tracker card correctly identifies patterns across sessions.
7. A toast fires when a pattern is created or escalates (≥2 occurrences).
8. All data persists correctly in both Supabase and localStorage paths.

### 2.3 Non-Goals

- No AI-suggested categorization — user must categorize manually every time.
- No gamification or streaks for error log completion.
- Pattern detection does not run in real-time during an exam — only post-session.

---

## 3. Feature 2 — Per-Question 2-Min Timer & Triage Enforcement

### 3.1 Problem Statement

The user regularly spends 4–7 minutes on hard questions in timed sessions. The existing timer shows total time remaining but gives no per-question signal. There is no mechanism that says "you have been on this question for 2 minutes — make a decision."

The 2-minute rule is the most critical time management discipline for GMAT Focus Edition. The system should enforce it, not passively observe it.

---

### US-2.1 — Per-Question Countdown Ring

> **As a user** in timed mode,
> **I want** a visual countdown for the current question that warns me at 2 minutes,
> **So that** I know when to apply the Triage strategy (educated guess + move on) without watching the global timer.

| Attribute | Detail |
|---|---|
| **Modes** | Active only in `timed` mode. In `practice`: count-up, no warning. In `review`: hidden. |
| **Component** | Circular SVG progress ring, positioned top-right of the question card, next to the flag button. Diameter: 48px. |
| **Color states** | 0–90s: Blue `#3B82F6` · 90–120s: Amber `#F59E0B` · 120s+: Red `#EF4444` + pulse animation |
| **Label** | Numeric seconds remaining inside the ring (e.g. "47"). At 0 shows "!". |
| **Reset** | Ring resets to full on every question navigation (`navigateTo`, `navigateNext`, `navigateBack`). |
| **Global timer relation** | Per-question ring is independent of the global session timer. Both shown simultaneously. |
| **Accessibility** | `aria-label="Question timer: X seconds remaining"`. Pulse animation respects `prefers-reduced-motion`. |

---

### US-2.2 — Triage Modal at 2-Minute Mark

> **As a user** who has spent exactly 2 minutes on a question without answering,
> **I want** to be shown a non-blocking Triage prompt,
> **So that** I am reminded to make an educated guess and move on rather than continue spiraling.

| Attribute | Detail |
|---|---|
| **Trigger condition** | User on current question for exactly 120s AND has not selected an answer. Fires once per question. |
| **UI component** | Bottom-anchored slide-up banner (not a blocking modal). Height: ~80px. Does not cover answer choices. |
| **Content** | "⏰ 2 minutes. Make your best guess and move on — do not spiral." + two buttons: **"Flag & Next →"** (primary, blue) and **"Dismiss"** (ghost). |
| **"Flag & Next" action** | (1) Flags the current question · (2) Records `triage_triggered` event · (3) Navigates to next question. |
| **"Dismiss" action** | Closes the banner. Records `triage_dismissed` event. Banner does not reappear for this question. |
| **If already answered** | If user answers within 120s, banner never appears — even if they stay on the question longer. |
| **Practice mode variant** | Banner appears at 180s (not 120s). Copy: "3 minutes — even in practice, enforce the habit." No "Flag & Next", only "Dismiss + Flag". |

---

### US-2.3 — Per-Question Time Analytics (Results page)

> **As a user** reviewing my results,
> **I want to** see which questions triggered the triage warning and how long I spent on each,
> **So that** I can identify my time management pattern.

| Attribute | Detail |
|---|---|
| **Results table** | Color-coded "⏱ Time" column: green ≤90s · amber 90–120s · red >120s. |
| **Triage indicator** | Questions where triage banner fired show ⏰ icon next to time. Tooltip: "Triage warning triggered." |
| **Time chart** | Enhance existing "Time per Question" bar chart: add red reference line at 120s labeled "Triage threshold." Bars exceeding it are red regardless of correctness. |
| **Session summary** | New stat card: "Triage events: N". Color: amber if N > 2. |

---

### US-2.4 — Tracking Events to Add

| Event Type | Payload |
|---|---|
| `triage_triggered` | `{ question_id, question_number, time_on_question_ms }` |
| `triage_dismissed` | `{ question_id, question_number }` |
| `triage_flag_and_next` | `{ question_id, question_number, navigated_to }` |

### 3.2 Acceptance Criteria

1. In timed mode, a 48px circular countdown ring appears top-right of the question card and resets on every navigation.
2. Ring transitions: blue → amber at 90s → red+pulse at 120s.
3. At exactly 120s with no answer selected, the triage banner slides up from the bottom.
4. "Flag & Next" flags the question, records the event, and navigates forward in one click.
5. "Dismiss" closes the banner and records `triage_dismissed`. Banner does not return for that question.
6. In practice mode the banner appears at 180s with adjusted copy.
7. Results page "Time" column is color-coded and shows ⏰ on triage-triggered questions.
8. Time distribution chart has a 120s red reference line.

### 3.3 Non-Goals

- No auto-submission when per-question time expires — the session timer handles session-level auto-submit.
- No per-question time limit that locks out the user.
- No different thresholds per question type — all questions use the 2-minute rule.

---

## 4. Feature 3 — CR Missing Link Input

### 4.1 Problem Statement

The user's CR error pattern is consistent: answer choices are evaluated without first identifying the Missing Link (the assumption gap between evidence and conclusion). The method states "write the Missing Link BEFORE reading answer choices" — but the current UI renders the question stem and all five answer choices simultaneously, making it trivially easy to skip this step.

The system should structurally enforce the sequence: **stem → Missing Link written → choices unlock**.

---

### US-3.1 — Missing Link Gate for CR Questions

> **As a user** answering a Critical Reasoning question,
> **I want** to be required to write the Missing Link before the answer choices are revealed,
> **So that** I build the habit of identifying the assumption gap before evaluating options.

| Attribute | Detail |
|---|---|
| **Applies to** | All questions where `question_type === "Critical Reasoning"`. Does NOT apply to Quant, DS, or RC. |
| **Modes** | Active in `timed` and `practice`. In `review`: Missing Link field shown pre-filled (read-only), choices always visible. |
| **Initial state** | Answer choices are blurred (`filter: blur(4px)` + `pointer-events: none`) with overlay: "Missing Link required." |
| **Missing Link input** | Textarea, 2 rows, full width. Placeholder: "What assumption connects the evidence to the conclusion?" Minimum 10 characters to unlock. Character count: "X / 300". |
| **Unlock button** | "Unlock Answer Choices →" — disabled until ≥10 chars entered. |
| **Unlock behavior** | (1) Saves the Missing Link text · (2) Un-blurs choices with 300ms fade-in · (3) Focuses first answer choice. |
| **Re-visit behavior** | If user navigates back to an already-unlocked CR question: choices shown immediately. Missing Link textarea shown above choices in read-only collapsible state. No re-entry required. |
| **Bypass** | No bypass in timed mode. In practice mode: small "Skip (not recommended)" text link — fires `missing_link_skipped` event and unlocks choices. |
| **Timer interaction** | The per-question 2-min timer (Feature 2) does NOT start until the Missing Link is unlocked. Clock starts on unlock click. |

---

### US-3.2 — Missing Link Shown in Results

> **As a user** reviewing my results after a session,
> **I want to** see the Missing Link I wrote next to each CR question,
> **So that** I can compare it against the correct Missing Link in the explanation.

| Attribute | Detail |
|---|---|
| **Results table** | For CR rows: expand zone shows "My Missing Link: [user's text]" above the explanation. |
| **Error Log** | If a CR question was wrong: the Error Log table shows the Missing Link in a dedicated column. |
| **Analytics** | New session metric: "CR Missing Link written: X / Y CR questions." |

---

### US-3.3 — Tracking Events to Add

| Event Type | Payload |
|---|---|
| `missing_link_written` | `{ question_id, text_length, time_to_write_ms }` |
| `missing_link_skipped` | `{ question_id }` |
| `choices_unlocked` | `{ question_id, method: "written" \| "skipped" }` |

### 4.2 Data Model

| Location | Field | Type / Notes |
|---|---|---|
| `question_responses` (DB) | `missing_link` | `text`, nullable. Stores user's Missing Link text. |
| `QuestionState` (store) | `missingLink` | `string \| undefined`. In-memory during session. |
| `QuestionState` (store) | `choicesUnlocked` | `boolean`. Default `false` for CR questions, `true` for all others. |

### 4.3 Acceptance Criteria

1. When a CR question is first displayed in timed/practice mode, answer choices are blurred and a Missing Link textarea is shown.
2. "Unlock Answer Choices →" is disabled until ≥10 characters are entered.
3. Clicking unlock saves the text, un-blurs choices with a 300ms fade, and starts the per-question timer.
4. Navigating back to an already-unlocked CR question shows choices immediately with a collapsed read-only Missing Link display.
5. In review mode, Missing Link field is visible and read-only; choices are never blurred.
6. In practice mode, a "Skip" link is available and fires the `missing_link_skipped` event.
7. Results page shows "My Missing Link" above the explanation for each CR question.
8. `missing_link` text is persisted to both Supabase and localStorage.

### 4.4 Non-Goals

- No AI scoring of the quality of the Missing Link text.
- No "correct Missing Link" stored in the system — users compare manually against the explanation.
- Missing Link gate applies to ALL CR questions uniformly, regardless of sub-type (Strengthen, Evaluate, etc.).

---

## 5. Feature 4 — RC Passage Map

### 5.1 Problem Statement

RC questions are currently rendered with the passage and all questions visible simultaneously. The user's RC method requires mapping each paragraph before answering any question. Without a structured input for the map, this step is either skipped or done on paper, disconnected from the digital workflow.

More importantly, the current layout has a structural flaw: question stem and answer choices appear below the passage as a continuous scroll, encouraging students to read questions before finishing the passage — exactly the wrong behavior.

---

### US-4.1 — Passage-First Layout

> **As a user** answering Reading Comprehension questions,
> **I want** the passage to occupy the full screen before any questions are shown,
> **So that** I am not tempted to read the questions before finishing the passage.

| Attribute | Detail |
|---|---|
| **Applies to** | All questions where `question_type === "Reading Comprehension"`. RC questions sharing the same passage are grouped. |
| **Layout** | Two-column: left column (55%) = passage + passage map. Right column (45%) = questions (blurred until map complete). |
| **Passage display** | Numbered paragraphs labeled P1, P2, P3 in blue. Scrollable within column. Fixed height: 100% viewport. |
| **Initial state** | Right column blurred with overlay: "Complete the Passage Map to unlock questions." |
| **Re-visit** | If all questions already answered: passage + map in read-only mode, questions column unlocked. |

---

### US-4.2 — Structured Passage Map Input

> **As a user** reading a passage before answering RC questions,
> **I want** a structured input to map each paragraph in my own words,
> **So that** I build a mental model of the passage structure before evaluating answer choices.

| Attribute | Detail |
|---|---|
| **Location** | Below the passage in the left column, labeled "Passage Map." |
| **Structure** | One textarea per paragraph (auto-generated from paragraph count), labeled "P1:", "P2:", etc. Plus one final "Main Idea:" field. |
| **Placeholder** | Each paragraph field: "Main point of this paragraph (1 sentence max)." Main Idea field: "Overall argument of the passage." |
| **Unlock condition** | All paragraph fields AND Main Idea field must have ≥5 characters. Incomplete fields highlighted in amber. |
| **"Proceed to Questions →"** | Appears below the map. Disabled until all fields complete. On click: un-blurs right column, records `passage_map_completed` event, starts per-question timer for Q1. |
| **Re-visit** | Map shown in read-only collapsed form with "Edit map" toggle. |
| **Character limits** | Per-paragraph: 150 chars. Main Idea: 200 chars. |
| **Bypass** | `practice` mode only: "Skip Map (not recommended)" link. `timed` mode: no bypass. `review` mode: map shown read-only. |

---

### US-4.3 — Question Navigation Within Passage

> **As a user** answering multiple RC questions about the same passage,
> **I want** the passage to remain visible while I navigate between questions,
> **So that** I can refer back to the text without losing my place.

| Attribute | Detail |
|---|---|
| **Passage persistence** | Left column (passage + map) stays fixed while user navigates Q1 → Q2 → Q3 in the right column. |
| **Question panel** | Right column shows one question at a time. Navigation arrows ("← Q2 / Q3 →") at the bottom of the right column. |
| **Map toggle** | "Show/Hide Map" chevron collapses the passage map to show more passage text. Collapsed by default once questions are unlocked. |
| **Global progress dots** | RC questions in the same passage group are visually grouped with a bracket indicator in the top progress bar. |

---

### US-4.4 — Passage Map in Results & Analytics

| Attribute | Detail |
|---|---|
| **Results page** | For RC questions: expand zone shows the user's full passage map (P1/P2/P3 + Main Idea) above the explanation. |
| **Analytics** | Session summary: "RC Passage Maps completed: X / Y passages." Skipped maps shown in amber. |
| **Error Log** | RC wrong answers: "Map completed?" shown as ✅ / ⏭️ in the Error Log table. |

---

### US-4.5 — Tracking Events to Add

| Event Type | Payload |
|---|---|
| `passage_map_started` | `{ passage_id, question_ids[] }` |
| `passage_map_completed` | `{ passage_id, time_to_complete_ms, paragraph_count }` |
| `passage_map_skipped` | `{ passage_id }` |
| `rc_questions_unlocked` | `{ passage_id, method: "map" \| "skipped" }` |

### 5.2 Passage Grouping Logic

> ⚠️ **Implementation Note:** RC questions sharing the same passage must be identified and grouped. Currently the schema has no `passage_id` field.
>
> **Detection logic:** Questions with `question_type === "Reading Comprehension"` and the same stem prefix (first 100 chars) are considered to share a passage. A more robust approach is to add a `passage_id` column to the `questions` table (nullable, RC only). See Section 6.
>
> **Until `passage_id` is added:** use best-effort prefix-match grouping on the client side.

### 5.3 Acceptance Criteria

1. RC questions display in a two-column layout: passage (left) + questions (right).
2. Right column is blurred until passage map is complete.
3. Passage map has one textarea per paragraph plus a Main Idea field.
4. "Proceed to Questions →" is disabled until all map fields have ≥5 characters.
5. Clicking the button un-blurs the right column, starts the per-question timer, and records `passage_map_completed`.
6. Passage remains visible as user navigates between questions in the same passage group.
7. In review mode, map is shown read-only; no gate is active.
8. In practice mode, a "Skip Map" bypass is available and records `passage_map_skipped`.
9. Results page shows the user's full passage map for each RC question.

### 5.4 Non-Goals

- No automated passage parsing to detect paragraph count — use `\n\n` splits or manual paragraph markers.
- No "correct passage map" stored — users self-assess against explanation.
- No highlight-in-passage annotation tool in this version.

---

## 6. Data Model Changes

### 6.1 `question_responses` table — new columns

| Column | Type | Feature | Purpose |
|---|---|---|---|
| `error_category` | `text`, nullable | F1 | `"Content"` \| `"Process"` \| `"Habit"` |
| `note` | `text`, nullable | F1 | User's free-text error note |
| `missing_link` | `text`, nullable | F3 | User's Missing Link text (CR only) |
| `choices_unlocked_at_ms` | `integer`, nullable | F3 | Offset ms when choices were unlocked |
| `passage_map` | `jsonb`, nullable | F4 | `{ p1: string, p2: string, ..., mainIdea: string }` |
| `triage_triggered` | `boolean`, default `false` | F2 | Whether the 2-min triage banner fired |

### 6.2 `questions` table — new columns

| Column | Type | Feature | Purpose |
|---|---|---|---|
| `passage_id` | `uuid`, nullable | F4 | Groups RC questions sharing the same passage. Null for non-RC. |
| `passage_text` | `text`, nullable | F4 | Full passage text. Shared by all questions with the same `passage_id`. |

### 6.3 `QuestionState` (examStore.ts) — new fields

| Field | Type | Feature | Notes |
|---|---|---|---|
| `errorCategory` | `ErrorCategory \| undefined` | F1 | — |
| `note` | `string \| undefined` | F1 | — |
| `missingLink` | `string \| undefined` | F3 | CR questions only |
| `choicesUnlocked` | `boolean` | F3 | Default `false` for CR, `true` for all others |
| `passageMap` | `Record<string, string> \| undefined` | F4 | RC questions only. Keys: `"p1"`, `"p2"`, ..., `"mainIdea"` |
| `passageMapComplete` | `boolean` | F4 | Default `false` for RC, `true` for all others |
| `triageTriggered` | `boolean` | F2 | Whether the 2-min banner fired for this question |
| `questionTimerStartMs` | `number` | F2+F3 | `performance.now()` when this question's timer started |

### 6.4 New `TrackingEventType` values

Add to the `TrackingEventType` union in `types/gmat.ts`:

```ts
// Feature 2
| 'triage_triggered'
| 'triage_dismissed'
| 'triage_flag_and_next'

// Feature 3
| 'missing_link_written'
| 'missing_link_skipped'
| 'choices_unlocked'

// Feature 4
| 'passage_map_started'
| 'passage_map_completed'
| 'passage_map_skipped'
| 'rc_questions_unlocked'
```

---

## 7. Implementation Order & Effort Estimates

### 7.1 Recommended Sprint Order

| # | Task | Effort | Impact | Files Modified |
|---|---|---|---|---|
| 1 | Schema migrations (all features) | ~1h | Blocker | Supabase migration + `types/gmat.ts` + `examStore.ts` |
| 2 | Feature 2: Per-Q timer ring | ~2h | 🔥 Immediate | `exam/[sessionId]/page.tsx` |
| 3 | Feature 2: Triage banner | ~1.5h | 🔥 Immediate | `exam/[sessionId]/page.tsx` + `examStore.ts` |
| 4 | Feature 1: Inline categorization widget | ~3h | 📈 High | `results/[sessionId]/page.tsx` |
| 5 | Feature 1: Error Log table + export | ~2h | 📈 High | `results/[sessionId]/page.tsx` + `lib/db.ts` |
| 6 | Feature 1: Pattern tracker (analytics) | ~2.5h | 📈 High | `analytics/page.tsx` + `lib/db.ts` |
| 7 | Feature 3: CR Missing Link gate | ~3h | 📋 Method | `exam/[sessionId]/page.tsx` + `examStore.ts` |
| 8 | Feature 4: RC Passage Map | ~5h | 📋 Method | `exam/[sessionId]/page.tsx` + `examStore.ts` + `lib/db.ts` |

**Total estimated effort: ~20 hours**

### 7.2 Dependency Map

- **Feature 1** (Error Log) has no dependencies — can start immediately after schema migration.
- **Feature 2** (Timer) has no dependencies — fully self-contained in the exam page.
- **Feature 3** (Missing Link) depends on: `choicesUnlocked` state added in Feature 2 schema work.
- **Feature 4** (Passage Map) depends on: `passage_id` added to questions table + passage grouping logic.
- **Pattern Tracker** (Feature 1 part 2) depends on: at least 2 sessions with categorized errors in the DB.

### 7.3 Rollout Strategy

Given the April 2 exam deadline:

| Week | Work |
|---|---|
| **Mar 6–13** | Schema + Feature 2 (Timer + Triage). Addresses the #1 time management issue immediately. Low risk. |
| **Mar 14–20** | Feature 1 (Smart Error Log + Pattern Tracker). Start building categorized history that compounds over remaining sessions. |
| **Mar 21–28** | Feature 3 (CR Missing Link). Enforce method discipline during the final intensive practice phase. |
| **Mar 29–31** | Feature 4 (RC Passage Map) only if time permits — or defer to post-exam. RC is the smallest weakness area relative to Quant and CR. |

---

*Document complete. All stories are self-contained and implementation-ready. Start with Section 7.1 Task #1 (schema migration) before touching any feature code.*

*GMAT Focus Edition · April 2, 2026 · Target: 680+*
