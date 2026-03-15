# GMAT Focus Edition UI Simulation — Design Spec

**Date:** 2026-03-15
**Status:** Approved by user
**Scope:** Exam page UI redesign to match GMAT Focus Edition official interface

---

## Overview

Redesign the exam page (`app/exam/[sessionId]/page.tsx`) and related components so that **timed** and **simulation** modes visually match the official GMAT Focus Edition interface, while **practice** and **review** modes preserve the existing UI (with Q-number bubbles and dark theme). Additionally implement a **Review & Edit screen**, a **Sort-by dropdown** for Table Analysis, and a **Timer Ring toggle** at setup.

---

## 1. Mode-Aware Header

### Timed / Simulation modes
- Background: `#1e3a8a` (deep blue)
- Left: `"Question X of Y"` in `rgba(255,255,255,0.6)` small text
- Center: countdown timer `MM:SS` in white monospace bold (color shifts to amber `#fbbf24` under 5 min, red `#f87171` under 1 min)
- Right: `Submit` button (transparent, white border/text)
- **No Q-number bubbles**

### Practice / Review modes
- Keep existing dark navy header (`#0d1b2e`) with Q-number bubbles, elapsed timer `+MM:SS`, and Dashboard button
- No changes

---

## 2. Mode-Aware Footer

### Timed / Simulation modes
- Background: `#1e3a8a` (same blue as header)
- Left group: `⏸ Pause` | `⬇ Save for Later` — white text links (no functional implementation needed for Pause; shows a "Paused" overlay. Save for Later = existing Dashboard navigation)
- Right group: `← Back` (white outline button) · `X / Y` counter (muted white) · `Next ›` (white filled button, blue text)

### Practice / Review modes
- Keep existing dark footer, Back/counter/Next unchanged

---

## 3. DI Left Panel Header + Sort-by Dropdown

### Left panel section header — DI questions
Applies when `question_type` is one of: `Table Analysis`, `Multi-Source Reasoning`, `Graphics Interpretation`, `Two-Part Analysis`.

- Background: `#2563eb`
- Text: `"DATA INSIGHTS · [QuestionType]"` — white, small caps, `10px`, tracking `0.1em`
- Right side: two icon buttons (filter `⊞` and grid `▤`) — `rgba(255,255,255,0.2)` background, 20×20px, for visual fidelity only (no click action needed)

### Sort-by dropdown — Table Analysis only
Rendered in the left panel, between the DI header bar and the passage/table content.

- A single row: `"Sort by:" <select>` listing all column names parsed from the markdown table
- Default selection: first column (usually the row label)
- On change: re-sort the parsed `rows[]` array client-side (ascending by string/number) and re-render the table
- State: local React `useState` inside `PassageContent` or a wrapper — no persistence needed
- Sort is per-session only (resets on navigation)

### Left panel header — RC questions
Keep existing gray `bg-[var(--exam-section-header-bg)]` header. No sort-by row.

---

## 4. Timer Ring Toggle at Exam Setup

**Location:** `app/exam/setup/page.tsx` — within the timed-mode options section.

**UI:** A labeled row with a toggle switch:
- Label: `"Show Timer Ring"` with subtitle `"Per-question countdown ring (Triage). Default: on."`
- Toggle: styled `<button role="switch">`, default `true`
- Stores preference to `localStorage` key `gmat-show-timer-ring`

**Consumption:** `app/exam/[sessionId]/page.tsx` reads this value on mount. When `false`, the `TimerRing` component is not rendered (already gated by `showTimerRing` prop).

**Scope:** Timer Ring only applies to timed mode with Triage enabled — the toggle only appears when those conditions are visible in setup.

---

## 5. Simulation Mode Timer Fix

**Problem:** `examStore.updateTimer` only handles `mode === 'timed'` for countdown; simulation uses elapsed.

**Fix in `store/examStore.ts`:**
```ts
updateTimer: (elapsedMs) => {
  const { mode, totalTimeMs } = get();
  if (mode === 'timed' || mode === 'simulation') {
    set({ remainingTimeMs: Math.max(0, totalTimeMs - elapsedMs) });
  } else {
    set({ remainingTimeMs: elapsedMs });
  }
}
```

**Timer display in `page.tsx`:**
```tsx
{(mode === 'timed' || mode === 'simulation')
  ? formatTime(remainingTimeMs)       // "12:34" countdown
  : `+${formatTime(remainingTimeMs)}`} // "+2:34" elapsed
```

**`totalTimeMs` for simulation:** Each section in simulation is 45 minutes (2,700,000 ms). This is already initialized via `simulationStore` when starting a section — verify `examStore.startSession` receives the correct `totalTimeMs` for simulation sections.

---

## 6. Review & Edit Screen

Shown after the user clicks **Submit** in timed or simulation mode (replaces the current confirm dialog), **only if time > 0**.

If time has expired when Submit is clicked → skip Review screen, go directly to results.

### 6a. State additions to `examStore`

```ts
interface ExamState {
  // existing fields...
  isInReviewEdit: boolean;           // true = user is on Review & Edit screen
  reviewEditCount: number;           // 0–3, edits consumed
  reviewEditQuestion: number | null; // index of question being reviewed (null = on overview)
}
```

Actions:
- `enterReviewEdit()` — sets `isInReviewEdit = true`, `reviewEditCount = 0`
- `exitReviewEdit()` — sets `isInReviewEdit = false`, triggers submit flow
- `startEditQuestion(index)` — sets `reviewEditQuestion = index`, navigates to that question
- `confirmEdit()` — increments `reviewEditCount`, clears `reviewEditQuestion`, returns to overview
- `cancelEdit()` — clears `reviewEditQuestion`, returns to overview without consuming edit

Max edits: 3. When `reviewEditCount >= 3`, attempting `startEditQuestion` shows a toast ("No edits remaining") and does not navigate.

### 6b. Review Center screen layout

Rendered inside the existing exam page when `isInReviewEdit === true && reviewEditQuestion === null`.

**Top bar (dark navy `#1a2942`):**
- Left: exam name or section label
- Right: `"⏱ Time Remaining: MM:SS"` (amber) + `"Remaining Edits: X"` (green)

**Sub-header bar (`#2563eb`):**
- Text: `"Review Center: [SectionType]"`

**Body (white):**
- `<h3>Click on Question to Review & Edit</h3>`
- Subtitle paragraph
- Table: two columns `Question | Bookmarked`
  - Question column: blue underlined links `1`, `2`, `3`… (clicking calls `startEditQuestion(i)`)
  - Bookmarked column: shows `🏴` if `questionStates[i].flagged`, else empty
  - Edited questions get a `✏` suffix on their number: `"3 ✏"`

**Footer bar (`#2563eb`):**
- Left: `"? Help"` (noop)
- Right: `"End Section Review →"` button (calls `exitReviewEdit()`)

**Timer continues counting down** while on this screen. If it hits 0 → auto-call `exitReviewEdit()`.

### 6c. Edit confirmation dialog

When user is reviewing a specific question (`reviewEditQuestion !== null`) and changes their answer then clicks Next/Confirm:

A modal dialog appears:
- Title bar: `"Answer Edit Confirmation"` (blue `#1e3a8a`)
- Body: `"⚠️ Do you want to change your answer to this question?"`
- Button 1: `"Yes, Change Answer"` → calls `confirmEdit()`, saves new answer, returns to Review overview
- Button 2: `"No, Keep Original Answer and Return to Question"` → calls `cancelEdit()`, restores original answer
- Footer: `"Remaining Answer Edits: X"`

### 6d. Review banner during question editing

When `isInReviewEdit === true && reviewEditQuestion !== null`, render a yellow banner above the question content:

> `"⚠ Review Mode — Editing Q{n} · {X} edits remaining · Select your answer then click Confirm"`

This replaces the normal meta-badges area.

---

## 7. Edge Cases

| Scenario | Behaviour |
|----------|-----------|
| Time expires during Review screen | Auto `exitReviewEdit()` → submit |
| Time expires before Submit clicked | Submit button disabled; auto-submit with current answers |
| `reviewEditCount` reaches 3 | Clicking any question shows toast; `startEditQuestion` blocked |
| Practice / Review mode Submit | Skip Review screen entirely; go to results |
| Simulation mode section complete | Show Review screen per-section before break/next-section flow |
| User navigates Back during review | Not allowed — Back button hidden on Review overview screen |

---

## 8. Files Changed

| File | Change |
|------|--------|
| `app/exam/[sessionId]/page.tsx` | Header/footer mode-aware, Review screen render, confirm dialog, banner |
| `store/examStore.ts` | `updateTimer` fix, `isInReviewEdit`, `reviewEditCount`, `reviewEditQuestion`, new actions |
| `app/exam/setup/page.tsx` | Timer Ring toggle UI + localStorage write |
| `components/exam/DIRenderers.tsx` | Sort-by dropdown in `PassageContent` for `table_markdown` |

---

## 9. Out of Scope

- Calculator (separate feature, requires data model changes)
- Scratchpad / whiteboard
- Adaptive difficulty algorithm
- Text highlight / strikethrough tools
- "Pause" functional implementation (overlay only)
