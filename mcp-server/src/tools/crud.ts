import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { textResult, errorResult } from '../types.js';

export function registerCrudTools(server: McpServer, supabase: SupabaseClient): void {
  // ── update_question_set ──────────────────────────────────────────────────
  server.tool(
    'update_question_set',
    'Update metadata fields of an existing question set (name, section, difficulty range, topics, target, study date). Use get_question_sets to find the set ID first.',
    {
      setId: z.string().uuid().describe('UUID of the question set to update'),
      name: z.string().min(1).optional().describe('New name for the set'),
      section: z.enum(['Quantitative', 'Verbal', 'Data Insights']).optional().describe('GMAT section'),
      difficultyRange: z.string().optional().describe('Difficulty range, e.g. "600-700"'),
      topics: z.string().optional().describe('Comma-separated topics'),
      target: z.string().optional().describe('Target score or description'),
      studyDate: z.string().optional().describe('Study date in YYYY-MM-DD format'),
    },
    async ({ setId, name, section, difficultyRange, topics, target, studyDate }) => {
      try {
        const updates: Record<string, unknown> = {};
        if (name !== undefined) updates.name = name;
        if (section !== undefined) updates.section = section;
        if (difficultyRange !== undefined) updates.difficulty_range = difficultyRange;
        if (topics !== undefined) updates.topics = topics;
        if (target !== undefined) updates.target = target;
        if (studyDate !== undefined) updates.study_date = studyDate;

        if (Object.keys(updates).length === 0) {
          return errorResult('No fields provided to update.');
        }

        const { error } = await supabase.from('question_sets').update(updates).eq('id', setId);
        if (error) return errorResult(error.message);

        return textResult({ success: true, setId, updatedFields: Object.keys(updates), message: `Question set ${setId} updated.` });
      } catch (err) {
        return errorResult(String(err));
      }
    }
  );

  // ── delete_question_set ──────────────────────────────────────────────────
  server.tool(
    'delete_question_set',
    'Permanently delete a question set and all its questions and passages. This cannot be undone. Use get_question_sets to find the set ID first.',
    {
      setId: z.string().uuid().describe('UUID of the question set to delete'),
      confirm: z.literal(true).describe('Must be true to confirm deletion'),
    },
    async ({ setId }) => {
      try {
        const { error } = await supabase.from('question_sets').delete().eq('id', setId);
        if (error) return errorResult(error.message);

        return textResult({ success: true, setId, message: `Question set ${setId} and all associated data deleted.` });
      } catch (err) {
        return errorResult(String(err));
      }
    }
  );

  // ── update_question ──────────────────────────────────────────────────────
  server.tool(
    'update_question',
    'Update fields of a specific question. Provide only the fields you want to change — all others remain unchanged.',
    {
      questionId: z.string().uuid().describe('UUID of the question to update'),
      stem: z.string().optional().describe('New question stem text'),
      difficulty: z.number().optional().describe('New difficulty (GMAT scale, e.g. 650)'),
      questionType: z.string().optional().describe('New question type'),
      topic: z.string().optional().describe('New topic'),
      choiceA: z.string().optional(),
      choiceB: z.string().optional(),
      choiceC: z.string().optional(),
      choiceD: z.string().optional(),
      choiceE: z.string().optional(),
      correctAnswer: z.enum(['A', 'B', 'C', 'D', 'E']).optional().describe('Correct answer for Part 1 (or only part)'),
      correctAnswer2: z.enum(['A', 'B', 'C', 'D', 'E']).optional().describe('Correct answer for Part 2 (Two-Part Analysis only)'),
      twoPartCol1Label: z.string().optional(),
      twoPartCol2Label: z.string().optional(),
      explanation: z.string().optional(),
      statement1: z.string().optional().describe('Statement 1 (Data Sufficiency only)'),
      statement2: z.string().optional().describe('Statement 2 (Data Sufficiency only)'),
      s1Verdict: z.string().optional(),
      s2Verdict: z.string().optional(),
      reasoning: z.string().optional(),
    },
    async ({ questionId, stem, difficulty, questionType, topic, choiceA, choiceB, choiceC, choiceD, choiceE, correctAnswer, correctAnswer2, twoPartCol1Label, twoPartCol2Label, explanation, statement1, statement2, s1Verdict, s2Verdict, reasoning }) => {
      try {
        const updates: Record<string, unknown> = {};
        if (stem !== undefined) updates.stem = stem;
        if (difficulty !== undefined) updates.difficulty = difficulty;
        if (questionType !== undefined) updates.question_type = questionType;
        if (topic !== undefined) updates.topic = topic;
        if (choiceA !== undefined) updates.choice_a = choiceA;
        if (choiceB !== undefined) updates.choice_b = choiceB;
        if (choiceC !== undefined) updates.choice_c = choiceC;
        if (choiceD !== undefined) updates.choice_d = choiceD;
        if (choiceE !== undefined) updates.choice_e = choiceE;
        if (correctAnswer !== undefined) updates.correct_answer = correctAnswer;
        if (correctAnswer2 !== undefined) updates.correct_answer2 = correctAnswer2;
        if (twoPartCol1Label !== undefined) updates.two_part_col1_label = twoPartCol1Label;
        if (twoPartCol2Label !== undefined) updates.two_part_col2_label = twoPartCol2Label;
        if (explanation !== undefined) updates.explanation = explanation;
        if (statement1 !== undefined) updates.statement1 = statement1;
        if (statement2 !== undefined) updates.statement2 = statement2;
        if (s1Verdict !== undefined) updates.s1_verdict = s1Verdict;
        if (s2Verdict !== undefined) updates.s2_verdict = s2Verdict;
        if (reasoning !== undefined) updates.reasoning = reasoning;

        if (Object.keys(updates).length === 0) {
          return errorResult('No fields provided to update.');
        }

        const { error } = await supabase.from('questions').update(updates).eq('id', questionId);
        if (error) return errorResult(error.message);

        return textResult({ success: true, questionId, updatedFields: Object.keys(updates), message: `Question ${questionId} updated.` });
      } catch (err) {
        return errorResult(String(err));
      }
    }
  );

  // ── delete_question ──────────────────────────────────────────────────────
  server.tool(
    'delete_question',
    "Permanently delete a single question from a set. The set's total_questions count will be decremented automatically.",
    {
      questionId: z.string().uuid().describe('UUID of the question to delete'),
      confirm: z.literal(true).describe('Must be true to confirm deletion'),
    },
    async ({ questionId }) => {
      try {
        const { data: qData } = await supabase
          .from('questions')
          .select('set_id')
          .eq('id', questionId)
          .single();

        const { error } = await supabase.from('questions').delete().eq('id', questionId);
        if (error) return errorResult(error.message);

        if (qData?.set_id) {
          const { count } = await supabase
            .from('questions')
            .select('id', { count: 'exact' })
            .eq('set_id', qData.set_id);
          if (count !== null) {
            await supabase.from('question_sets').update({ total_questions: count }).eq('id', qData.set_id);
          }
        }

        return textResult({ success: true, questionId, message: `Question ${questionId} deleted.` });
      } catch (err) {
        return errorResult(String(err));
      }
    }
  );
}
