import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { textResult, errorResult } from '../types.js';

export function registerAnswersTools(server: McpServer, supabase: SupabaseClient): void {
  // ── get_wrong_answers ────────────────────────────────────────────────────
  server.tool(
    'get_wrong_answers',
    'Get details of wrong answers including question stem, correct answer, what the user chose, explanation, and any error tags/notes. Use for review and analysis.',
    {
      sessionId: z.string().uuid().optional().describe('Filter to a specific exam session ID'),
      topic: z.string().optional().describe('Filter by question topic (partial match)'),
      questionType: z.string().optional().describe('Filter by question type (e.g. "Data Sufficiency", "Critical Reasoning")'),
      limit: z.number().int().min(1).max(100).optional().default(20).describe('Max questions to return (default 20)'),
    },
    async ({ sessionId, topic, questionType, limit }) => {
      try {
        let query = supabase
          .from('question_responses')
          .select(`
            id, session_id, selected_answer, time_spent_seconds,
            error_category, note, created_at,
            exam_sessions(completed_at, mode),
            questions(
              stem, question_type, topic, difficulty,
              correct_answer, explanation,
              choice_a, choice_b, choice_c, choice_d, choice_e,
              statement1, statement2
            )
          `)
          .eq('is_correct', false)
          .not('questions', 'is', null)
          .order('created_at', { ascending: false })
          .limit(limit ?? 20);

        if (sessionId) query = query.eq('session_id', sessionId);

        const { data, error } = await query;
        if (error) return errorResult(error.message);
        if (!data || data.length === 0) {
          return textResult({ message: 'No wrong answers found matching the criteria.', count: 0, wrongAnswers: [] });
        }

        type Row = {
          id: string;
          session_id: string;
          selected_answer: string | null;
          time_spent_seconds: number;
          error_category: string | null;
          note: string | null;
          created_at: string;
          exam_sessions: { completed_at: string; mode: string } | null;
          questions: {
            stem: string;
            question_type: string;
            topic: string | null;
            difficulty: number | null;
            correct_answer: string;
            explanation: string | null;
            choice_a: string;
            choice_b: string;
            choice_c: string;
            choice_d: string;
            choice_e: string;
            statement1: string | null;
            statement2: string | null;
          } | any | null;
        };

        const rows = data as unknown as Row[];

        // Client-side filter for topic and questionType (Supabase nested filter limitation)
        const filtered = rows.filter(r => {
          if (!r.questions) return false;
          const qObj = Array.isArray(r.questions) ? r.questions[0] : r.questions;
          if (!qObj) return false;
          if (topic && !qObj.topic?.toLowerCase().includes(topic.toLowerCase())) return false;
          if (questionType && !qObj.question_type.toLowerCase().includes(questionType.toLowerCase())) return false;
          return true;
        });

        const wrongAnswers = filtered.map(r => {
          const q = Array.isArray(r.questions) ? r.questions[0] : r.questions!;
          const choices: Record<string, string> = {
            A: q.choice_a,
            B: q.choice_b,
            C: q.choice_c,
            D: q.choice_d,
            E: q.choice_e,
          };
          return {
            responseId: r.id,
            sessionId: r.session_id,
            sessionDate: r.exam_sessions?.completed_at ?? r.created_at,
            sessionMode: r.exam_sessions?.mode,
            questionType: q.question_type,
            topic: q.topic,
            difficulty: q.difficulty,
            stem: q.stem,
            statement1: q.statement1,
            statement2: q.statement2,
            choices,
            userAnswer: r.selected_answer,
            correctAnswer: q.correct_answer,
            userSelectedText: r.selected_answer ? choices[r.selected_answer] : null,
            correctAnswerText: choices[q.correct_answer],
            explanation: q.explanation,
            errorCategory: r.error_category,
            note: r.note,
            timeSpentSeconds: r.time_spent_seconds,
            timeFormatted: `${Math.floor(r.time_spent_seconds / 60)}m ${r.time_spent_seconds % 60}s`,
          };
        });

        return textResult({ count: wrongAnswers.length, wrongAnswers });
      } catch (err) {
        return errorResult(String(err));
      }
    }
  );

  // ── get_answer_change_analysis ───────────────────────────────────────────
  server.tool(
    'get_answer_change_analysis',
    'Analyze whether changing answers helps or hurts. Compares first answer vs final answer vs correct answer to reveal if the user should trust their gut.',
    {},
    async () => {
      try {
        const { data, error } = await supabase
          .from('question_responses')
          .select('first_answer, selected_answer, is_correct, questions(correct_answer)')
          .not('first_answer', 'is', null);

        if (error) return errorResult(error.message);
        if (!data || data.length === 0) {
          return textResult({ message: 'No answer change data found. (Requires first_answer to be recorded during exams.)' });
        }

        type Row = {
          first_answer: string;
          selected_answer: string | null;
          is_correct: boolean | null;
          questions: { correct_answer: string } | { correct_answer: string }[] | null;
        };

        let totalChanged = 0;
        let changedToCorrect = 0;
        let changedToWrong = 0;
        let unchangedTotal = 0;
        let unchangedCorrect = 0;
        let unchangedWrong = 0;

        for (const row of data as unknown as Row[]) {
          if (!row.questions) continue;
          const qObj = Array.isArray(row.questions) ? row.questions[0] : row.questions;
          if (!qObj) continue;
          const correct = qObj.correct_answer;
          const first = row.first_answer;
          const final = row.selected_answer ?? first;
          const changed = first !== final;

          if (changed) {
            totalChanged += 1;
            if (final === correct) changedToCorrect += 1;
            else changedToWrong += 1;
          } else {
            unchangedTotal += 1;
            if (final === correct) unchangedCorrect += 1;
            else unchangedWrong += 1;
          }
        }

        const changeAccuracyRate = totalChanged > 0 ? Math.round((changedToCorrect / totalChanged) * 100) : null;
        const firstAnswerAccuracyRate = unchangedTotal > 0
          ? Math.round((unchangedCorrect / unchangedTotal) * 100)
          : null;

        let recommendation = '';
        if (changeAccuracyRate !== null && firstAnswerAccuracyRate !== null) {
          if (changeAccuracyRate > firstAnswerAccuracyRate + 10) {
            recommendation = 'Your answer changes HELP you. When you reconsider, you tend to pick the right answer. Trust your second thought.';
          } else if (changeAccuracyRate < firstAnswerAccuracyRate - 10) {
            recommendation = 'Your answer changes HURT you. Your first instinct is more reliable. Avoid second-guessing yourself.';
          } else {
            recommendation = 'Your answer changes have a neutral effect. Neither your first instinct nor your second thought is significantly better.';
          }
        }

        return textResult({
          totalAnswersChanged: totalChanged,
          changedToCorrect,
          changedToWrong,
          changeAccuracyRate: changeAccuracyRate !== null ? `${changeAccuracyRate}%` : 'N/A',
          unchanged: {
            total: unchangedTotal,
            correct: unchangedCorrect,
            wrong: unchangedWrong,
            accuracyRate: firstAnswerAccuracyRate !== null ? `${firstAnswerAccuracyRate}%` : 'N/A',
          },
          recommendation,
        });
      } catch (err) {
        return errorResult(String(err));
      }
    }
  );
}
