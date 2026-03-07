import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { getDateFilter, toPercent, textResult, errorResult, SECTION_TO_QUESTION_TYPES } from '../types.js';

export function registerPerformanceTools(server: McpServer, supabase: SupabaseClient): void {
  // ── get_performance_summary ──────────────────────────────────────────────
  server.tool(
    'get_performance_summary',
    'Get overall GMAT performance summary: accuracy, time per question, session count, and breakdown by section (quant/verbal/di). Use period to filter by recent data.',
    {
      period: z.enum(['week', 'month', 'all']).optional().default('all').describe("Time period: 'week' = last 7 days, 'month' = last 30 days, 'all' = all time"),
    },
    async ({ period }) => {
      try {
        const cutoff = getDateFilter(period);

        let sessionsQuery = supabase
          .from('exam_sessions')
          .select('id, mode, correct_count, total_count, total_time_seconds, completed_at, simulation_section_order, set_id, question_sets(section)')
          .not('completed_at', 'is', null);
        if (cutoff) sessionsQuery = sessionsQuery.gte('completed_at', cutoff);

        const { data: sessions, error: sessErr } = await sessionsQuery;
        if (sessErr) return errorResult(sessErr.message);
        if (!sessions || sessions.length === 0) {
          return textResult({ message: 'No completed sessions found for the selected period.', totalSessions: 0 });
        }

        const totalSessions = sessions.length;
        let totalCorrect = 0;
        let totalQuestions = 0;
        let totalTimeSeconds = 0;

        const sectionMap: Record<string, { correct: number; total: number; sessions: number }> = {
          quant: { correct: 0, total: 0, sessions: 0 },
          verbal: { correct: 0, total: 0, sessions: 0 },
          di: { correct: 0, total: 0, sessions: 0 },
        };

        for (const s of sessions) {
          const correct = s.correct_count ?? 0;
          const total = s.total_count ?? 0;
          totalCorrect += correct;
          totalQuestions += total;
          totalTimeSeconds += s.total_time_seconds ?? 0;

          const setSection = (s as { question_sets?: { section?: string } }).question_sets?.section ?? '';
          let sectionKey: string | null = null;
          for (const [key, values] of Object.entries(SECTION_TO_QUESTION_TYPES)) {
            if (values.some(v => setSection.toLowerCase().includes(v.toLowerCase()))) {
              sectionKey = key;
              break;
            }
          }
          if (!sectionKey) {
            if (/quant/i.test(setSection)) sectionKey = 'quant';
            else if (/verbal/i.test(setSection)) sectionKey = 'verbal';
            else if (/data insight|di\b/i.test(setSection)) sectionKey = 'di';
          }
          if (sectionKey && sectionKey in sectionMap) {
            sectionMap[sectionKey].correct += correct;
            sectionMap[sectionKey].total += total;
            sectionMap[sectionKey].sessions += 1;
          }
        }

        const overallAccuracy = toPercent(totalCorrect, totalQuestions);
        const avgTimePerQuestion = totalQuestions > 0
          ? Math.round(totalTimeSeconds / totalQuestions)
          : 0;

        const bySection = Object.entries(sectionMap)
          .filter(([, v]) => v.sessions > 0)
          .map(([section, v]) => ({
            section,
            accuracy: toPercent(v.correct, v.total),
            sessions: v.sessions,
            correctCount: v.correct,
            totalCount: v.total,
          }));

        return textResult({
          period,
          totalSessions,
          totalQuestionsAttempted: totalQuestions,
          overallAccuracy: `${overallAccuracy}%`,
          avgTimePerQuestionSeconds: avgTimePerQuestion,
          avgTimePerQuestionFormatted: `${Math.floor(avgTimePerQuestion / 60)}m ${avgTimePerQuestion % 60}s`,
          bySection,
        });
      } catch (err) {
        return errorResult(String(err));
      }
    }
  );

  // ── get_session_history ──────────────────────────────────────────────────
  server.tool(
    'get_session_history',
    'Get a list of past exam sessions with scores, accuracy, and timing. Filter by mode (timed, practice, review, simulation).',
    {
      mode: z.enum(['timed', 'practice', 'review', 'simulation']).optional().describe('Filter by exam mode'),
      limit: z.number().int().min(1).max(100).optional().default(20).describe('Number of sessions to return (default 20)'),
    },
    async ({ mode, limit }) => {
      try {
        let query = supabase
          .from('exam_sessions')
          .select('id, mode, correct_count, total_count, total_time_seconds, score, started_at, completed_at, question_sets(name, section)')
          .not('completed_at', 'is', null)
          .order('completed_at', { ascending: false })
          .limit(limit ?? 20);

        if (mode) query = query.eq('mode', mode);

        const { data, error } = await query;
        if (error) return errorResult(error.message);
        if (!data || data.length === 0) return textResult({ message: 'No sessions found.', sessions: [] });

        const sessions = data.map(s => {
          const qset = s as { question_sets?: { name?: string; section?: string } };
          const correct = s.correct_count ?? 0;
          const total = s.total_count ?? 0;
          return {
            sessionId: s.id,
            date: s.completed_at,
            mode: s.mode,
            setName: qset.question_sets?.name ?? 'Unknown',
            setSection: qset.question_sets?.section ?? '',
            accuracy: `${toPercent(correct, total)}%`,
            correctCount: correct,
            totalCount: total,
            totalTimeSeconds: s.total_time_seconds,
            totalTimeFormatted: s.total_time_seconds
              ? `${Math.floor(s.total_time_seconds / 60)}m ${s.total_time_seconds % 60}s`
              : null,
            score: s.score,
          };
        });

        return textResult({ count: sessions.length, sessions });
      } catch (err) {
        return errorResult(String(err));
      }
    }
  );

  // ── get_session_detail ───────────────────────────────────────────────────
  server.tool(
    'get_session_detail',
    'Get per-question time breakdown for a specific exam session. Shows time spent on each question, whether it was correct, and flags slow questions that exceeded the GMAT target time. Use get_session_history first to get session IDs.',
    {
      sessionId: z.string().uuid().describe('The session ID to get detail for'),
    },
    async ({ sessionId }) => {
      try {
        const { data, error } = await supabase
          .from('question_responses')
          .select(`
            question_order, selected_answer, is_correct,
            time_spent_seconds, flagged_for_review, triage_triggered,
            confidence_rating, error_category,
            questions(question_type, topic, difficulty, correct_answer)
          `)
          .eq('session_id', sessionId)
          .order('question_order', { ascending: true });

        if (error) return errorResult(error.message);
        if (!data || data.length === 0) {
          return textResult({ message: `No responses found for session ${sessionId}` });
        }

        const TARGETS: Record<string, number> = {
          'Problem Solving': 120, 'Data Sufficiency': 120,
          'Critical Reasoning': 120, 'Reading Comprehension': 150,
          'Multi-Source Reasoning': 150, 'Table Analysis': 120,
          'Graphics Interpretation': 120, 'Two-Part Analysis': 150,
        };

        type Row = {
          question_order: number;
          selected_answer: string | null;
          is_correct: boolean | null;
          time_spent_seconds: number;
          flagged_for_review: boolean | null;
          triage_triggered: boolean | null;
          confidence_rating: number | null;
          error_category: string | null;
          questions: { question_type: string; topic?: string; difficulty?: number; correct_answer: string } | { question_type: string; topic?: string; difficulty?: number; correct_answer: string }[] | null;
        };

        let totalTime = 0;
        let slowCount = 0;
        let correctCount = 0;

        const questions = (data as unknown as Row[]).map(r => {
          const q = Array.isArray(r.questions) ? r.questions[0] : r.questions;
          const target = q ? (TARGETS[q.question_type] ?? 120) : 120;
          const isOver = r.time_spent_seconds > target;
          if (isOver) slowCount++;
          if (r.is_correct) correctCount++;
          totalTime += r.time_spent_seconds;

          return {
            questionNumber: r.question_order + 1,
            questionType: q?.question_type ?? 'Unknown',
            topic: q?.topic ?? null,
            difficulty: q?.difficulty ?? null,
            timeSeconds: r.time_spent_seconds,
            timeFormatted: `${Math.floor(r.time_spent_seconds / 60)}m ${r.time_spent_seconds % 60}s`,
            targetSeconds: target,
            targetFormatted: `${Math.floor(target / 60)}m ${target % 60}s`,
            overTarget: isOver,
            overBySeconds: isOver ? r.time_spent_seconds - target : 0,
            isCorrect: r.is_correct,
            userAnswer: r.selected_answer,
            correctAnswer: q?.correct_answer ?? null,
            flagged: r.flagged_for_review,
            triageTriggered: r.triage_triggered,
            confidenceRating: r.confidence_rating,
            errorCategory: r.error_category,
          };
        });

        const avgTime = data.length > 0 ? Math.round(totalTime / data.length) : 0;

        return textResult({
          sessionId,
          totalQuestions: data.length,
          correctCount,
          accuracy: `${toPercent(correctCount, data.length)}%`,
          totalTimeSeconds: totalTime,
          totalTimeFormatted: `${Math.floor(totalTime / 60)}m ${totalTime % 60}s`,
          avgTimePerQuestionSeconds: avgTime,
          avgTimeFormatted: `${Math.floor(avgTime / 60)}m ${avgTime % 60}s`,
          slowQuestionsCount: slowCount,
          slowQuestionsPercent: `${toPercent(slowCount, data.length)}%`,
          questions,
        });
      } catch (err) {
        return errorResult(String(err));
      }
    }
  );
}
