import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { toPercent, textResult, errorResult, SECTION_TO_QUESTION_TYPES } from '../types.js';

export function registerTopicsTools(server: McpServer, supabase: SupabaseClient): void {
  // ── get_weak_topics ──────────────────────────────────────────────────────
  server.tool(
    'get_weak_topics',
    'Get the topics and question types where the user performs worst (lowest accuracy). Optionally filter by section (quant, verbal, di).',
    {
      section: z.enum(['quant', 'verbal', 'di']).optional().describe('Filter results to a specific GMAT section'),
      limit: z.number().int().min(1).max(50).optional().default(10).describe('Number of weak topics to return (default 10)'),
    },
    async ({ section, limit }) => {
      try {
        // Join question_responses with questions to get topic and question_type
        const { data, error } = await supabase
          .from('question_responses')
          .select('is_correct, time_spent_seconds, created_at, questions(topic, question_type, difficulty)')
          .not('questions', 'is', null);

        if (error) return errorResult(error.message);
        if (!data || data.length === 0) return textResult({ message: 'No response data found.', topics: [] });

        type TopicStats = {
          correct: number;
          total: number;
          lastPracticed: string;
        };

        const topicMap = new Map<string, TopicStats>();

        const allowedTypes = section ? SECTION_TO_QUESTION_TYPES[section] : null;

        for (const row of data) {
          const q = row as { is_correct: boolean | null; created_at: string; questions: { topic?: string; question_type?: string; difficulty?: number } | null };
          if (!q.questions) continue;
          const questionType = q.questions.question_type ?? 'Unknown';
          const topic = q.questions.topic ?? 'Unknown';

          // Filter by section if provided
          if (allowedTypes && !allowedTypes.includes(questionType)) continue;

          const key = `${questionType}::${topic}`;
          const existing = topicMap.get(key) ?? { correct: 0, total: 0, lastPracticed: '' };
          existing.total += 1;
          if (q.is_correct) existing.correct += 1;
          if (!existing.lastPracticed || q.created_at > existing.lastPracticed) {
            existing.lastPracticed = q.created_at;
          }
          topicMap.set(key, existing);
        }

        const results = Array.from(topicMap.entries())
          .filter(([, v]) => v.total >= 2) // need at least 2 attempts to be meaningful
          .map(([key, v]) => {
            const [questionType, topic] = key.split('::');
            return {
              topic,
              questionType,
              accuracy: toPercent(v.correct, v.total),
              correctCount: v.correct,
              totalAttempts: v.total,
              lastPracticed: v.lastPracticed,
            };
          })
          .sort((a, b) => a.accuracy - b.accuracy) // lowest accuracy first
          .slice(0, limit ?? 10);

        return textResult({
          section: section ?? 'all',
          count: results.length,
          weakTopics: results,
        });
      } catch (err) {
        return errorResult(String(err));
      }
    }
  );

  // ── get_error_patterns ───────────────────────────────────────────────────
  server.tool(
    'get_error_patterns',
    'Get categorized error patterns (Content/Process/Habit) from wrong answers where the user tagged an error category. Includes user notes for review.',
    {
      category: z.enum(['Content', 'Process', 'Habit']).optional().describe("Filter by error category: 'Content' = knowledge gap, 'Process' = wrong approach, 'Habit' = careless mistake"),
    },
    async ({ category }) => {
      try {
        let query = supabase
          .from('question_responses')
          .select('error_category, note, created_at, questions(topic, question_type)')
          .eq('is_correct', false)
          .not('error_category', 'is', null);

        if (category) query = query.eq('error_category', category);

        const { data, error } = await query;
        if (error) return errorResult(error.message);
        if (!data || data.length === 0) {
          return textResult({ message: 'No tagged error patterns found.', patterns: [] });
        }

        type PatternKey = string;
        type PatternStats = {
          category: string;
          topic: string;
          questionType: string;
          count: number;
          notes: string[];
          lastOccurred: string;
        };

        const patternMap = new Map<PatternKey, PatternStats>();

        for (const row of data) {
          const r = row as {
            error_category: string;
            note?: string;
            created_at: string;
            questions: { topic?: string; question_type?: string } | null;
          };
          const cat = r.error_category;
          const topic = r.questions?.topic ?? 'Unknown';
          const qType = r.questions?.question_type ?? 'Unknown';
          const key = `${cat}::${qType}::${topic}`;

          const existing = patternMap.get(key) ?? {
            category: cat,
            topic,
            questionType: qType,
            count: 0,
            notes: [],
            lastOccurred: '',
          };
          existing.count += 1;
          if (r.note) existing.notes.push(r.note);
          if (!existing.lastOccurred || r.created_at > existing.lastOccurred) {
            existing.lastOccurred = r.created_at;
          }
          patternMap.set(key, existing);
        }

        const patterns = Array.from(patternMap.values())
          .sort((a, b) => b.count - a.count);

        const summary = {
          Content: patterns.filter(p => p.category === 'Content').length,
          Process: patterns.filter(p => p.category === 'Process').length,
          Habit: patterns.filter(p => p.category === 'Habit').length,
        };

        return textResult({
          filterCategory: category ?? 'all',
          totalPatterns: patterns.length,
          summary,
          patterns,
        });
      } catch (err) {
        return errorResult(String(err));
      }
    }
  );
}
