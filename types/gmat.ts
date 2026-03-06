// ─── Passages ───────────────────────────────────────────────

export interface Passage {
  id: string;
  set_id: string;
  passage_text: string;
  created_at: string;
}

// ─── Question Bank ───────────────────────────────────────────

export interface QuestionSet {
  id: string;
  name: string;
  section?: string;
  difficulty_range?: string;
  topics?: string;
  target?: string;
  total_questions: number;
  created_at: string;
  source_filename?: string;
  study_date?: string;
}

export interface Question {
  id: string;
  set_id: string;
  question_number: number;
  difficulty: number;
  question_type: QuestionType;
  topic?: string;
  stem: string;
  statement1?: string;
  statement2?: string;
  choice_a: string;
  choice_b: string;
  choice_c: string;
  choice_d: string;
  choice_e: string;
  correct_answer: string;
  explanation?: string;
  s1_verdict?: string;
  s2_verdict?: string;
  reasoning?: string;
  // Feature 4: RC passage grouping — passage_id is UUID FK → passages.id
  passage_id?: string;
  created_at: string;
}

export type QuestionType =
  | 'Data Sufficiency'
  | 'Problem Solving'
  | 'Reading Comprehension'
  | 'Critical Reasoning'
  | 'Multi-Source Reasoning'
  | 'Table Analysis'
  | 'Graphics Interpretation'
  | 'Two-Part Analysis';

// ─── Exam Sessions ───────────────────────────────────────────

export type ExamMode = 'timed' | 'practice' | 'review' | 'simulation';

export interface ExamSession {
  id: string;
  set_id: string;
  mode: ExamMode;
  started_at: string;
  completed_at?: string;
  total_time_seconds?: number;
  score?: number;
  correct_count?: number;
  total_count: number;
  session_metadata?: Record<string, unknown>;
  // Feature 5: Simulation
  simulation_exam_id?: string;
  simulation_section_order?: number;
}

// ─── Simulation Mode ─────────────────────────────────────────

export type SectionType = 'quant' | 'verbal' | 'di';

export type SimulationStatus = 'in_progress' | 'completed' | 'abandoned';

export interface SimulationExam {
  id: string;
  user_id?: string;
  created_at: string;
  completed_at?: string;
  section_order: SectionType[];
  status: SimulationStatus;
  total_score?: number;
  breaks_enabled: boolean;
}

export interface SimulationSection {
  id: string;
  simulation_exam_id: string;
  section_type: SectionType;
  section_order: number;
  question_set_id?: string;
  session_id?: string;
  scaled_score?: number;
  raw_correct?: number;
  raw_total?: number;
  time_used_seconds?: number;
  questions_skipped?: number;
  started_at?: string;
  completed_at?: string;
  break_taken_after?: boolean;
}

// ─── Error Categorization ────────────────────────────────────

export type ErrorCategory = 'Content' | 'Process' | 'Habit';

// ─── Question Responses ──────────────────────────────────────

export interface AnswerChange {
  from: string | null;
  to: string;
  timestamp_offset_ms: number;
}

export interface QuestionResponse {
  id: string;
  session_id: string;
  question_id: string;
  question_order: number;
  selected_answer: string | null;
  is_correct: boolean | null;
  time_spent_seconds: number;
  flagged_for_review: boolean;
  answer_changes: AnswerChange[];
  first_answer: string | null;
  confidence_rating?: number;
  // Feature 1: Smart Error Log
  error_category?: ErrorCategory;
  note?: string;
  // Feature 2: Triage
  triage_triggered?: boolean;
  // Feature 3: CR Missing Link
  missing_link?: string;
  choices_unlocked_at_ms?: number;
  // Feature 4: RC Passage Map
  passage_map?: Record<string, string>;
  created_at: string;
}

// ─── Tracking Events ─────────────────────────────────────────

export type TrackingEventType =
  | 'session_started'
  | 'question_displayed'
  | 'answer_selected'
  | 'answer_changed'
  | 'question_flagged'
  | 'question_unflagged'
  | 'navigated_to_question'
  | 'navigated_back'
  | 'time_warning_50pct'
  | 'time_warning_25pct'
  | 'time_warning_30sec'
  | 'question_time_expired'
  | 'confidence_rated'
  | 'exam_submitted'
  | 'review_mode_started'
  // Feature 2: Triage
  | 'triage_triggered'
  | 'triage_dismissed'
  | 'triage_flag_and_next'
  // Feature 3: CR Missing Link
  | 'missing_link_written'
  | 'missing_link_skipped'
  | 'choices_unlocked'
  // Feature 4: RC Passage Map
  | 'passage_map_started'
  | 'passage_map_completed'
  | 'passage_map_skipped'
  | 'rc_questions_unlocked';

export interface TrackingEvent {
  id: string;
  session_id: string;
  question_id?: string;
  event_type: TrackingEventType;
  event_data?: Record<string, unknown>;
  timestamp_offset_ms: number;
  created_at: string;
}

// ─── Parser Types ────────────────────────────────────────────

export interface ParsedHeader {
  title: string;
  section: string;
  date?: string;
  topics?: string;
  difficulty_range?: string;
  total_questions?: number;
  target?: string;
}

export interface ParsedQuestion {
  question_number: number;
  difficulty: number;
  question_type: string;
  topic?: string;
  stem: string;
  statement1?: string;
  statement2?: string;
  choices: {
    A: string;
    B: string;
    C: string;
    D: string;
    E: string;
  };
  correct_answer: string;
  explanation?: string;
  s1_verdict?: string;
  s2_verdict?: string;
  reasoning?: string;
}

export interface ParseResult {
  header: ParsedHeader;
  questions: ParsedQuestion[];
  errors: ParseError[];
}

export interface ParseError {
  questionNumber?: number;
  message: string;
  raw?: string;
}

// ─── DS Standard Answer Choices ──────────────────────────────

export const DS_CHOICES = {
  A: 'Statement (1) ALONE is sufficient, but statement (2) alone is not sufficient.',
  B: 'Statement (2) ALONE is sufficient, but statement (1) alone is not sufficient.',
  C: 'BOTH statements TOGETHER are sufficient, but NEITHER alone is sufficient.',
  D: 'EACH statement ALONE is sufficient.',
  E: 'Statements (1) and (2) TOGETHER are NOT sufficient.',
} as const;

// ─── Error Log Entry ─────────────────────────────────────────

export type ErrorCategoryType = 'Content' | 'Process' | 'Habit';

export interface ErrorLogEntry {
  question_number: number;
  my_answer: string | null;
  correct_answer: string;
  error_type?: ErrorCategoryType;
  topic: string;
  note?: string;
  s1_i_said?: string;
  s2_i_said?: string;
  what_i_should_have_evaluated?: string;
}

// ─── Pattern Tracker ─────────────────────────────────────────

export interface ErrorPattern {
  topic: string;
  category: ErrorCategory;
  count: number;
  sessions: string[];
  lastSeen: string;
  status: 'EMERGING' | 'WATCH' | 'CRITICAL';
}
