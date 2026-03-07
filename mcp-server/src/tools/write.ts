import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { textResult, errorResult } from '../types.js';

const QuestionSchema = z.object({
  questionNumber: z.number().int().min(1).describe('Question number within the set (1-based)'),
  questionType: z.string().describe('Question type: "Problem Solving", "Data Sufficiency", "Critical Reasoning", "Reading Comprehension", "Multi-Source Reasoning", "Table Analysis", "Graphics Interpretation", "Two-Part Analysis"'),
  difficulty: z.number().optional().describe('Difficulty level (500-800 GMAT scale)'),
  topic: z.string().optional().describe('Topic or concept tested (e.g. "Algebra", "Number Properties", "Assumption")'),
  stem: z.string().describe('The question stem / main question text'),
  choiceA: z.string().describe('Answer choice A'),
  choiceB: z.string().describe('Answer choice B'),
  choiceC: z.string().describe('Answer choice C'),
  choiceD: z.string().describe('Answer choice D'),
  choiceE: z.string().describe('Answer choice E'),
  correctAnswer: z.enum(['A', 'B', 'C', 'D', 'E']).describe('The correct answer letter'),
  explanation: z.string().optional().describe('Explanation of why the correct answer is right'),
  // Data Sufficiency specific
  statement1: z.string().optional().describe('Statement 1 text (Data Sufficiency only)'),
  statement2: z.string().optional().describe('Statement 2 text (Data Sufficiency only)'),
  s1Verdict: z.string().optional().describe('Whether Statement 1 alone is sufficient (Data Sufficiency only)'),
  s2Verdict: z.string().optional().describe('Whether Statement 2 alone is sufficient (Data Sufficiency only)'),
  reasoning: z.string().optional().describe('Combined reasoning for the DS answer (Data Sufficiency only)'),
  // Reading Comprehension specific — only needed when calling add_questions_to_set with a pre-existing passage UUID
  passageId: z.string().optional().describe('Pre-existing passage UUID. Only needed when referencing a passage already in the DB. Prefer the top-level passages[] field for new passages.'),
  // Two-Part Analysis specific
  correctAnswer2: z.enum(['A', 'B', 'C', 'D', 'E']).optional().describe('Correct answer for Part 2 (Two-Part Analysis only). Part 1 uses correctAnswer.'),
  twoPartCol1Label: z.string().optional().describe('Column header for Part 1 (Two-Part Analysis only, e.g. "Team X wins")'),
  twoPartCol2Label: z.string().optional().describe('Column header for Part 2 (Two-Part Analysis only, e.g. "Team Y wins")'),
  // Multi-Source Reasoning specific
  passageGroupId: z.string().optional().describe('UUID of the passage group (Multi-Source Reasoning only). Links this question to a set of tabbed sources.'),
});

// Inline passage schema — attach passages + their questions in a single call
const PassageWithQuestionsSchema = z.object({
  passageKey: z.string().describe('Temporary local key linking questions to this passage (e.g. "p1", "p2"). Not stored in DB.'),
  passageText: z.string().min(10).describe('Full text of the RC passage'),
  questions: z.array(QuestionSchema).min(1).describe('RC questions for this passage. Do NOT set passageId on these — it is resolved automatically from passageKey.'),
});

// ── Shared constants ─────────────────────────────────────────────────────────
const DS_CHOICES = {
  choiceA: 'Statement (1) ALONE is sufficient, but statement (2) alone is not sufficient to answer the question asked.',
  choiceB: 'Statement (2) ALONE is sufficient, but statement (1) alone is not sufficient to answer the question asked.',
  choiceC: 'BOTH statements (1) and (2) TOGETHER are sufficient to answer the question asked, but NEITHER statement ALONE is sufficient.',
  choiceD: 'EACH statement ALONE is sufficient to answer the question asked.',
  choiceE: 'Statements (1) and (2) TOGETHER are NOT sufficient to answer the question asked, and additional data specific to the problem are needed.',
};

// ── Shared helpers ────────────────────────────────────────────────────────────

/**
 * Build DB row objects for questions.
 * passageIdMap: maps passageKey → real UUID (used when questions come from an inline passage block).
 * For questions in top-level questions[], passage_id comes from q.passageId (existing UUID) or null.
 */
function buildQuestionRows(
  questions: z.infer<typeof QuestionSchema>[],
  setId: string,
  passageIdOverride?: string // when all questions belong to the same passage (inline block)
): Record<string, unknown>[] {
  return questions.map(q => {
    const isDS = q.questionType === 'Data Sufficiency';
    const choices = isDS
      ? DS_CHOICES
      : { choiceA: q.choiceA, choiceB: q.choiceB, choiceC: q.choiceC, choiceD: q.choiceD, choiceE: q.choiceE };

    return {
      set_id: setId,
      question_number: q.questionNumber,
      difficulty: q.difficulty ?? null,
      question_type: q.questionType,
      topic: q.topic ?? null,
      stem: q.stem,
      statement1: q.statement1 ?? null,
      statement2: q.statement2 ?? null,
      choice_a: choices.choiceA,
      choice_b: choices.choiceB,
      choice_c: choices.choiceC,
      choice_d: choices.choiceD,
      choice_e: choices.choiceE,
      correct_answer: q.correctAnswer,
      explanation: q.explanation ?? null,
      s1_verdict: q.s1Verdict ?? null,
      s2_verdict: q.s2Verdict ?? null,
      reasoning: q.reasoning ?? null,
      passage_id: passageIdOverride ?? q.passageId ?? null,
      // DI Two-Part Analysis
      correct_answer2: q.correctAnswer2 ?? null,
      two_part_col1_label: q.twoPartCol1Label ?? null,
      two_part_col2_label: q.twoPartCol2Label ?? null,
      // DI Multi-Source Reasoning
      passage_group_id: q.passageGroupId ?? null,
    };
  });
}

/**
 * Insert passages sequentially and return all question rows with resolved passage UUIDs.
 * Sequential (not parallel) for clean error handling — passage count is typically 1–3.
 */
async function insertPassagesWithQuestions(
  passages: z.infer<typeof PassageWithQuestionsSchema>[],
  setId: string,
  supabase: SupabaseClient
): Promise<{ questionRows: Record<string, unknown>[]; passageCount: number }> {
  const questionRows: Record<string, unknown>[] = [];

  for (const p of passages) {
    const { data, error } = await supabase
      .from('passages')
      .insert({ set_id: setId, passage_text: p.passageText })
      .select('id')
      .single();

    if (error) throw new Error(`Passage insert failed for key "${p.passageKey}": ${error.message}`);

    const passageUUID = data.id as string;
    questionRows.push(...buildQuestionRows(p.questions, setId, passageUUID));
  }

  return { questionRows, passageCount: passages.length };
}

export function registerWriteTools(server: McpServer, supabase: SupabaseClient): void {
  // ── get_question_sets ────────────────────────────────────────────────────
  server.tool(
    'get_question_sets',
    'Get available GMAT question sets in the system. Use before creating a set to avoid duplicates, or to show the user what sets exist.',
    {
      section: z.string().optional().describe('Filter by section name (partial match, e.g. "Quantitative", "Verbal", "Data Insights")'),
    },
    async ({ section }) => {
      try {
        let query = supabase
          .from('question_sets')
          .select('id, name, section, difficulty_range, topics, total_questions, created_at, source_filename, study_date')
          .order('created_at', { ascending: false });

        if (section) {
          query = query.ilike('section', `%${section}%`);
        }

        const { data, error } = await query;
        if (error) return errorResult(error.message);
        if (!data || data.length === 0) {
          return textResult({ message: 'No question sets found.', count: 0, sets: [] });
        }

        return textResult({
          count: data.length,
          sets: data.map(s => ({
            id: s.id,
            name: s.name,
            section: s.section,
            difficultyRange: s.difficulty_range,
            topics: s.topics,
            totalQuestions: s.total_questions,
            createdAt: s.created_at,
            sourceFilename: s.source_filename,
            studyDate: s.study_date,
          })),
        });
      } catch (err) {
        return errorResult(String(err));
      }
    }
  );

  // ── create_passage (LEGACY) ───────────────────────────────────────────────
  server.tool(
    'create_passage',
    'LEGACY: Use the `passages` field in `create_question_set` or `add_questions_to_set` instead — it creates passages and questions in a single call. This tool is kept for backward compatibility only.',
    {
      setId: z.string().uuid().describe('The UUID of the question set this passage belongs to'),
      passageText: z.string().min(10).describe('The full text of the reading comprehension passage'),
    },
    async ({ setId, passageText }) => {
      try {
        const { data, error } = await supabase
          .from('passages')
          .insert({
            set_id: setId,
            passage_text: passageText,
          })
          .select('id')
          .single();

        if (error) return errorResult(`Failed to create passage: ${error.message}`);

        return textResult({
          success: true,
          passageId: data.id,
          message: `Passage created successfully. Use passageId: ${data.id} for the associated questions.`,
        });
      } catch (err) {
        return errorResult(String(err));
      }
    }
  );

  // ── create_question_set ──────────────────────────────────────────────────
  server.tool(
    'create_question_set',
    'Create a new GMAT question set with all its questions in a single call. ' +
    'For non-RC sets (PS, DS, CR, SC): pass all questions in the `questions` array. ' +
    'For RC sets or mixed Verbal sets: use the `passages` array to embed each passage with its questions inline — no separate create_passage call needed. ' +
    'You can combine both fields for a mixed set (e.g. CR questions in `questions` + RC passages in `passages`). ' +
    'Omit both to create an empty set.',
    {
      name: z.string().min(1).describe('Name for the question set (e.g. "Verbal Mixed Practice Set 1")'),
      section: z.enum(['Quantitative', 'Verbal', 'Data Insights']).describe('GMAT section this set belongs to'),
      difficultyRange: z.string().optional().describe('Difficulty range string, e.g. "600-700" or "700+"'),
      topics: z.string().optional().describe('Comma-separated topics covered, e.g. "Critical Reasoning, Reading Comprehension"'),
      studyDate: z.string().optional().describe('The date this question set is intended for, in YYYY-MM-DD format (e.g. "2026-03-07"). Used to filter sets by study day on the dashboard.'),
      questions: z.array(QuestionSchema).optional().describe('Non-RC questions (CR, PS, DS, SC, etc.). Can be combined with passages[] for mixed sets.'),
      passages: z.array(PassageWithQuestionsSchema).optional().describe('RC passages with their questions inline. Each passage entry creates one passage record and links its questions automatically. Use passageKey (e.g. "p1") to identify each passage — it is not stored in the DB.'),
    },
    async ({ name, section, difficultyRange, topics, studyDate, questions = [], passages = [] }) => {
      try {
        // 1. Insert question set (use 0 initially; update after questions are inserted)
        const { data: setData, error: setErr } = await supabase
          .from('question_sets')
          .insert({
            name,
            section,
            difficulty_range: difficultyRange ?? null,
            topics: topics ?? null,
            total_questions: 0,
            source_filename: 'claude-generated',
            study_date: studyDate ?? null,
          })
          .select('id')
          .single();

        if (setErr) return errorResult(`Failed to create question set: ${setErr.message}`);
        const setId = setData.id as string;

        if (questions.length === 0 && passages.length === 0) {
          return textResult({
            success: true,
            setId,
            setName: name,
            message: `Empty question set "${name}" created. Set ID: ${setId}. Use add_questions_to_set to add content.`,
          });
        }

        try {
          // 2. Insert passages + collect their question rows
          const { questionRows: passageQuestionRows, passageCount } =
            passages.length > 0
              ? await insertPassagesWithQuestions(passages, setId, supabase)
              : { questionRows: [], passageCount: 0 };

          // 3. Build rows for top-level (non-passage) questions
          const nonPassageRows = buildQuestionRows(questions, setId);

          // 4. Bulk-insert all questions in one shot
          const allRows = [...nonPassageRows, ...passageQuestionRows];
          if (allRows.length > 0) {
            const { error: qErr } = await supabase.from('questions').insert(allRows);
            if (qErr) throw new Error(`Failed to insert questions: ${qErr.message}`);
          }

          // 5. Update total_questions count
          await supabase.from('question_sets').update({ total_questions: allRows.length }).eq('id', setId);

          return textResult({
            success: true,
            setId,
            setName: name,
            section,
            questionCount: allRows.length,
            passageCount,
            message: `Question set "${name}" created with ${allRows.length} question(s) across ${passageCount} passage(s). Open the GMAT web app to start practicing!`,
          });
        } catch (innerErr) {
          // Rollback: delete the set (cascades to passages + questions via FK)
          await supabase.from('question_sets').delete().eq('id', setId);
          return errorResult(String(innerErr));
        }
      } catch (err) {
        return errorResult(String(err));
      }
    }
  );

  // ── add_questions_to_set ─────────────────────────────────────────────────
  server.tool(
    'add_questions_to_set',
    'Add questions to an existing question set. ' +
    'For non-RC additions: use the `questions` array. ' +
    'For RC additions: use the `passages` array to embed each passage with its questions inline. ' +
    'Both fields can be combined. At least one must be provided.',
    {
      setId: z.string().uuid().describe('The UUID of the existing question set'),
      questions: z.array(QuestionSchema).optional().describe('Non-RC questions to add (CR, PS, DS, SC, etc.). Can include RC questions with a pre-existing passageId UUID.'),
      passages: z.array(PassageWithQuestionsSchema).optional().describe('New RC passages with their questions inline. Each entry creates one passage and links its questions automatically.'),
    },
    async ({ setId, questions = [], passages = [] }) => {
      try {
        if (questions.length === 0 && passages.length === 0) {
          return errorResult('At least one of `questions` or `passages` must be non-empty.');
        }

        // 1. Insert passages + collect their question rows
        const { questionRows: passageQuestionRows, passageCount } =
          passages.length > 0
            ? await insertPassagesWithQuestions(passages, setId, supabase)
            : { questionRows: [], passageCount: 0 };

        // 2. Build rows for top-level questions
        const nonPassageRows = buildQuestionRows(questions, setId);

        // 3. Bulk-insert all questions
        const allRows = [...nonPassageRows, ...passageQuestionRows];
        if (allRows.length > 0) {
          const { error: qErr } = await supabase.from('questions').insert(allRows);
          if (qErr) return errorResult(`Failed to insert questions: ${qErr.message}`);
        }

        // 4. Update total_questions count
        const { count } = await supabase.from('questions').select('id', { count: 'exact' }).eq('set_id', setId);
        if (count !== null) {
          await supabase.from('question_sets').update({ total_questions: count }).eq('id', setId);
        }

        return textResult({
          success: true,
          setId,
          addedCount: allRows.length,
          passageCount,
          totalCount: count ?? allRows.length,
          message: `Successfully added ${allRows.length} question(s) across ${passageCount} passage(s) to the set.`,
        });
      } catch (err) {
        return errorResult(String(err));
      }
    }
  );

  // ── update_error_category ────────────────────────────────────────────────
  server.tool(
    'update_error_category',
    'Update the error category and/or note for a specific question response after reviewing why it was wrong. Use get_session_detail to find the session ID and question number first. Error categories: Content = wrong knowledge, Process = right knowledge but wrong execution, Habit = careless/timing mistake.',
    {
      sessionId: z.string().uuid().describe('The session ID containing the response'),
      questionOrder: z.number().int().min(1).describe('Question number (1-based) within the session'),
      errorCategory: z.enum(['Content', 'Process', 'Habit']).describe('Content = knowledge gap, Process = execution error, Habit = careless/timing mistake'),
      note: z.string().optional().describe('Optional note explaining the specific mistake'),
    },
    async ({ sessionId, questionOrder, errorCategory, note }) => {
      try {
        const updateData: Record<string, unknown> = { error_category: errorCategory };
        if (note !== undefined) updateData.note = note;

        const { data, error } = await supabase
          .from('question_responses')
          .update(updateData)
          .eq('session_id', sessionId)
          .eq('question_order', questionOrder) // stored as 1-based
          .select('id, question_order, error_category, note, questions(topic, question_type)')
          .single();

        if (error) return errorResult(error.message);
        if (!data) return errorResult(`No response found for session ${sessionId}, question ${questionOrder}`);

        const q = (data as { questions?: { topic?: string; question_type?: string } | { topic?: string; question_type?: string }[] }).questions;
        const qInfo = Array.isArray(q) ? q[0] : q;

        return textResult({
          success: true,
          sessionId,
          questionNumber: questionOrder,
          topic: qInfo?.topic ?? null,
          questionType: qInfo?.question_type ?? null,
          errorCategory,
          note: note ?? null,
          message: `Updated Q${questionOrder} — error category set to "${errorCategory}"${note ? ` with note: "${note}"` : ''}.`,
        });
      } catch (err) {
        return errorResult(String(err));
      }
    }
  );
}
