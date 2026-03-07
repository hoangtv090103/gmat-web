# Question Set CRUD — Design Doc

**Date:** 2026-03-07
**Status:** Approved

---

## Overview

Add full CRUD capabilities for Question Sets and their individual Questions, accessible from the dashboard and from Claude Desktop (MCP tools). All icons use `FaIcon` from `@/components/ui/fa-icon` (FontAwesome React).

---

## Scope

1. **Set metadata editing** — name, section, difficulty_range, topics, target, study_date
2. **Individual question editing** — all fields including DI-specific (two_part_col*_label, correct_answer2) and DS-specific (statement1/2, s1/s2_verdict, reasoning)
3. **Delete** — question set (cascades) or individual question
4. **MCP tools** — 4 new tools for Claude Desktop

---

## UI Architecture (Approach B: Modal + Sheet from dashboard)

### Dashboard (`app/page.tsx`)
- Add `⋯` kebab menu (FaIcon `faEllipsisVertical`) on each set card
- Menu items (all with FaIcon):
  - `faPencil` — Edit Set Info → opens `SetEditModal`
  - `faListUl` — Manage Questions → opens `QuestionManagerSheet`
  - `faTrash` — Delete Set → opens `DeleteConfirmDialog`

### `components/question-sets/SetEditModal.tsx`
- shadcn `Dialog` modal
- Form fields: name, section (Select), difficulty_range, topics, target, study_date
- Submit calls `updateQuestionSet()` → toast success/error
- FaIcon: `faXmark` (close), `faFloppyDisk` (save)

### `components/question-sets/QuestionManagerSheet.tsx`
- shadcn `Sheet` (side panel, right side)
- Header: set name + question count
- Scrollable question list: question_number, question_type, difficulty, stem (truncated)
- Per-question actions (FaIcon):
  - `faPencil` — opens inline edit accordion (or sub-dialog)
  - `faTrash` — opens `DeleteConfirmDialog` for that question
- Question edit form: 3 tabs
  - **Metadata**: question_number, difficulty, question_type, topic
  - **Content**: stem, statement1/2 (DS), choices A-E, correct_answer, explanation
  - **Type-specific**: two_part_col1/2_label, correct_answer2, s1/s2_verdict, reasoning
- FaIcon: `faXmark` (close), `faFloppyDisk` (save per question)

### `components/question-sets/DeleteConfirmDialog.tsx`
- shadcn `Dialog`, reusable for set or question deletion
- Props: `title`, `description`, `onConfirm`, `onCancel`
- FaIcon: `faTriangleExclamation` (warning), `faTrash` (confirm button)

---

## Database Layer (`lib/db.ts`)

```typescript
updateQuestionSet(id: string, updates: Partial<QuestionSet>): Promise<void>
updateQuestion(id: string, updates: Partial<Question>): Promise<void>
deleteQuestion(id: string): Promise<void>
// deleteQuestionSet already exists — verify and use it
```

Each function: Supabase primary → localStorage fallback.

---

## MCP Tools (`mcp-server/src/tools/crud.ts`)

4 new tools registered via `registerCrudTools`:

| Tool | Input | Description |
|------|-------|-------------|
| `update_question_set` | id, partial metadata fields | Update set name, section, topics, etc. |
| `delete_question_set` | id | Delete set + all questions |
| `update_question` | id, partial question fields | Update any question field |
| `delete_question` | id | Delete single question |

Register in `index.ts`, update tool count from 18 → 22.

---

## Files Changed

| File | Change |
|------|--------|
| `app/page.tsx` | Add kebab menu with FaIcon per set card |
| `lib/db.ts` | Add `updateQuestionSet`, `updateQuestion`, `deleteQuestion` |
| `components/question-sets/SetEditModal.tsx` | NEW |
| `components/question-sets/QuestionManagerSheet.tsx` | NEW |
| `components/question-sets/DeleteConfirmDialog.tsx` | NEW |
| `mcp-server/src/tools/crud.ts` | NEW |
| `mcp-server/src/index.ts` | Register `registerCrudTools`, count → 22 |

---

## Icon Reference (FaIcon only)

```typescript
import { faEllipsisVertical, faPencil, faTrash, faListUl,
         faXmark, faFloppyDisk, faTriangleExclamation }
  from "@fortawesome/free-solid-svg-icons";
```

No Lucide icons in CRUD components.
