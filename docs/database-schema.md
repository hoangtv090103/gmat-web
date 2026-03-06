# GMAT Web — Database Schema

All tables live in a Supabase (PostgreSQL) project. The application also maintains a full localStorage fallback using the same column names, so the schema below applies to both storage layers.

---

## Tables

### `question_sets`

Stores imported or AI-generated collections of GMAT questions.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | `uuid` | PK, default `gen_random_uuid()` | |
| `name` | `text` | NOT NULL | Display name, e.g. "DS Number Properties" |
| `section` | `text` | | GMAT section: `'Quantitative'`, `'Verbal'`, `'Data Insights'` |
| `difficulty_range` | `text` | | Free-text range, e.g. `'600-700'` or `'700+'` |
| `topics` | `text` | | Comma-separated topics, e.g. `'Algebra, Number Properties'` |
| `total_questions` | `int` | NOT NULL | Denormalized count |
| `source_filename` | `text` | | Original upload filename or `'claude-generated'` |
| `created_at` | `timestamptz` | NOT NULL, default `now()` | |

---

### `questions`

Individual GMAT questions belonging to a set.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | `uuid` | PK, default `gen_random_uuid()` | |
| `set_id` | `uuid` | FK → `question_sets.id` ON DELETE CASCADE | |
| `question_number` | `int` | NOT NULL | 1-based position within the set |
| `question_type` | `text` | NOT NULL | See question types below |
| `difficulty` | `int` | | GMAT scale, e.g. 500–800 |
| `topic` | `text` | | Sub-topic, e.g. `'Number Properties'` |
| `stem` | `text` | NOT NULL | Main question text |
| `statement1` | `text` | | Data Sufficiency only |
| `statement2` | `text` | | Data Sufficiency only |
| `s1_verdict` | `text` | | DS: whether statement 1 alone is sufficient |
| `s2_verdict` | `text` | | DS: whether statement 2 alone is sufficient |
| `reasoning` | `text` | | DS: combined reasoning |
| `choice_a` | `text` | NOT NULL | Answer choice A |
| `choice_b` | `text` | NOT NULL | Answer choice B |
| `choice_c` | `text` | NOT NULL | Answer choice C |
| `choice_d` | `text` | NOT NULL | Answer choice D |
| `choice_e` | `text` | NOT NULL | Answer choice E |
| `correct_answer` | `text` | NOT NULL | `'A'` – `'E'` |
| `explanation` | `text` | | Solution explanation |
| `passage_id` | `uuid` | FK → `passages.id` | RC: groups questions sharing a passage |
| `created_at` | `timestamptz` | NOT NULL, default `now()` | |

**Question types** (`question_type` enum values):
- `'Problem Solving'`
- `'Data Sufficiency'`
- `'Critical Reasoning'`
- `'Reading Comprehension'`
- `'Multi-Source Reasoning'`
- `'Table Analysis'`
- `'Graphics Interpretation'`
- `'Two-Part Analysis'`

**Index:** `(set_id, question_number)`

---

### `passages`

Shared passages for Reading Comprehension (and Data Insights multi-part sources).

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | `uuid` | PK, default `gen_random_uuid()` | |
| `set_id` | `uuid` | FK → `question_sets.id` ON DELETE CASCADE | Question set this passage belongs to |
| `passage_text` | `text` | NOT NULL | Full passage text |
| `created_at` | `timestamptz` | NOT NULL, default `now()` | |

**Index:** `(set_id)`

---

### `exam_sessions`

One record per exam attempt (timed, practice, review, or simulation section).

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | `uuid` | PK, default `gen_random_uuid()` | |
| `set_id` | `uuid` | FK → `question_sets.id` | |
| `mode` | `text` | NOT NULL | `'timed'`, `'practice'`, `'review'`, `'simulation'` |
| `started_at` | `timestamptz` | NOT NULL, default `now()` | |
| `completed_at` | `timestamptz` | | NULL until exam is submitted |
| `total_time_seconds` | `int` | | Wall-clock duration at submission |
| `correct_count` | `int` | | |
| `total_count` | `int` | NOT NULL | Number of questions in the session |
| `score` | `int` | | Raw percentage score 0–100 |
| `simulation_exam_id` | `uuid` | FK → `simulation_exams.id` | NULL for non-simulation sessions |
| `simulation_section_order` | `int` | | 1-based section number within simulation |
| `session_metadata` | `jsonb` | | Reserved for future use |

**Index:** `(set_id)`, `(simulation_exam_id)`, `(completed_at DESC)`

---

### `question_responses`

One record per question per exam session.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | `uuid` | PK, default `gen_random_uuid()` | |
| `session_id` | `uuid` | FK → `exam_sessions.id` ON DELETE CASCADE | |
| `question_id` | `uuid` | FK → `questions.id` | |
| `question_order` | `int` | NOT NULL | **1-based** position within the session |
| `selected_answer` | `text` | | `'A'`–`'E'`, NULL if skipped |
| `is_correct` | `boolean` | | NULL if skipped |
| `time_spent_seconds` | `int` | NOT NULL, default `0` | Per-question time tracked client-side |
| `flagged_for_review` | `boolean` | NOT NULL, default `false` | |
| `first_answer` | `text` | | First selection before any changes |
| `answer_changes` | `jsonb` | | Array of `{ from, to, timestamp_offset_ms }` |
| `confidence_rating` | `int` | | 1–5 stars, NULL if not rated |
| `error_category` | `text` | | `'Content'`, `'Process'`, or `'Habit'` |
| `note` | `text` | | Free-text note to self |
| `triage_triggered` | `boolean` | NOT NULL, default `false` | Whether 2-min triage alert fired |
| `missing_link` | `text` | | CR: user's pre-written assumption |
| `choices_unlocked_at_ms` | `int` | | CR: offset ms when choices were unlocked |
| `passage_map` | `jsonb` | | RC: `{ p1, p2, ..., mainIdea }` map |
| `created_at` | `timestamptz` | NOT NULL, default `now()` | |

**Unique constraint:** `(session_id, question_id)`

**Index:** `(session_id, question_order)`

---

### `tracking_events`

Granular behavioral log — one row per user action during an exam.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | `uuid` | PK, default `gen_random_uuid()` | |
| `session_id` | `uuid` | FK → `exam_sessions.id` ON DELETE CASCADE | |
| `question_id` | `uuid` | FK → `questions.id` | NULL for session-level events |
| `event_type` | `text` | NOT NULL | See event types below |
| `event_data` | `jsonb` | | Arbitrary payload per event type |
| `timestamp_offset_ms` | `int` | NOT NULL | Ms since session start |
| `created_at` | `timestamptz` | NOT NULL, default `now()` | |

**Event types** (`event_type` values):
| Value | Description |
|-------|-------------|
| `session_started` | Session initialised |
| `question_displayed` | User navigated to a question |
| `answer_selected` | First answer choice selected |
| `answer_changed` | Answer changed after first selection |
| `question_flagged` | Flag set |
| `question_unflagged` | Flag cleared |
| `confidence_rated` | Star rating recorded |
| `navigated_to_question` | Navigation between questions |
| `triage_triggered` | 2-min ring expired without answer |
| `triage_dismissed` | User dismissed the triage banner |
| `triage_flag_and_next` | User used "Flag & Next" from triage |
| `choices_unlocked` | CR: answer choices revealed |
| `missing_link_skipped` | CR: user skipped Missing Link |
| `passage_map_completed` | RC: passage map submitted |
| `passage_map_skipped` | RC: passage map skipped |
| `time_warning_50pct` | Timer crossed 50% remaining |
| `time_warning_25pct` | Timer crossed 25% remaining |
| `time_warning_30sec` | Timer reached 30 s remaining |
| `exam_submitted` | Session submitted |

**Index:** `(session_id, timestamp_offset_ms)`

---

### `simulation_exams`

Top-level record for a full 3-section mock exam.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | `uuid` | PK, default `gen_random_uuid()` | |
| `section_order` | `text[]` | NOT NULL | Ordered array: `['quant','verbal','di']` |
| `breaks_enabled` | `boolean` | NOT NULL, default `true` | |
| `status` | `text` | NOT NULL | `'in_progress'`, `'completed'` |
| `total_score` | `int` | | Estimated 205–805 composite score |
| `completed_at` | `timestamptz` | | |
| `created_at` | `timestamptz` | NOT NULL, default `now()` | |

---

### `simulation_sections`

One record per section within a simulation exam.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | `uuid` | PK, default `gen_random_uuid()` | |
| `simulation_exam_id` | `uuid` | FK → `simulation_exams.id` ON DELETE CASCADE | |
| `section_type` | `text` | NOT NULL | `'quant'`, `'verbal'`, `'di'` |
| `section_order` | `int` | NOT NULL | 1-based |
| `question_set_id` | `uuid` | FK → `question_sets.id` | |
| `session_id` | `uuid` | FK → `exam_sessions.id` | Set after section starts |
| `scaled_score` | `int` | | Estimated 60–90 per-section score |
| `raw_correct` | `int` | | |
| `raw_total` | `int` | | |
| `time_used_seconds` | `int` | | |
| `questions_skipped` | `int` | | |
| `break_taken_after` | `boolean` | | Whether break was taken after this section |
| `started_at` | `timestamptz` | | |
| `completed_at` | `timestamptz` | | |

**Index:** `(simulation_exam_id, section_order)`

---

## Entity Relationships

```
question_sets
  └── questions (set_id)

exam_sessions (set_id → question_sets)
  ├── question_responses (session_id)
  │     └── tracking_events (session_id)
  └── simulation_sections (session_id)  ← set after section starts

simulation_exams
  └── simulation_sections (simulation_exam_id)
        └── exam_sessions (simulation_exam_id)  ← simulation sessions only
```

---

## Supabase Migration SQL

Run this in the Supabase SQL editor to create all tables from scratch.

```sql
-- Enable UUID extension
create extension if not exists "pgcrypto";

-- ── question_sets ─────────────────────────────────────────────
create table if not exists question_sets (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  section          text,
  difficulty_range text,
  topics           text,
  total_questions  int  not null default 0,
  source_filename  text,
  created_at       timestamptz not null default now()
);

-- ── passages ─────────────────────────────────────────────────
create table if not exists passages (
  id           uuid primary key default gen_random_uuid(),
  set_id       uuid not null references question_sets(id) on delete cascade,
  passage_text text not null,
  created_at   timestamptz not null default now()
);
create index if not exists passages_set_id_idx on passages(set_id);

-- ── questions ─────────────────────────────────────────────────
create table if not exists questions (
  id              uuid primary key default gen_random_uuid(),
  set_id          uuid not null references question_sets(id) on delete cascade,
  question_number int  not null,
  question_type   text not null,
  difficulty      int,
  topic           text,
  stem            text not null,
  statement1      text,
  statement2      text,
  s1_verdict      text,
  s2_verdict      text,
  reasoning       text,
  choice_a        text not null,
  choice_b        text not null,
  choice_c        text not null,
  choice_d        text not null,
  choice_e        text not null,
  correct_answer  text not null,
  explanation     text,
  passage_id      uuid references passages(id),
  created_at      timestamptz not null default now()
);
create index if not exists questions_set_id_idx on questions(set_id, question_number);

-- ── simulation_exams ──────────────────────────────────────────
create table if not exists simulation_exams (
  id            uuid primary key default gen_random_uuid(),
  section_order text[]      not null,
  breaks_enabled boolean    not null default true,
  status        text        not null default 'in_progress',
  total_score   int,
  completed_at  timestamptz,
  created_at    timestamptz not null default now()
);

-- ── exam_sessions ─────────────────────────────────────────────
create table if not exists exam_sessions (
  id                        uuid primary key default gen_random_uuid(),
  set_id                    uuid references question_sets(id),
  mode                      text        not null,
  started_at                timestamptz not null default now(),
  completed_at              timestamptz,
  total_time_seconds        int,
  correct_count             int,
  total_count               int         not null default 0,
  score                     int,
  simulation_exam_id        uuid references simulation_exams(id),
  simulation_section_order  int,
  session_metadata          jsonb
);
create index if not exists exam_sessions_set_id_idx on exam_sessions(set_id);
create index if not exists exam_sessions_sim_id_idx on exam_sessions(simulation_exam_id);
create index if not exists exam_sessions_completed_idx on exam_sessions(completed_at desc);

-- ── simulation_sections ───────────────────────────────────────
create table if not exists simulation_sections (
  id                  uuid primary key default gen_random_uuid(),
  simulation_exam_id  uuid not null references simulation_exams(id) on delete cascade,
  section_type        text not null,
  section_order       int  not null,
  question_set_id     uuid references question_sets(id),
  session_id          uuid references exam_sessions(id),
  scaled_score        int,
  raw_correct         int,
  raw_total           int,
  time_used_seconds   int,
  questions_skipped   int,
  break_taken_after   boolean,
  started_at          timestamptz,
  completed_at        timestamptz
);
create index if not exists sim_sections_exam_id_idx on simulation_sections(simulation_exam_id, section_order);

-- ── question_responses ────────────────────────────────────────
create table if not exists question_responses (
  id                    uuid primary key default gen_random_uuid(),
  session_id            uuid not null references exam_sessions(id) on delete cascade,
  question_id           uuid not null references questions(id),
  question_order        int  not null,  -- 1-based
  selected_answer       text,
  is_correct            boolean,
  time_spent_seconds    int  not null default 0,
  flagged_for_review    boolean not null default false,
  first_answer          text,
  answer_changes        jsonb,
  confidence_rating     int,
  error_category        text,
  note                  text,
  triage_triggered      boolean not null default false,
  missing_link          text,
  choices_unlocked_at_ms int,
  passage_map           jsonb,
  created_at            timestamptz not null default now(),
  unique (session_id, question_id)
);
create index if not exists responses_session_order_idx on question_responses(session_id, question_order);

-- ── tracking_events ───────────────────────────────────────────
create table if not exists tracking_events (
  id                   uuid primary key default gen_random_uuid(),
  session_id           uuid not null references exam_sessions(id) on delete cascade,
  question_id          uuid references questions(id),
  event_type           text not null,
  event_data           jsonb,
  timestamp_offset_ms  int  not null,
  created_at           timestamptz not null default now()
);
create index if not exists events_session_ts_idx on tracking_events(session_id, timestamp_offset_ms);
```

---

## Row Level Security (RLS)

If enabling RLS (recommended for multi-user deployments), add policies that scope all reads and writes to the authenticated user. For a single-user setup, the simplest approach is to disable RLS on all tables and rely on the anon key being kept private:

```sql
-- Single-user / anon key setup: disable RLS on all tables
alter table question_sets        disable row level security;
alter table questions            disable row level security;
alter table exam_sessions        disable row level security;
alter table question_responses   disable row level security;
alter table tracking_events      disable row level security;
alter table simulation_exams     disable row level security;
alter table simulation_sections  disable row level security;
```

---

## Notes

- **`question_order` is 1-based** in `question_responses`. This matches the `i + 1` used when saving responses in both the regular exam page and the simulation page.
- **Passage text** is stored only on the first question of an RC passage group. Other questions in the group share the same `passage_id` and the app resolves the text at runtime by finding the sibling with a non-null `passage_text`.
- **`answer_changes`** is a JSONB array with elements `{ "from": "A", "to": "B", "timestamp_offset_ms": 12345 }`.
- **`passage_map`** is a JSONB object with keys `p1`, `p2`, ... (one per passage paragraph) and `mainIdea`.
- **Scaled scores** for simulation sections are estimated as `floor((correct / total) * 30 + 60)`, clamped to 60–90.
- **Composite score** is estimated as `floor((sum_of_section_scores / 270) * 600 + 205)`, mapping 180–270 → 205–805.
