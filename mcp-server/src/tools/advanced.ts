import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { toPercent, textResult, errorResult, QUESTION_TIME_TARGETS, SECTION_TO_QUESTION_TYPES } from '../types.js';

export function registerAdvancedTools(server: McpServer, supabase: SupabaseClient): void {
  // ── get_time_analysis ────────────────────────────────────────────────────
  server.tool(
    'get_time_analysis',
    'Analyze time management: how long the user spends per question type vs GMAT target times. Identifies where time is being wasted and correlates with accuracy.',
    {
      section: z.enum(['quant', 'verbal', 'di']).optional().describe('Filter to a specific GMAT section'),
    },
    async ({ section }) => {
      try {
        const { data, error } = await supabase
          .from('question_responses')
          .select('is_correct, time_spent_seconds, triage_triggered, questions(question_type)')
          .not('questions', 'is', null)
          .gt('time_spent_seconds', 0);

        if (error) return errorResult(error.message);
        if (!data || data.length === 0) {
          return textResult({ message: 'No timing data found.', analysis: [] });
        }

        type Row = {
          is_correct: boolean | null;
          time_spent_seconds: number;
          triage_triggered: boolean | null;
          questions: { question_type: string } | { question_type: string }[] | null;
        };

        const allowedTypes = section ? SECTION_TO_QUESTION_TYPES[section] : null;

        const typeMap = new Map<string, {
          totalTime: number; count: number;
          correct: number; withinTarget: number; triageCount: number;
        }>();

        for (const row of data as unknown as Row[]) {
          if (!row.questions) continue;
          const qObj = Array.isArray(row.questions) ? row.questions[0] : row.questions;
          if (!qObj) continue;
          const qType = qObj.question_type;
          if (allowedTypes && !allowedTypes.includes(qType)) continue;

          const existing = typeMap.get(qType) ?? {
            totalTime: 0, count: 0, correct: 0, withinTarget: 0, triageCount: 0,
          };
          existing.totalTime += row.time_spent_seconds;
          existing.count += 1;
          if (row.is_correct) existing.correct += 1;
          const target = QUESTION_TIME_TARGETS[qType] ?? 120;
          if (row.time_spent_seconds <= target) existing.withinTarget += 1;
          if (row.triage_triggered) existing.triageCount += 1;
          typeMap.set(qType, existing);
        }

        const analysis = Array.from(typeMap.entries())
          .filter(([, v]) => v.count >= 3)
          .map(([questionType, v]) => {
            const avgTime = Math.round(v.totalTime / v.count);
            const target = QUESTION_TIME_TARGETS[questionType] ?? 120;
            const overBy = avgTime - target;
            const withinTargetPct = toPercent(v.withinTarget, v.count);
            return {
              questionType,
              avgTimeSeconds: avgTime,
              avgTimeFormatted: `${Math.floor(avgTime / 60)}m ${avgTime % 60}s`,
              targetSeconds: target,
              targetFormatted: `${Math.floor(target / 60)}m ${target % 60}s`,
              overTimeBySeconds: overBy,
              status: overBy > 30 ? '⚠️ Over target' : overBy > 0 ? '🔶 Slightly over' : '✅ On target',
              withinTargetPercent: `${withinTargetPct}%`,
              accuracy: `${toPercent(v.correct, v.count)}%`,
              triageRate: `${toPercent(v.triageCount, v.count)}%`,
              totalAttempts: v.count,
            };
          })
          .sort((a, b) => b.overTimeBySeconds - a.overTimeBySeconds);

        // Overall recommendation
        const overTimeTypes = analysis.filter(a => a.overTimeBySeconds > 30);
        const recommendation = overTimeTypes.length > 0
          ? `Focus on speed drills for: ${overTimeTypes.map(t => t.questionType).join(', ')}`
          : 'Your time management is on target across question types.';

        return textResult({
          section: section ?? 'all',
          recommendation,
          analysis,
        });
      } catch (err) {
        return errorResult(String(err));
      }
    }
  );

  // ── get_confidence_accuracy_gap ──────────────────────────────────────────
  server.tool(
    'get_confidence_accuracy_gap',
    'Analyze the gap between confidence ratings (1-5) and actual accuracy. Identifies overconfidence (high confidence, wrong) and underconfidence (low confidence, correct).',
    {},
    async () => {
      try {
        const { data, error } = await supabase
          .from('question_responses')
          .select('confidence_rating, is_correct, questions(topic, question_type)')
          .not('confidence_rating', 'is', null)
          .not('questions', 'is', null);

        if (error) return errorResult(error.message);
        if (!data || data.length === 0) {
          return textResult({ message: 'No confidence rating data found. Rate your confidence during exams to enable this analysis.' });
        }

        type Row = {
          confidence_rating: number;
          is_correct: boolean | null;
          questions: { topic?: string; question_type: string } | { topic?: string; question_type: string }[] | null;
        };

        const ratingMap = new Map<number, { correct: number; total: number }>();
        const overconfidentTopics = new Map<string, { overconfident: number; total: number }>();
        const underconfidentTopics = new Map<string, { underconfident: number; total: number }>();

        for (const row of data as unknown as Row[]) {
          const rating = row.confidence_rating;
          const correct = row.is_correct ?? false;
          const qObj = Array.isArray(row.questions) ? row.questions[0] : row.questions;
          const topic = qObj?.topic ?? qObj?.question_type ?? 'Unknown';

          const rs = ratingMap.get(rating) ?? { correct: 0, total: 0 };
          rs.total += 1;
          if (correct) rs.correct += 1;
          ratingMap.set(rating, rs);

          // Track overconfidence: rating >= 4 but wrong
          if (rating >= 4 && !correct) {
            const ts = overconfidentTopics.get(topic) ?? { overconfident: 0, total: 0 };
            ts.overconfident += 1;
            ts.total += 1;
            overconfidentTopics.set(topic, ts);
          }
          // Track underconfidence: rating <= 2 but correct
          if (rating <= 2 && correct) {
            const ts = underconfidentTopics.get(topic) ?? { underconfident: 0, total: 0 };
            ts.underconfident += 1;
            ts.total += 1;
            underconfidentTopics.set(topic, ts);
          }
        }

        const byRating = Array.from(ratingMap.entries())
          .sort((a, b) => a[0] - b[0])
          .map(([rating, v]) => ({
            rating,
            ratingLabel: ['', 'Very Unsure', 'Unsure', 'Neutral', 'Confident', 'Very Confident'][rating] ?? String(rating),
            accuracy: `${toPercent(v.correct, v.total)}%`,
            correctCount: v.correct,
            totalCount: v.total,
          }));

        const topOverconfident = Array.from(overconfidentTopics.entries())
          .sort((a, b) => b[1].overconfident - a[1].overconfident)
          .slice(0, 5)
          .map(([topic, v]) => ({ topic, overconfidentInstances: v.overconfident }));

        const topUnderconfident = Array.from(underconfidentTopics.entries())
          .sort((a, b) => b[1].underconfident - a[1].underconfident)
          .slice(0, 5)
          .map(([topic, v]) => ({ topic, underconfidentInstances: v.underconfident }));

        // Generate insight
        const highConfAccuracy = ratingMap.get(5)
          ? toPercent(ratingMap.get(5)!.correct, ratingMap.get(5)!.total)
          : null;
        const lowConfAccuracy = ratingMap.get(1)
          ? toPercent(ratingMap.get(1)!.correct, ratingMap.get(1)!.total)
          : null;

        let insight = '';
        if (highConfAccuracy !== null && highConfAccuracy < 60) {
          insight = `⚠️ Overconfidence detected: When you feel "Very Confident" (rating 5), your accuracy is only ${highConfAccuracy}%. Be more critical.`;
        } else if (lowConfAccuracy !== null && lowConfAccuracy > 70) {
          insight = `✅ Underconfidence detected: When you feel "Very Unsure" (rating 1), you're still getting ${lowConfAccuracy}% right. Trust yourself more.`;
        } else {
          insight = 'Your confidence ratings are reasonably calibrated.';
        }

        return textResult({ insight, byRating, topOverconfidentTopics: topOverconfident, topUnderconfidentTopics: topUnderconfident });
      } catch (err) {
        return errorResult(String(err));
      }
    }
  );
}
