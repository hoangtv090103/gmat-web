import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { toPercent, textResult, errorResult, QUESTION_TIME_TARGETS, SECTION_TO_QUESTION_TYPES } from '../types.js';

export function registerSimulationTools(server: McpServer, supabase: SupabaseClient): void {
  // ── get_simulation_results ───────────────────────────────────────────────
  server.tool(
    'get_simulation_results',
    'Get results from full GMAT mock exams (simulation mode). Shows scaled scores per section (60-90 range), total score, and time used.',
    {
      limit: z.number().int().min(1).max(20).optional().default(10).describe('Number of simulations to return (default 10)'),
    },
    async ({ limit }) => {
      try {
        const { data: exams, error: examErr } = await supabase
          .from('simulation_exams')
          .select('id, created_at, completed_at, section_order, status, total_score, breaks_enabled')
          .eq('status', 'completed')
          .order('completed_at', { ascending: false })
          .limit(limit ?? 10);

        if (examErr) return errorResult(examErr.message);
        if (!exams || exams.length === 0) {
          return textResult({ message: 'No completed simulation exams found.', simulations: [] });
        }

        // Fetch sections for all exams
        const examIds = exams.map(e => e.id);
        const { data: sections, error: secErr } = await supabase
          .from('simulation_sections')
          .select('simulation_exam_id, section_type, section_order, scaled_score, raw_correct, raw_total, time_used_seconds, questions_skipped')
          .in('simulation_exam_id', examIds);

        if (secErr) return errorResult(secErr.message);

        const sectionsByExam = new Map<string, typeof sections>();
        for (const sec of sections ?? []) {
          const list = sectionsByExam.get(sec.simulation_exam_id) ?? [];
          list.push(sec);
          sectionsByExam.set(sec.simulation_exam_id, list);
        }

        const simulations = exams.map(exam => {
          const examSections = (sectionsByExam.get(exam.id) ?? [])
            .sort((a, b) => a.section_order - b.section_order)
            .map(sec => ({
              sectionType: sec.section_type,
              sectionOrder: sec.section_order + 1,
              scaledScore: sec.scaled_score,
              rawCorrect: sec.raw_correct,
              rawTotal: sec.raw_total,
              accuracy: sec.raw_total ? `${toPercent(sec.raw_correct ?? 0, sec.raw_total)}%` : null,
              timeUsedSeconds: sec.time_used_seconds,
              timeFormatted: sec.time_used_seconds
                ? `${Math.floor(sec.time_used_seconds / 60)}m ${sec.time_used_seconds % 60}s`
                : null,
              questionsSkipped: sec.questions_skipped,
            }));

          return {
            examId: exam.id,
            date: exam.completed_at,
            totalScore: exam.total_score,
            sectionOrder: exam.section_order,
            breaksEnabled: exam.breaks_enabled,
            sections: examSections,
          };
        });

        return textResult({ count: simulations.length, simulations });
      } catch (err) {
        return errorResult(String(err));
      }
    }
  );

  // ── get_section_readiness ────────────────────────────────────────────────
  server.tool(
    'get_section_readiness',
    'Get a readiness score for each GMAT section (Quant, Verbal, DI) based on recent accuracy, timing, and practice consistency. Scores are 0-100.',
    {},
    async () => {
      try {
        // Get responses from last 30 days with question type info
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const { data, error } = await supabase
          .from('question_responses')
          .select('is_correct, time_spent_seconds, created_at, questions(question_type)')
          .gte('created_at', thirtyDaysAgo.toISOString())
          .not('questions', 'is', null);

        if (error) return errorResult(error.message);
        if (!data || data.length === 0) {
          return textResult({ message: 'Not enough recent data to compute readiness. Try practicing more first.', readiness: [] });
        }

        type Row = {
          is_correct: boolean | null;
          time_spent_seconds: number;
          created_at: string;
          questions: { question_type: string } | { question_type: string }[] | null;
        };

        const sectionStats: Record<string, {
          correct: number; total: number;
          withinTime: number; daysActive: Set<string>;
        }> = {
          quant: { correct: 0, total: 0, withinTime: 0, daysActive: new Set() },
          verbal: { correct: 0, total: 0, withinTime: 0, daysActive: new Set() },
          di: { correct: 0, total: 0, withinTime: 0, daysActive: new Set() },
        };

        for (const row of data as unknown as Row[]) {
          if (!row.questions) continue;
          const qObj = Array.isArray(row.questions) ? row.questions[0] : row.questions;
          if (!qObj) continue;
          const qType = qObj.question_type;

          // Map question type to section
          let section: string | null = null;
          for (const [sec, types] of Object.entries(SECTION_TO_QUESTION_TYPES)) {
            if (types.includes(qType)) { section = sec; break; }
          }
          if (!section || !(section in sectionStats)) continue;

          const stats = sectionStats[section];
          stats.total += 1;
          if (row.is_correct) stats.correct += 1;

          const target = QUESTION_TIME_TARGETS[qType] ?? 120;
          if (row.time_spent_seconds <= target) stats.withinTime += 1;

          const day = row.created_at.slice(0, 10);
          stats.daysActive.add(day);
        }

        const readiness = Object.entries(sectionStats)
          .filter(([, s]) => s.total > 0)
          .map(([section, s]) => {
            const accuracy = toPercent(s.correct, s.total) / 100;
            const timingScore = toPercent(s.withinTime, s.total) / 100;
            const consistency = Math.min(s.daysActive.size / 7, 1); // capped at 7 unique days

            // Composite: accuracy 50%, timing 30%, consistency 20%
            const readinessScore = Math.round((accuracy * 0.5 + timingScore * 0.3 + consistency * 0.2) * 100);

            let recommendation = '';
            if (readinessScore >= 80) recommendation = 'Strong. Maintain consistency.';
            else if (readinessScore >= 60) recommendation = 'Progressing well. Focus on speed and consistency.';
            else if (readinessScore >= 40) recommendation = 'Needs work. Prioritize accuracy on core topics first.';
            else recommendation = 'Critical. Significant practice needed before attempting real exam.';

            return {
              section,
              readinessScore,
              accuracy: `${Math.round(accuracy * 100)}%`,
              timingScore: `${Math.round(timingScore * 100)}%`,
              consistencyDays: s.daysActive.size,
              totalQuestionsLast30Days: s.total,
              recommendation,
            };
          })
          .sort((a, b) => a.readinessScore - b.readinessScore);

        return textResult({ readiness });
      } catch (err) {
        return errorResult(String(err));
      }
    }
  );
}
