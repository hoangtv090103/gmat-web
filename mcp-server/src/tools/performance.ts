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

        // Fetch completed sessions
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

          // Determine section from set metadata
          const setSection = (s as { question_sets?: { section?: string } }).question_sets?.section ?? '';
          let sectionKey: string | null = null;
          for (const [key, values] of Object.entries(SECTION_TO_QUESTION_TYPES)) {
            if (values.some(v => setSection.toLowerCase().includes(v.toLowerCase()))) {
              sectionKey = key;
              break;
            }
          }
          // Fallback: quant/verbal/di from section string directly
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
}
