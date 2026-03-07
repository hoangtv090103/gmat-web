import {
  QuestionSet,
  Question,
  Passage,
  ExamSession,
  QuestionResponse,
  TrackingEvent,
  SimulationExam,
  SimulationSection,
} from '@/types/gmat';
import { getSupabase, isSupabaseConfigured } from './supabase';

// ─── Local Storage Keys ──────────────────────────────────────
const STORAGE_KEYS = {
  QUESTION_SETS: 'gmat_question_sets',
  QUESTIONS: 'gmat_questions',
  PASSAGES: 'gmat_passages',
  SESSIONS: 'gmat_sessions',
  RESPONSES: 'gmat_responses',
  EVENTS: 'gmat_events',
  SIMULATION_EXAMS: 'gmat_simulation_exams',
  SIMULATION_SECTIONS: 'gmat_simulation_sections',
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

// Input questions may carry a temporary `passage_text` field (used to create
// passage records). After saving, questions reference passages by UUID FK.
type QuestionInput = Omit<Question, 'id' | 'set_id' | 'created_at'> & {
  passage_text?: string;
};

export async function saveQuestionSet(
  set: Omit<QuestionSet, 'id' | 'created_at'>,
  questions: Array<QuestionInput>
): Promise<{ setId: string; questionCount: number }> {
  const supabase = getSupabase();

  // Build a map of temporary passage_id text key → passage_text for questions
  // that carry passage data. The temporary key is the string value of passage_id
  // on the question object (e.g. "rc-passage-1").
  const passageMap = new Map<string, string>(); // tempKey → passage_text
  for (const q of questions) {
    if (q.passage_id && q.passage_text) {
      if (!passageMap.has(q.passage_id)) {
        passageMap.set(q.passage_id, q.passage_text);
      }
    }
  }

  if (supabase && isSupabaseConfigured()) {
    const { data: setData, error: setError } = await supabase
      .from('question_sets')
      .insert(set)
      .select('id')
      .single();

    if (setError) throw new Error(`Failed to save question set: ${setError.message}`);
    const setId = setData.id as string;

    // Insert passages and map old text key → new UUID
    const tempKeyToUuid = new Map<string, string>();
    if (passageMap.size > 0) {
      const passageRows = Array.from(passageMap.entries()).map(([, text]) => ({
        set_id: setId,
        passage_text: text,
      }));
      const { data: passageData, error: pErr } = await supabase
        .from('passages')
        .insert(passageRows)
        .select('id, passage_text');
      if (pErr) throw new Error(`Failed to save passages: ${pErr.message}`);

      // Re-map: find which UUID corresponds to which temp key via passage_text match
      for (const [tempKey, text] of passageMap.entries()) {
        const row = passageData?.find((p: { id: string; passage_text: string }) => p.passage_text === text);
        if (row) tempKeyToUuid.set(tempKey, row.id);
      }
    }

    // Build question rows: remap passage_id to UUID, strip passage_text
    const questionRows = questions.map((q) => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { passage_text: _pt, ...rest } = q;
      return {
        ...rest,
        set_id: setId,
        passage_id: q.passage_id ? (tempKeyToUuid.get(q.passage_id) ?? null) : null,
      };
    });

    const { error: qError } = await supabase.from('questions').insert(questionRows);
    if (qError) throw new Error(`Failed to save questions: ${qError.message}`);

    return { setId, questionCount: questions.length };
  }

  // ── localStorage fallback ────────────────────────────────
  const setId = crypto.randomUUID();
  const fullSet: QuestionSet = {
    ...set,
    id: setId,
    created_at: new Date().toISOString(),
  };

  // Create passage records in localStorage
  const tempKeyToUuid = new Map<string, string>();
  if (passageMap.size > 0) {
    const existingPassages = getLocal<Passage>(STORAGE_KEYS.PASSAGES);
    const newPassages: Passage[] = [];
    for (const [tempKey, text] of passageMap.entries()) {
      const passageId = crypto.randomUUID();
      tempKeyToUuid.set(tempKey, passageId);
      newPassages.push({ id: passageId, set_id: setId, passage_text: text, passage_type: 'text', created_at: new Date().toISOString() });
    }
    setLocal(STORAGE_KEYS.PASSAGES, [...existingPassages, ...newPassages]);
  }

  const fullQuestions: Question[] = questions.map((q) => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { passage_text: _pt, ...rest } = q;
    return {
      ...rest,
      id: crypto.randomUUID(),
      set_id: setId,
      created_at: new Date().toISOString(),
      passage_id: q.passage_id ? (tempKeyToUuid.get(q.passage_id) ?? undefined) : undefined,
    };
  });

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

// ─── Passages ────────────────────────────────────────────────

export async function getPassagesBySetId(setId: string): Promise<Passage[]> {
  const supabase = getSupabase();

  if (supabase && isSupabaseConfigured()) {
    const { data, error } = await supabase
      .from('passages')
      .select('*')
      .eq('set_id', setId);
    if (error) throw new Error(error.message);
    return data || [];
  }

  return getLocal<Passage>(STORAGE_KEYS.PASSAGES).filter((p) => p.set_id === setId);
}

export async function getPassageById(passageId: string): Promise<Passage | null> {
  const supabase = getSupabase();

  if (supabase && isSupabaseConfigured()) {
    const { data, error } = await supabase
      .from('passages')
      .select('*')
      .eq('id', passageId)
      .single();
    if (error) return null;
    return data;
  }

  return getLocal<Passage>(STORAGE_KEYS.PASSAGES).find((p) => p.id === passageId) || null;
}

export async function getPassagesByGroupId(groupId: string): Promise<Passage[]> {
  const supabase = getSupabase();

  if (supabase && isSupabaseConfigured()) {
    const { data, error } = await supabase
      .from('passages')
      .select('*')
      .eq('passage_group_id', groupId)
      .order('created_at', { ascending: true });
    if (error) throw new Error(error.message);
    return data || [];
  }

  return getLocal<Passage>(STORAGE_KEYS.PASSAGES).filter(
    (p) => p.passage_group_id === groupId
  );
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

export async function updateResponse(
  sessionId: string,
  questionId: string,
  updates: Partial<Pick<QuestionResponse, 'error_category' | 'note' | 'missing_link' | 'choices_unlocked_at_ms' | 'passage_map' | 'triage_triggered'>>
): Promise<void> {
  const supabase = getSupabase();

  if (supabase && isSupabaseConfigured()) {
    try {
      const { error } = await supabase
        .from('question_responses')
        .update(updates)
        .eq('session_id', sessionId)
        .eq('question_id', questionId);
      if (error) throw new Error(error.message);
      return;
    } catch (e) {
      if (!(e instanceof TypeError && (e as TypeError).message.includes('fetch'))) throw e;
      // Network error — fall through to localStorage
    }
  }

  // localStorage fallback
  const responses = getLocal<QuestionResponse>(STORAGE_KEYS.RESPONSES);
  const idx = responses.findIndex(
    (r) => r.session_id === sessionId && r.question_id === questionId
  );
  if (idx >= 0) {
    responses[idx] = { ...responses[idx], ...updates };
    setLocal(STORAGE_KEYS.RESPONSES, responses);
  }
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

// ─── Simulation Exams ────────────────────────────────────────

export async function createSimulationExam(
  exam: Omit<SimulationExam, 'id' | 'created_at'>
): Promise<string> {
  const supabase = getSupabase();

  if (supabase && isSupabaseConfigured()) {
    const { data, error } = await supabase
      .from('simulation_exams')
      .insert(exam)
      .select('id')
      .single();
    if (error) throw new Error(error.message);
    return data.id;
  }

  const id = crypto.randomUUID();
  const full: SimulationExam = { ...exam, id, created_at: new Date().toISOString() };
  const existing = getLocal<SimulationExam>(STORAGE_KEYS.SIMULATION_EXAMS);
  setLocal(STORAGE_KEYS.SIMULATION_EXAMS, [...existing, full]);
  return id;
}

export async function updateSimulationExam(
  examId: string,
  updates: Partial<SimulationExam>
): Promise<void> {
  const supabase = getSupabase();

  if (supabase && isSupabaseConfigured()) {
    const { error } = await supabase
      .from('simulation_exams')
      .update(updates)
      .eq('id', examId);
    if (error) throw new Error(error.message);
    return;
  }

  const exams = getLocal<SimulationExam>(STORAGE_KEYS.SIMULATION_EXAMS);
  const idx = exams.findIndex((e) => e.id === examId);
  if (idx >= 0) {
    exams[idx] = { ...exams[idx], ...updates };
    setLocal(STORAGE_KEYS.SIMULATION_EXAMS, exams);
  }
}

export async function getSimulationExam(examId: string): Promise<SimulationExam | null> {
  const supabase = getSupabase();

  if (supabase && isSupabaseConfigured()) {
    const { data, error } = await supabase
      .from('simulation_exams')
      .select('*')
      .eq('id', examId)
      .single();
    if (error) return null;
    return data;
  }

  const exams = getLocal<SimulationExam>(STORAGE_KEYS.SIMULATION_EXAMS);
  return exams.find((e) => e.id === examId) || null;
}

export async function getAllSimulationExams(): Promise<SimulationExam[]> {
  const supabase = getSupabase();

  if (supabase && isSupabaseConfigured()) {
    const { data, error } = await supabase
      .from('simulation_exams')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return data || [];
  }

  return getLocal<SimulationExam>(STORAGE_KEYS.SIMULATION_EXAMS).sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
}

// ─── Simulation Sections ─────────────────────────────────────

export async function createSimulationSection(
  section: Omit<SimulationSection, 'id'>
): Promise<string> {
  const supabase = getSupabase();

  if (supabase && isSupabaseConfigured()) {
    const { data, error } = await supabase
      .from('simulation_sections')
      .insert(section)
      .select('id')
      .single();
    if (error) throw new Error(error.message);
    return data.id;
  }

  const id = crypto.randomUUID();
  const full: SimulationSection = { ...section, id };
  const existing = getLocal<SimulationSection>(STORAGE_KEYS.SIMULATION_SECTIONS);
  setLocal(STORAGE_KEYS.SIMULATION_SECTIONS, [...existing, full]);
  return id;
}

export async function updateSimulationSection(
  sectionId: string,
  updates: Partial<SimulationSection>
): Promise<void> {
  const supabase = getSupabase();

  if (supabase && isSupabaseConfigured()) {
    const { error } = await supabase
      .from('simulation_sections')
      .update(updates)
      .eq('id', sectionId);
    if (error) throw new Error(error.message);
    return;
  }

  const sections = getLocal<SimulationSection>(STORAGE_KEYS.SIMULATION_SECTIONS);
  const idx = sections.findIndex((s) => s.id === sectionId);
  if (idx >= 0) {
    sections[idx] = { ...sections[idx], ...updates };
    setLocal(STORAGE_KEYS.SIMULATION_SECTIONS, sections);
  }
}

export async function getSimulationSections(examId: string): Promise<SimulationSection[]> {
  const supabase = getSupabase();

  if (supabase && isSupabaseConfigured()) {
    const { data, error } = await supabase
      .from('simulation_sections')
      .select('*')
      .eq('simulation_exam_id', examId)
      .order('section_order', { ascending: true });
    if (error) throw new Error(error.message);
    return data || [];
  }

  return getLocal<SimulationSection>(STORAGE_KEYS.SIMULATION_SECTIONS)
    .filter((s) => s.simulation_exam_id === examId)
    .sort((a, b) => a.section_order - b.section_order);
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

export async function updateQuestionSet(
  id: string,
  updates: Partial<Pick<QuestionSet, 'name' | 'section' | 'difficulty_range' | 'topics' | 'target' | 'study_date'>>
): Promise<void> {
  const supabase = getSupabase();

  if (supabase && isSupabaseConfigured()) {
    const { error } = await supabase.from('question_sets').update(updates).eq('id', id);
    if (error) throw new Error(error.message);
    return;
  }

  const sets = getLocal<QuestionSet>(STORAGE_KEYS.QUESTION_SETS);
  const idx = sets.findIndex((s) => s.id === id);
  if (idx >= 0) {
    sets[idx] = { ...sets[idx], ...updates };
    setLocal(STORAGE_KEYS.QUESTION_SETS, sets);
  }
}

export async function updateQuestion(
  id: string,
  updates: Partial<Omit<Question, 'id' | 'set_id' | 'created_at'>>
): Promise<void> {
  const supabase = getSupabase();

  if (supabase && isSupabaseConfigured()) {
    const { error } = await supabase.from('questions').update(updates).eq('id', id);
    if (error) throw new Error(error.message);
    return;
  }

  const questions = getLocal<Question>(STORAGE_KEYS.QUESTIONS);
  const idx = questions.findIndex((q) => q.id === id);
  if (idx >= 0) {
    questions[idx] = { ...questions[idx], ...updates };
    setLocal(STORAGE_KEYS.QUESTIONS, questions);
  }
}

// ─── Recalculate Session Results ─────────────────────────────
//
// After correcting a question's correct_answer, call this to recompute
// is_correct on all responses in the session and refresh correct_count/score.

export async function recalculateSessionResults(sessionId: string): Promise<{
  updated: number;
  correctCount: number;
  totalCount: number;
}> {
  const supabase = getSupabase();

  // Load session, responses, and questions in parallel
  const session = await getSession(sessionId);
  if (!session) throw new Error('Session not found');

  const [responses, questions] = await Promise.all([
    getResponsesBySession(sessionId),
    getQuestionsBySetId(session.set_id),
  ]);

  const questionMap = new Map<string, Question>(questions.map((q) => [q.id, q]));

  // Recompute is_correct for each response
  const updates: Array<{ sessionId: string; questionId: string; isCorrect: boolean | null }> = [];
  for (const r of responses) {
    const q = questionMap.get(r.question_id);
    if (!q) continue;
    const isCorrect = r.selected_answer !== null
      ? r.selected_answer === q.correct_answer
      : null;
    if (isCorrect !== r.is_correct) {
      updates.push({ sessionId, questionId: r.question_id, isCorrect });
    }
  }

  // Apply updates
  if (supabase && isSupabaseConfigured()) {
    for (const u of updates) {
      await supabase
        .from('question_responses')
        .update({ is_correct: u.isCorrect })
        .eq('session_id', u.sessionId)
        .eq('question_id', u.questionId);
    }
  } else {
    const stored = getLocal<QuestionResponse>(STORAGE_KEYS.RESPONSES);
    for (const u of updates) {
      const idx = stored.findIndex(
        (r) => r.session_id === u.sessionId && r.question_id === u.questionId
      );
      if (idx >= 0) stored[idx] = { ...stored[idx], is_correct: u.isCorrect };
    }
    setLocal(STORAGE_KEYS.RESPONSES, stored);
  }

  // Recalculate session-level stats
  const updatedIsCorrectMap = new Map(updates.map((u) => [u.questionId, u.isCorrect]));
  const correctCount = responses.filter((r) => {
    const override = updatedIsCorrectMap.get(r.question_id);
    return override !== undefined ? override : r.is_correct;
  }).length;
  const totalCount = responses.length;
  const score = totalCount > 0 ? Math.round((correctCount / totalCount) * 100) : 0;

  await updateSession(sessionId, { correct_count: correctCount, score });

  return { updated: updates.length, correctCount, totalCount };
}

export async function deleteQuestion(id: string): Promise<void> {
  const supabase = getSupabase();

  if (supabase && isSupabaseConfigured()) {
    const { error } = await supabase.from('questions').delete().eq('id', id);
    if (error) throw new Error(error.message);
    return;
  }

  setLocal(
    STORAGE_KEYS.QUESTIONS,
    getLocal<Question>(STORAGE_KEYS.QUESTIONS).filter((q) => q.id !== id)
  );
}
