import {
  QuestionSet,
  Question,
  ExamSession,
  QuestionResponse,
  TrackingEvent,
} from '@/types/gmat';
import { getSupabase, isSupabaseConfigured } from './supabase';

// ─── Local Storage Keys ──────────────────────────────────────
const STORAGE_KEYS = {
  QUESTION_SETS: 'gmat_question_sets',
  QUESTIONS: 'gmat_questions',
  SESSIONS: 'gmat_sessions',
  RESPONSES: 'gmat_responses',
  EVENTS: 'gmat_events',
};

function getLocal<T>(key: string): T[] {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem(key) || '[]');
  } catch {
    return [];
  }
}

function setLocal<T>(key: string, data: T[]): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(key, JSON.stringify(data));
}

// ─── Question Sets ───────────────────────────────────────────

export async function saveQuestionSet(
  set: Omit<QuestionSet, 'id' | 'created_at'>,
  questions: Array<Omit<Question, 'id' | 'set_id' | 'created_at'>>
): Promise<{ setId: string; questionCount: number }> {
  const supabase = getSupabase();

  if (supabase && isSupabaseConfigured()) {
    const { data: setData, error: setError } = await supabase
      .from('question_sets')
      .insert(set)
      .select('id')
      .single();

    if (setError) throw new Error(`Failed to save question set: ${setError.message}`);

    const questionsWithSetId = questions.map((q) => ({
      ...q,
      set_id: setData.id,
    }));

    const { error: qError } = await supabase.from('questions').insert(questionsWithSetId);
    if (qError) throw new Error(`Failed to save questions: ${qError.message}`);

    return { setId: setData.id, questionCount: questions.length };
  }

  // Local-only fallback
  const setId = crypto.randomUUID();
  const fullSet: QuestionSet = {
    ...set,
    id: setId,
    created_at: new Date().toISOString(),
  };

  const fullQuestions: Question[] = questions.map((q) => ({
    ...q,
    id: crypto.randomUUID(),
    set_id: setId,
    created_at: new Date().toISOString(),
  }));

  const existingSets = getLocal<QuestionSet>(STORAGE_KEYS.QUESTION_SETS);
  setLocal(STORAGE_KEYS.QUESTION_SETS, [...existingSets, fullSet]);

  const existingQuestions = getLocal<Question>(STORAGE_KEYS.QUESTIONS);
  setLocal(STORAGE_KEYS.QUESTIONS, [...existingQuestions, ...fullQuestions]);

  return { setId, questionCount: fullQuestions.length };
}

export async function getQuestionSets(): Promise<QuestionSet[]> {
  const supabase = getSupabase();

  if (supabase && isSupabaseConfigured()) {
    const { data, error } = await supabase
      .from('question_sets')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return data || [];
  }

  return getLocal<QuestionSet>(STORAGE_KEYS.QUESTION_SETS).sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
}

export async function getQuestionsBySetId(setId: string): Promise<Question[]> {
  const supabase = getSupabase();

  if (supabase && isSupabaseConfigured()) {
    const { data, error } = await supabase
      .from('questions')
      .select('*')
      .eq('set_id', setId)
      .order('question_number', { ascending: true });
    if (error) throw new Error(error.message);
    return data || [];
  }

  return getLocal<Question>(STORAGE_KEYS.QUESTIONS)
    .filter((q) => q.set_id === setId)
    .sort((a, b) => a.question_number - b.question_number);
}

// ─── Exam Sessions ───────────────────────────────────────────

export async function createSession(
  session: Omit<ExamSession, 'id' | 'started_at'>
): Promise<string> {
  const supabase = getSupabase();

  if (supabase && isSupabaseConfigured()) {
    const { data, error } = await supabase
      .from('exam_sessions')
      .insert(session)
      .select('id')
      .single();
    if (error) throw new Error(error.message);
    return data.id;
  }

  const id = crypto.randomUUID();
  const fullSession: ExamSession = {
    ...session,
    id,
    started_at: new Date().toISOString(),
  };
  const sessions = getLocal<ExamSession>(STORAGE_KEYS.SESSIONS);
  setLocal(STORAGE_KEYS.SESSIONS, [...sessions, fullSession]);
  return id;
}

export async function updateSession(
  sessionId: string,
  updates: Partial<ExamSession>
): Promise<void> {
  const supabase = getSupabase();

  if (supabase && isSupabaseConfigured()) {
    const { error } = await supabase
      .from('exam_sessions')
      .update(updates)
      .eq('id', sessionId);
    if (error) throw new Error(error.message);
    return;
  }

  const sessions = getLocal<ExamSession>(STORAGE_KEYS.SESSIONS);
  const idx = sessions.findIndex((s) => s.id === sessionId);
  if (idx >= 0) {
    sessions[idx] = { ...sessions[idx], ...updates };
    setLocal(STORAGE_KEYS.SESSIONS, sessions);
  }
}

export async function getSession(sessionId: string): Promise<ExamSession | null> {
  const supabase = getSupabase();

  if (supabase && isSupabaseConfigured()) {
    const { data, error } = await supabase
      .from('exam_sessions')
      .select('*')
      .eq('id', sessionId)
      .single();
    if (error) return null;
    return data;
  }

  const sessions = getLocal<ExamSession>(STORAGE_KEYS.SESSIONS);
  return sessions.find((s) => s.id === sessionId) || null;
}

export async function getAllSessions(): Promise<ExamSession[]> {
  const supabase = getSupabase();

  if (supabase && isSupabaseConfigured()) {
    const { data, error } = await supabase
      .from('exam_sessions')
      .select('*')
      .order('started_at', { ascending: false });
    if (error) throw new Error(error.message);
    return data || [];
  }

  return getLocal<ExamSession>(STORAGE_KEYS.SESSIONS).sort(
    (a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime()
  );
}

// ─── Question Responses ──────────────────────────────────────

export async function saveResponses(responses: Omit<QuestionResponse, 'id' | 'created_at'>[]): Promise<void> {
  const supabase = getSupabase();

  if (supabase && isSupabaseConfigured()) {
    const { error } = await supabase.from('question_responses').insert(responses);
    if (error) throw new Error(error.message);
    return;
  }

  const fullResponses: QuestionResponse[] = responses.map((r) => ({
    ...r,
    id: crypto.randomUUID(),
    created_at: new Date().toISOString(),
  }));
  const existing = getLocal<QuestionResponse>(STORAGE_KEYS.RESPONSES);
  setLocal(STORAGE_KEYS.RESPONSES, [...existing, ...fullResponses]);
}

export async function getResponsesBySession(sessionId: string): Promise<QuestionResponse[]> {
  const supabase = getSupabase();

  if (supabase && isSupabaseConfigured()) {
    const { data, error } = await supabase
      .from('question_responses')
      .select('*')
      .eq('session_id', sessionId)
      .order('question_order', { ascending: true });
    if (error) throw new Error(error.message);
    return data || [];
  }

  return getLocal<QuestionResponse>(STORAGE_KEYS.RESPONSES)
    .filter((r) => r.session_id === sessionId)
    .sort((a, b) => a.question_order - b.question_order);
}

export async function getAllResponses(): Promise<QuestionResponse[]> {
  const supabase = getSupabase();
  if (supabase && isSupabaseConfigured()) {
    const { data, error } = await supabase.from('question_responses').select('*');
    if (error) throw new Error(error.message);
    return data || [];
  }
  return getLocal<QuestionResponse>(STORAGE_KEYS.RESPONSES);
}

// ─── Tracking Events ─────────────────────────────────────────

export async function saveTrackingEvents(events: Omit<TrackingEvent, 'id' | 'created_at'>[]): Promise<void> {
  const supabase = getSupabase();

  if (supabase && isSupabaseConfigured()) {
    const { error } = await supabase.from('tracking_events').insert(events);
    if (error) throw new Error(error.message);
    return;
  }

  const full: TrackingEvent[] = events.map((e) => ({
    ...e,
    id: crypto.randomUUID(),
    created_at: new Date().toISOString(),
  }));
  const existing = getLocal<TrackingEvent>(STORAGE_KEYS.EVENTS);
  setLocal(STORAGE_KEYS.EVENTS, [...existing, ...full]);
}

export async function getTrackingEventsBySession(sessionId: string): Promise<TrackingEvent[]> {
  const supabase = getSupabase();

  if (supabase && isSupabaseConfigured()) {
    const { data, error } = await supabase
      .from('tracking_events')
      .select('*')
      .eq('session_id', sessionId)
      .order('timestamp_offset_ms', { ascending: true });
    if (error) throw new Error(error.message);
    return data || [];
  }

  return getLocal<TrackingEvent>(STORAGE_KEYS.EVENTS)
    .filter((e) => e.session_id === sessionId)
    .sort((a, b) => a.timestamp_offset_ms - b.timestamp_offset_ms);
}

// ─── Delete ──────────────────────────────────────────────────

export async function deleteQuestionSet(setId: string): Promise<void> {
  const supabase = getSupabase();

  if (supabase && isSupabaseConfigured()) {
    const { error } = await supabase.from('question_sets').delete().eq('id', setId);
    if (error) throw new Error(error.message);
    return;
  }

  setLocal(STORAGE_KEYS.QUESTION_SETS, getLocal<QuestionSet>(STORAGE_KEYS.QUESTION_SETS).filter((s) => s.id !== setId));
  setLocal(STORAGE_KEYS.QUESTIONS, getLocal<Question>(STORAGE_KEYS.QUESTIONS).filter((q) => q.set_id !== setId));
}
