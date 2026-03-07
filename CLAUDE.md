# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Start development server (Next.js)
npm run build    # Production build
npm run lint     # Run ESLint
```

No test suite is configured.

## Architecture Overview

**Stack:** Next.js 16 (App Router) + React 19 + TypeScript + Tailwind CSS 4 + Zustand + Supabase

### Database Layer: Dual-mode persistence (`lib/db.ts`)

All database access goes through `lib/db.ts`, which implements every CRUD operation twice:
- **Primary:** Supabase (PostgreSQL via `@supabase/supabase-js`)
- **Fallback:** localStorage (with SSR safety guards)

The pattern is: try Supabase client → catch error → fall back to localStorage. Do not bypass this layer by calling Supabase directly in pages.

`lib/supabase.ts` initializes the Supabase client from `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

### State Management: Two Zustand stores (`store/`)

Both stores use `persist` middleware (localStorage key: `gmat-*`).

- **`examStore.ts`** — Manages an active exam session: current question index, per-question state (selected answer, flags, time spent, feature-specific data), timer, and a queue of pending tracking events to flush on submit.
- **`simulationStore.ts`** — Manages the multi-section simulation workflow. Status machine: `idle → countdown → in_section → section_summary → break → completed`. Tracks which section is active and accumulates `SectionResult[]`.

### Core Types (`types/gmat.ts`)

All entities are defined here. Key relationships:
- `QuestionSet` → has many `Question`
- `ExamSession` → has many `QuestionResponse` → has many `TrackingEvent`
- `SimulationExam` → has many `SimulationSection` → each section wraps an `ExamSession`
- `SectionType = 'quant' | 'verbal' | 'di'`
- `ExamMode = 'timed' | 'practice' | 'review' | 'simulation'`

### Question Parsing (`lib/parsers/`)

Three entry points (PDF, DOCX, plain text) all funnel into `questionParser.ts → parseGMATDocument(rawText)`. The parser:
1. Normalizes text (curly quotes, em-dashes)
2. Extracts header metadata (section, difficulty, topics)
3. Splits question blocks from answer key blocks
4. Merges them into `Question[]`

Data Sufficiency questions auto-populate the standard 5 choices. Reading Comprehension questions share a `passage_id`.

### Exam Features by Mode

The `ExamMode` drives behavior differences inside `examStore` and exam pages:
- **timed** — Countdown timer, strict navigation
- **practice** — No timer, can deselect answers
- **review** — All answers visible pre-submission
- **simulation** — Full mock: 3 sections × 45 min, optional 10-min breaks between sections

Feature-specific fields on `QuestionResponse`/`QuestionState`:
- **Error categorization** — `errorCategory: 'Content' | 'Process' | 'Habit'`, `note`
- **Triage** — `triageTriggered` (flag & skip slow questions)
- **CR Missing Link** — `missingLink`, `choicesUnlocked` (write inference before seeing choices)
- **RC Passage Map** — `passageMap`, `passageMapComplete`

### Routing (App Router)

```
app/
  page.tsx                          # Dashboard
  import/page.tsx                   # File upload → parse → save
  exam/
    setup/page.tsx                  # Quick exam setup (single set)
    [sessionId]/page.tsx            # Active exam
    simulation/
      setup/page.tsx                # 3-step simulation wizard
      [id]/page.tsx                 # Simulation exam in progress
      [id]/break/page.tsx           # Inter-section break
      [id]/score/page.tsx           # Final score report
  results/[sessionId]/page.tsx      # Detailed post-exam analysis
  analytics/page.tsx                # Performance trends
```

### UI Conventions

- **Dark mode only** — `html` has `className="dark"` in root layout; do not add light mode toggles.
- **Components:** shadcn/ui (`components/ui/`) wrapping Radix UI primitives. Add new components via `npx shadcn@latest add <component>`.
- **Icons:** Lucide React.
- **Toasts:** `sonner` — import `toast` from `"sonner"`.
- **Styling:** `cn()` from `lib/utils.ts` for conditional class merging (clsx + tailwind-merge).
- **Path alias:** `@/` maps to project root.

### Simulation Score Calculation

Scaled scores are estimated per section (60–90 range) based on raw correct/total and time used. See `app/exam/simulation/[id]/score/page.tsx` for the scoring formula.

### Section-to-Question-Set Matching

`SECTION_TYPE_TO_SET_SECTION` in `simulationStore.ts` maps `SectionType` to the section name strings that appear in imported question sets. Used in the simulation setup wizard to filter compatible question sets per section.
