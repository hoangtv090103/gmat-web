import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SupabaseClient } from '@supabase/supabase-js';
import { toPercent, textResult, errorResult, QUESTION_TIME_TARGETS, SECTION_TO_QUESTION_TYPES } from '../types.js';

export function registerRecommendTools(server: McpServer, supabase: SupabaseClient): void {
  server.tool(
    'recommend_practice',
    'Generate a prioritized practice recommendation and study plan based on all historical performance data. Combines weak topics, timing issues, readiness scores, and recency.',
    {},
    async () => {
      try {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        // Pull all responses with question info
        const { data: responses, error } = await supabase
          .from('question_responses')
          .select('is_correct, time_spent_seconds, created_at, error_category, questions(topic, question_type)')
          .not('questions', 'is', null);

        if (error) return errorResult(error.message);
        if (!responses || responses.length === 0) {
          return textResult({
            message: 'No practice data found yet. Complete some exams first to get recommendations.',
          });
        }

        type Row = {
          is_correct: boolean | null;
          time_spent_seconds: number;
          created_at: string;
          error_category: string | null;
          questions: { topic?: string; question_type: string } | { topic?: string; question_type: string }[] | null;
        };

        // Build per-topic stats
        type TopicStats = {
          questionType: string;
          topic: string;
          section: string;
          correct: number;
          total: number;
          withinTime: number;
          lastPracticed: string;
          errorCategories: Record<string, number>;
        };

        const topicMap = new Map<string, TopicStats>();

        for (const row of responses as unknown as Row[]) {
          if (!row.questions) continue;
          const qObj = Array.isArray(row.questions) ? row.questions[0] : row.questions;
          if (!qObj) continue;
          const qType = qObj.question_type;
          const topic = qObj.topic ?? qType;

          // Map to section
          let section = 'unknown';
          for (const [sec, types] of Object.entries(SECTION_TO_QUESTION_TYPES)) {
            if (types.includes(qType)) { section = sec; break; }
          }

          const key = `${section}::${qType}::${topic}`;
          const existing = topicMap.get(key) ?? {
            questionType: qType, topic, section, correct: 0, total: 0,
            withinTime: 0, lastPracticed: '', errorCategories: {},
          };

          existing.total += 1;
          if (row.is_correct) existing.correct += 1;
          const target = QUESTION_TIME_TARGETS[qType] ?? 120;
          if (row.time_spent_seconds <= target) existing.withinTime += 1;
          if (!existing.lastPracticed || row.created_at > existing.lastPracticed) {
            existing.lastPracticed = row.created_at;
          }
          if (row.error_category) {
            existing.errorCategories[row.error_category] = (existing.errorCategories[row.error_category] ?? 0) + 1;
          }
          topicMap.set(key, existing);
        }

        // Score each topic for priority (lower = higher priority)
        const prioritized = Array.from(topicMap.values())
          .filter(t => t.total >= 3)
          .map(t => {
            const accuracy = toPercent(t.correct, t.total);
            const timingAccuracy = toPercent(t.withinTime, t.total);
            const daysSince = t.lastPracticed
              ? Math.floor((Date.now() - new Date(t.lastPracticed).getTime()) / (1000 * 60 * 60 * 24))
              : 999;

            // Priority score: lower accuracy → higher priority; not practiced recently → higher priority
            const priorityScore = (100 - accuracy) * 0.6
              + (100 - timingAccuracy) * 0.2
              + Math.min(daysSince, 30) * 0.67; // 30 days → +20 points

            const dominantError = Object.entries(t.errorCategories).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

            return {
              section: t.section,
              questionType: t.questionType,
              topic: t.questionType === (Array.from(topicMap.keys()).find(k => k.includes(t.questionType)) ?? '') ? t.questionType : t.topic ?? t.questionType,
              accuracy,
              timingAccuracy,
              totalAttempts: t.total,
              daysSinceLastPractice: daysSince,
              dominantErrorCategory: dominantError,
              priorityScore: Math.round(priorityScore),
            };
          })
          .sort((a, b) => b.priorityScore - a.priorityScore)
          .slice(0, 10);

        // Build study plan text
        const top3 = prioritized.slice(0, 3);
        const sectionReadiness: Record<string, { correct: number; total: number }> = {
          quant: { correct: 0, total: 0 },
          verbal: { correct: 0, total: 0 },
          di: { correct: 0, total: 0 },
        };

        for (const row of responses as unknown as Row[]) {
          if (!row.questions) continue;
          const qObj = Array.isArray(row.questions) ? row.questions[0] : row.questions;
          if (!qObj) continue;
          for (const [sec, types] of Object.entries(SECTION_TO_QUESTION_TYPES)) {
            if (types.includes(qObj.question_type) && sec in sectionReadiness) {
              sectionReadiness[sec].total += 1;
              if (row.is_correct) sectionReadiness[sec].correct += 1;
            }
          }
        }

        const weakestSection = Object.entries(sectionReadiness)
          .filter(([, v]) => v.total > 0)
          .sort((a, b) => toPercent(a[1].correct, a[1].total) - toPercent(b[1].correct, b[1].total))[0];

        const studyPlan = [
          `## Today's GMAT Study Plan`,
          ``,
          `### Priority Focus`,
          ...top3.map((t, i) => `${i + 1}. **${t.questionType} — ${t.topic}** (${t.section.toUpperCase()}) — accuracy: ${t.accuracy}%, last practiced: ${t.daysSinceLastPractice === 999 ? 'never' : `${t.daysSinceLastPractice} days ago`}`),
          ``,
          `### Weakest Section`,
          weakestSection
            ? `Focus most time on **${weakestSection[0].toUpperCase()}** — current accuracy: ${toPercent(weakestSection[1].correct, weakestSection[1].total)}%`
            : 'Not enough data yet.',
          ``,
          `### Recommendations`,
          top3[0] ? `- Do a targeted set on "${top3[0].questionType}" topics` : '',
          top3[0]?.dominantErrorCategory === 'Content' ? '- Study the underlying concept — this is a knowledge gap' : '',
          top3[0]?.dominantErrorCategory === 'Process' ? '- Practice the systematic approach — you know the content but make process errors' : '',
          top3[0]?.dominantErrorCategory === 'Habit' ? '- Slow down and read carefully — careless mistakes are costing points' : '',
        ].filter(Boolean).join('\n');

        const priorityList = prioritized.map((t, i) => ({
          rank: i + 1,
          section: t.section,
          questionType: t.questionType,
          topic: t.topic,
          accuracy: `${t.accuracy}%`,
          timingAccuracy: `${t.timingAccuracy}%`,
          daysSinceLastPractice: t.daysSinceLastPractice === 999 ? 'never' : t.daysSinceLastPractice,
          dominantError: t.dominantErrorCategory,
          estimatedImpact: t.priorityScore > 80 ? 'High' : t.priorityScore > 50 ? 'Medium' : 'Low',
        }));

        return textResult({ studyPlan, priorityList });
      } catch (err) {
        return errorResult(String(err));
      }
    }
  );
}
