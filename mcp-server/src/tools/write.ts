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
  // Reading Comprehension specific
  passageId: z.string().optional().describe('Shared passage ID for RC questions from the same passage (use same value for all RC questions from one passage)'),
  passageText: z.string().optional().describe('Full passage text (provide for the first RC question only; others share the same passageId)'),
});

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
          .select('id, name, section, difficulty_range, topics, total_questions, created_at, source_filename')
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
          })),
        });
      } catch (err) {
        return errorResult(String(err));
      }
    }
  );

  // ── create_question_set ──────────────────────────────────────────────────
  server.tool(
    'create_question_set',
    'Create a new GMAT question set with questions and save it to the system. The questions will immediately be available in the GMAT web app for practice. Use this to generate targeted practice sets based on weak areas.',
    {
      name: z.string().min(1).describe('Name for the question set (e.g. "DS Number Properties - Targeted Practice")'),
      section: z.enum(['Quantitative', 'Verbal', 'Data Insights']).describe('GMAT section this set belongs to'),
      difficultyRange: z.string().optional().describe('Difficulty range string, e.g. "600-700" or "700+"'),
      topics: z.string().optional().describe('Comma-separated topics covered, e.g. "Algebra, Number Properties, Geometry"'),
      questions: z.array(QuestionSchema).min(1).max(100).describe('Array of questions to include in this set'),
    },
    async ({ name, section, difficultyRange, topics, questions }) => {
      try {
        // Data Sufficiency: auto-fill standard choices if not provided
        const DS_CHOICES = {
          choiceA: 'Statement (1) ALONE is sufficient, but statement (2) alone is not sufficient to answer the question asked.',
          choiceB: 'Statement (2) ALONE is sufficient, but statement (1) alone is not sufficient to answer the question asked.',
          choiceC: 'BOTH statements (1) and (2) TOGETHER are sufficient to answer the question asked, but NEITHER statement ALONE is sufficient.',
          choiceD: 'EACH statement ALONE is sufficient to answer the question asked.',
          choiceE: 'Statements (1) and (2) TOGETHER are NOT sufficient to answer the question asked, and additional data specific to the problem are needed.',
        };

        // 1. Insert question set
        const { data: setData, error: setErr } = await supabase
          .from('question_sets')
          .insert({
            name,
            section,
            difficulty_range: difficultyRange ?? null,
            topics: topics ?? null,
            total_questions: questions.length,
            source_filename: 'claude-generated',
          })
          .select('id')
          .single();

        if (setErr) return errorResult(`Failed to create question set: ${setErr.message}`);
        const setId = setData.id as string;

        // 2. Bulk-insert questions
        const questionRows = questions.map(q => {
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
            passage_id: q.passageId ?? null,
            passage_text: q.passageText ?? null,
          };
        });

        const { error: qErr } = await supabase.from('questions').insert(questionRows);
        if (qErr) {
          // Cleanup: delete the set if questions failed
          await supabase.from('question_sets').delete().eq('id', setId);
          return errorResult(`Failed to insert questions: ${qErr.message}`);
        }

        return textResult({
          success: true,
          setId,
          setName: name,
          section,
          questionCount: questions.length,
          message: `Question set "${name}" created successfully with ${questions.length} questions. Open the GMAT web app to start practicing!`,
        });
      } catch (err) {
        return errorResult(String(err));
      }
    }
  );
}
