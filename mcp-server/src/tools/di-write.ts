import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { textResult, errorResult } from '../types.js';

// ── Shared DI question row builder ────────────────────────────────────────────

function buildDIQuestionRow(
  q: {
    questionNumber: number;
    stem: string;
    choiceA: string;
    choiceB: string;
    choiceC?: string;
    choiceD?: string;
    choiceE?: string;
    correctAnswer: string;
    correctAnswer2?: string;
    twoPartCol1Label?: string;
    twoPartCol2Label?: string;
    explanation?: string;
    difficulty?: number;
    topic?: string;
    questionType: string;
  },
  setId: string,
  passageId?: string,
  passageGroupId?: string
): Record<string, unknown> {
  return {
    set_id: setId,
    question_number: q.questionNumber,
    question_type: q.questionType,
    difficulty: q.difficulty ?? null,
    topic: q.topic ?? null,
    stem: q.stem,
    choice_a: q.choiceA,
    choice_b: q.choiceB,
    choice_c: q.choiceC ?? '',
    choice_d: q.choiceD ?? '',
    choice_e: q.choiceE ?? '',
    correct_answer: q.correctAnswer,
    correct_answer2: q.correctAnswer2 ?? null,
    two_part_col1_label: q.twoPartCol1Label ?? null,
    two_part_col2_label: q.twoPartCol2Label ?? null,
    explanation: q.explanation ?? null,
    passage_id: passageId ?? null,
    passage_group_id: passageGroupId ?? null,
  };
}

// ── Shared question schema for A-E questions (Table Analysis, MSR, Graphics) ─

const StandardDIQuestionSchema = z.object({
  questionNumber: z.number().int().min(1),
  stem: z.string().min(1).describe('The question stem text'),
  choiceA: z.string().describe('Answer choice A'),
  choiceB: z.string().describe('Answer choice B'),
  choiceC: z.string().optional().describe('Answer choice C'),
  choiceD: z.string().optional().describe('Answer choice D'),
  choiceE: z.string().optional().describe('Answer choice E'),
  correctAnswer: z.enum(['A', 'B', 'C', 'D', 'E']).describe('Correct answer letter'),
  explanation: z.string().optional(),
  difficulty: z.number().optional(),
  topic: z.string().optional(),
});

export function registerDIWriteTools(server: McpServer, supabase: SupabaseClient): void {

  // ── create_two_part_set ──────────────────────────────────────────────────
  server.tool(
    'create_two_part_set',
    'Create a Two-Part Analysis question set for the GMAT Data Insights section. ' +
    'Each question has 5 rows (answer choices A-E) and 2 columns (Part 1 and Part 2). ' +
    'The user selects one row for Part 1 and one row for Part 2. Both can select the same row. ' +
    'Both parts must be correct for the question to be marked correct.',
    {
      name: z.string().min(1).describe('Name for the question set'),
      difficultyRange: z.string().optional().describe('e.g. "600-700" or "700+"'),
      topic: z.string().optional().describe('Topic(s) covered'),
      studyDate: z.string().optional().describe('Study date in YYYY-MM-DD format'),
      questions: z.array(z.object({
        questionNumber: z.number().int().min(1),
        stem: z.string().min(1).describe('The scenario/question text'),
        col1Label: z.string().min(1).describe('Column 1 header, e.g. "The argument assumes that..." or "Team X wins"'),
        col2Label: z.string().min(1).describe('Column 2 header, e.g. "The argument requires..." or "Team Y wins"'),
        choiceA: z.string().describe('Row A text'),
        choiceB: z.string().describe('Row B text'),
        choiceC: z.string().describe('Row C text'),
        choiceD: z.string().describe('Row D text'),
        choiceE: z.string().optional().describe('Row E text (optional)'),
        correctAnswer: z.enum(['A', 'B', 'C', 'D', 'E']).describe('Correct row for Part 1'),
        correctAnswer2: z.enum(['A', 'B', 'C', 'D', 'E']).describe('Correct row for Part 2 (can be same as Part 1)'),
        explanation: z.string().optional(),
        difficulty: z.number().optional(),
        topic: z.string().optional(),
      })).min(1),
    },
    async ({ name, difficultyRange, topic, studyDate, questions }) => {
      try {
        const { data: setData, error: setErr } = await supabase
          .from('question_sets')
          .insert({
            name,
            section: 'Data Insights',
            difficulty_range: difficultyRange ?? null,
            topics: topic ?? 'Two-Part Analysis',
            total_questions: 0,
            source_filename: 'claude-generated',
            study_date: studyDate ?? null,
          })
          .select('id')
          .single();

        if (setErr) return errorResult(`Failed to create question set: ${setErr.message}`);
        const setId = setData.id as string;

        try {
          const rows = questions.map(q =>
            buildDIQuestionRow(
              {
                questionNumber: q.questionNumber,
                stem: q.stem,
                choiceA: q.choiceA,
                choiceB: q.choiceB,
                choiceC: q.choiceC,
                choiceD: q.choiceD,
                choiceE: q.choiceE,
                correctAnswer: q.correctAnswer,
                correctAnswer2: q.correctAnswer2,
                twoPartCol1Label: q.col1Label,
                twoPartCol2Label: q.col2Label,
                explanation: q.explanation,
                difficulty: q.difficulty,
                topic: q.topic,
                questionType: 'Two-Part Analysis',
              },
              setId
            )
          );

          const { error: qErr } = await supabase.from('questions').insert(rows);
          if (qErr) throw new Error(`Failed to insert questions: ${qErr.message}`);

          await supabase.from('question_sets').update({ total_questions: rows.length }).eq('id', setId);

          return textResult({
            success: true,
            setId,
            setName: name,
            questionCount: rows.length,
            message: `Two-Part Analysis set "${name}" created with ${rows.length} question(s). Set ID: ${setId}`,
          });
        } catch (innerErr) {
          await supabase.from('question_sets').delete().eq('id', setId);
          return errorResult(String(innerErr));
        }
      } catch (err) {
        return errorResult(String(err));
      }
    }
  );

  // ── create_table_analysis_set ────────────────────────────────────────────
  server.tool(
    'create_table_analysis_set',
    'Create a Table Analysis question set for the GMAT Data Insights section. ' +
    'The set has one data table (provided as a Markdown table string) and multiple True/False questions. ' +
    'All questions reference the same table. Each question asks whether a statement about the table is True or False. ' +
    'choice_a = "True", choice_b = "False". correctAnswer is "A" for True, "B" for False.',
    {
      name: z.string().min(1).describe('Name for the question set'),
      tableMarkdown: z.string().min(10).describe(
        'The data table in Markdown format. Example:\n' +
        '| Company | Revenue | Employees |\n|---|---|---|\n| Acme | 500M | 1200 |\n| Beta | 320M | 800 |'
      ),
      difficultyRange: z.string().optional(),
      topic: z.string().optional(),
      studyDate: z.string().optional(),
      questions: z.array(z.object({
        questionNumber: z.number().int().min(1),
        stem: z.string().min(1).describe('The statement to evaluate as True or False, e.g. "Acme has the highest revenue per employee."'),
        correctAnswer: z.enum(['A', 'B']).describe('"A" = True, "B" = False'),
        explanation: z.string().optional().describe('Why the statement is true or false'),
        difficulty: z.number().optional(),
        topic: z.string().optional(),
      })).min(1),
    },
    async ({ name, tableMarkdown, difficultyRange, topic, studyDate, questions }) => {
      try {
        const { data: setData, error: setErr } = await supabase
          .from('question_sets')
          .insert({
            name,
            section: 'Data Insights',
            difficulty_range: difficultyRange ?? null,
            topics: topic ?? 'Table Analysis',
            total_questions: 0,
            source_filename: 'claude-generated',
            study_date: studyDate ?? null,
          })
          .select('id')
          .single();

        if (setErr) return errorResult(`Failed to create question set: ${setErr.message}`);
        const setId = setData.id as string;

        try {
          // Insert the table as a single passage
          const { data: pData, error: pErr } = await supabase
            .from('passages')
            .insert({ set_id: setId, passage_text: tableMarkdown, passage_type: 'table_markdown' })
            .select('id')
            .single();

          if (pErr) throw new Error(`Failed to insert table passage: ${pErr.message}`);
          const passageId = pData.id as string;

          const rows = questions.map(q =>
            buildDIQuestionRow(
              {
                questionNumber: q.questionNumber,
                stem: q.stem,
                choiceA: 'True',
                choiceB: 'False',
                correctAnswer: q.correctAnswer,
                explanation: q.explanation,
                difficulty: q.difficulty,
                topic: q.topic,
                questionType: 'Table Analysis',
              },
              setId,
              passageId
            )
          );

          const { error: qErr } = await supabase.from('questions').insert(rows);
          if (qErr) throw new Error(`Failed to insert questions: ${qErr.message}`);

          await supabase.from('question_sets').update({ total_questions: rows.length }).eq('id', setId);

          return textResult({
            success: true,
            setId,
            passageId,
            setName: name,
            questionCount: rows.length,
            message: `Table Analysis set "${name}" created with ${rows.length} True/False question(s). Set ID: ${setId}`,
          });
        } catch (innerErr) {
          await supabase.from('question_sets').delete().eq('id', setId);
          return errorResult(String(innerErr));
        }
      } catch (err) {
        return errorResult(String(err));
      }
    }
  );

  // ── create_multi_source_set ──────────────────────────────────────────────
  server.tool(
    'create_multi_source_set',
    'Create a Multi-Source Reasoning question set for the GMAT Data Insights section. ' +
    'Provide 2-4 source tabs (text or table) and multiple questions that reference them. ' +
    'All questions are linked to all sources via a shared passage_group_id. ' +
    'Questions use standard A-E choices.',
    {
      name: z.string().min(1),
      difficultyRange: z.string().optional(),
      topic: z.string().optional(),
      studyDate: z.string().optional(),
      sources: z.array(z.object({
        tabLabel: z.string().min(1).describe('Tab display name, e.g. "Email", "Press Release", "Financial Table"'),
        passageType: z.enum(['text', 'table_markdown']).describe('"text" for prose, "table_markdown" for a Markdown table'),
        passageText: z.string().min(1).describe('Full content of this source tab'),
      })).min(2).max(4).describe('2 to 4 source tabs for this question set'),
      questions: z.array(StandardDIQuestionSchema.extend({
        questionType: z.string().optional().describe('Defaults to "Multi-Source Reasoning"'),
      })).min(1),
    },
    async ({ name, difficultyRange, topic, studyDate, sources, questions }) => {
      try {
        const { data: setData, error: setErr } = await supabase
          .from('question_sets')
          .insert({
            name,
            section: 'Data Insights',
            difficulty_range: difficultyRange ?? null,
            topics: topic ?? 'Multi-Source Reasoning',
            total_questions: 0,
            source_filename: 'claude-generated',
            study_date: studyDate ?? null,
          })
          .select('id')
          .single();

        if (setErr) return errorResult(`Failed to create question set: ${setErr.message}`);
        const setId = setData.id as string;

        try {
          // Generate a shared group UUID for all passages
          const passageGroupId: string = crypto.randomUUID();

          // Insert all source passages with the group id
          const passageRows = sources.map(s => ({
            set_id: setId,
            passage_text: s.passageText,
            passage_type: s.passageType,
            tab_label: s.tabLabel,
            passage_group_id: passageGroupId,
          }));

          const { error: pErr } = await supabase.from('passages').insert(passageRows);
          if (pErr) throw new Error(`Failed to insert source passages: ${pErr.message}`);

          // Insert questions linked to the group (not individual passages)
          const rows = questions.map(q =>
            buildDIQuestionRow(
              {
                questionNumber: q.questionNumber,
                stem: q.stem,
                choiceA: q.choiceA,
                choiceB: q.choiceB,
                choiceC: q.choiceC,
                choiceD: q.choiceD,
                choiceE: q.choiceE,
                correctAnswer: q.correctAnswer,
                explanation: q.explanation,
                difficulty: q.difficulty,
                topic: q.topic,
                questionType: q.questionType ?? 'Multi-Source Reasoning',
              },
              setId,
              undefined,
              passageGroupId
            )
          );

          const { error: qErr } = await supabase.from('questions').insert(rows);
          if (qErr) throw new Error(`Failed to insert questions: ${qErr.message}`);

          await supabase.from('question_sets').update({ total_questions: rows.length }).eq('id', setId);

          return textResult({
            success: true,
            setId,
            passageGroupId,
            sourceCount: sources.length,
            setName: name,
            questionCount: rows.length,
            message: `Multi-Source Reasoning set "${name}" created: ${sources.length} sources, ${rows.length} question(s). Set ID: ${setId}`,
          });
        } catch (innerErr) {
          await supabase.from('question_sets').delete().eq('id', setId);
          return errorResult(String(innerErr));
        }
      } catch (err) {
        return errorResult(String(err));
      }
    }
  );

  // ── create_graphics_set ──────────────────────────────────────────────────
  server.tool(
    'create_graphics_set',
    'Create a Graphics Interpretation question set for the GMAT Data Insights section. ' +
    'Provide an image URL (chart, graph, or diagram) and multiple A-E questions about it. ' +
    'All questions reference the same image. The image URL is stored as the passage_text with passage_type="image_url".',
    {
      name: z.string().min(1),
      imageUrl: z.string().url().describe('URL to the chart/graph/diagram image (must be publicly accessible)'),
      imageDescription: z.string().optional().describe('Optional alt-text description of the image for context'),
      difficultyRange: z.string().optional(),
      topic: z.string().optional(),
      studyDate: z.string().optional(),
      questions: z.array(StandardDIQuestionSchema).min(1),
    },
    async ({ name, imageUrl, imageDescription, difficultyRange, topic, studyDate, questions }) => {
      try {
        const { data: setData, error: setErr } = await supabase
          .from('question_sets')
          .insert({
            name,
            section: 'Data Insights',
            difficulty_range: difficultyRange ?? null,
            topics: topic ?? 'Graphics Interpretation',
            total_questions: 0,
            source_filename: 'claude-generated',
            study_date: studyDate ?? null,
          })
          .select('id')
          .single();

        if (setErr) return errorResult(`Failed to create question set: ${setErr.message}`);
        const setId = setData.id as string;

        try {
          // Insert image URL as passage
          const { data: pData, error: pErr } = await supabase
            .from('passages')
            .insert({
              set_id: setId,
              passage_text: imageUrl,
              passage_type: 'image_url',
              tab_label: imageDescription ?? null,
            })
            .select('id')
            .single();

          if (pErr) throw new Error(`Failed to insert image passage: ${pErr.message}`);
          const passageId = pData.id as string;

          const rows = questions.map(q =>
            buildDIQuestionRow(
              {
                questionNumber: q.questionNumber,
                stem: q.stem,
                choiceA: q.choiceA,
                choiceB: q.choiceB,
                choiceC: q.choiceC,
                choiceD: q.choiceD,
                choiceE: q.choiceE,
                correctAnswer: q.correctAnswer,
                explanation: q.explanation,
                difficulty: q.difficulty,
                topic: q.topic,
                questionType: 'Graphics Interpretation',
              },
              setId,
              passageId
            )
          );

          const { error: qErr } = await supabase.from('questions').insert(rows);
          if (qErr) throw new Error(`Failed to insert questions: ${qErr.message}`);

          await supabase.from('question_sets').update({ total_questions: rows.length }).eq('id', setId);

          return textResult({
            success: true,
            setId,
            passageId,
            imageUrl,
            setName: name,
            questionCount: rows.length,
            message: `Graphics Interpretation set "${name}" created with ${rows.length} question(s). Set ID: ${setId}`,
          });
        } catch (innerErr) {
          await supabase.from('question_sets').delete().eq('id', setId);
          return errorResult(String(innerErr));
        }
      } catch (err) {
        return errorResult(String(err));
      }
    }
  );

  // ── create_di_set ────────────────────────────────────────────────────────
  server.tool(
    'create_di_set',
    'Create an empty Data Insights question set. Returns a setId to use with add_di_question. ' +
    'Use this when you want to build a mixed DI set (e.g. Two-Part + Table Analysis + MSR in one set). ' +
    'For a pure single-type set, prefer the dedicated create_*_set tools.',
    {
      name: z.string().min(1).describe('Name for the question set'),
      difficultyRange: z.string().optional().describe('e.g. "600-700" or "700+"'),
      topics: z.string().optional().describe('Comma-separated topics, e.g. "Two-Part Analysis, Table Analysis"'),
      studyDate: z.string().optional().describe('Study date in YYYY-MM-DD format'),
    },
    async ({ name, difficultyRange, topics, studyDate }) => {
      try {
        const { data, error } = await supabase
          .from('question_sets')
          .insert({
            name,
            section: 'Data Insights',
            difficulty_range: difficultyRange ?? null,
            topics: topics ?? 'Data Insights',
            total_questions: 0,
            source_filename: 'claude-generated',
            study_date: studyDate ?? null,
          })
          .select('id')
          .single();

        if (error) return errorResult(`Failed to create question set: ${error.message}`);

        return textResult({
          success: true,
          setId: data.id,
          setName: name,
          message: `Empty DI set "${name}" created. Set ID: ${data.id}. Now call add_di_question with this setId to add questions.`,
        });
      } catch (err) {
        return errorResult(String(err));
      }
    }
  );

  // ── add_di_question ──────────────────────────────────────────────────────
  server.tool(
    'add_di_question',
    'Add a single Data Insights question to an existing question set. ' +
    'Supports all 4 DI types: Two-Part Analysis, Table Analysis, Multi-Source Reasoning, Graphics Interpretation. ' +
    'For Table Analysis: provide tableMarkdown to create a new passage, or passageId to reuse an existing one. ' +
    'For Multi-Source Reasoning: provide sources[] to create a new group, or passageGroupId to reuse an existing group (for questions sharing the same sources). ' +
    'For Graphics Interpretation: provide imageUrl to create a new image passage, or passageId to reuse. ' +
    'Returns questionId, passageId, and passageGroupId — save these to reuse passages for subsequent related questions.',
    {
      setId: z.string().uuid().describe('UUID of the question set (from create_di_set or get_question_sets)'),
      questionType: z.enum([
        'Two-Part Analysis',
        'Table Analysis',
        'Multi-Source Reasoning',
        'Graphics Interpretation',
      ]),
      stem: z.string().min(1).describe('Question stem text'),
      difficulty: z.number().optional().describe('GMAT difficulty, e.g. 650'),
      topic: z.string().optional(),
      explanation: z.string().optional(),
      questionNumber: z.number().int().min(1).optional().describe('Position in set. Auto-computed if omitted.'),

      // ── Two-Part specific ──
      col1Label: z.string().optional().describe('[Two-Part] Column 1 header, e.g. "Team X wins"'),
      col2Label: z.string().optional().describe('[Two-Part] Column 2 header, e.g. "Team Y wins"'),
      correctAnswer2: z.enum(['A', 'B', 'C', 'D', 'E']).optional().describe('[Two-Part] Correct row for Part 2'),

      // ── Shared A-E choices (Two-Part rows, MSR, Graphics) ──
      choiceA: z.string().optional().describe('Answer choice A (or row A for Two-Part)'),
      choiceB: z.string().optional().describe('Answer choice B (or row B for Two-Part)'),
      choiceC: z.string().optional(),
      choiceD: z.string().optional(),
      choiceE: z.string().optional(),
      correctAnswer: z.enum(['A', 'B', 'C', 'D', 'E']).optional().describe('Correct answer (for Table Analysis: A=True, B=False)'),

      // ── Table Analysis / Graphics: passage ──
      tableMarkdown: z.string().optional().describe('[Table Analysis] Markdown table string — creates a new table passage'),
      imageUrl: z.string().url().optional().describe('[Graphics] Image URL — creates a new image passage'),
      passageId: z.string().uuid().optional().describe('[Table Analysis / Graphics] Reuse an existing passage ID'),

      // ── Multi-Source Reasoning: source group ──
      sources: z.array(z.object({
        tabLabel: z.string().min(1).describe('Tab name, e.g. "Email 1", "Financial Table"'),
        passageType: z.enum(['text', 'table_markdown']),
        passageText: z.string().min(1),
      })).min(2).max(4).optional().describe('[MSR] Source tabs — creates a new passage group. Min 2, max 4.'),
      passageGroupId: z.string().uuid().optional().describe('[MSR] Reuse an existing passage group ID (for questions sharing the same sources)'),
    },
    async (args) => {
      const {
        setId, questionType, stem, difficulty, topic, explanation, questionNumber,
        col1Label, col2Label, correctAnswer2,
        choiceA, choiceB, choiceC, choiceD, choiceE, correctAnswer,
        tableMarkdown, imageUrl, passageId: inputPassageId,
        sources, passageGroupId: inputGroupId,
      } = args;

      try {
        // ── Validate set exists ──
        const { error: setErr } = await supabase
          .from('question_sets').select('id').eq('id', setId).single();
        if (setErr) return errorResult(`Question set not found: ${setId}`);

        // ── Auto-compute question number ──
        let qNum = questionNumber;
        if (!qNum) {
          const { count } = await supabase
            .from('questions').select('id', { count: 'exact' }).eq('set_id', setId);
          qNum = (count ?? 0) + 1;
        }

        let resolvedPassageId: string | undefined;
        let resolvedGroupId: string | undefined;

        // ── Type-specific validation + passage setup ──
        if (questionType === 'Two-Part Analysis') {
          if (!col1Label || !col2Label)
            return errorResult('Two-Part Analysis requires col1Label and col2Label');
          if (!choiceA || !choiceB || !choiceC || !choiceD)
            return errorResult('Two-Part Analysis requires choiceA, choiceB, choiceC, choiceD');
          if (!correctAnswer || !correctAnswer2)
            return errorResult('Two-Part Analysis requires correctAnswer (Part 1) and correctAnswer2 (Part 2)');

        } else if (questionType === 'Table Analysis') {
          if (inputPassageId) {
            resolvedPassageId = inputPassageId;
          } else if (tableMarkdown) {
            const { data: pData, error: pErr } = await supabase
              .from('passages')
              .insert({ set_id: setId, passage_text: tableMarkdown, passage_type: 'table_markdown' })
              .select('id').single();
            if (pErr) return errorResult(`Failed to create table passage: ${pErr.message}`);
            resolvedPassageId = pData.id as string;
          } else {
            return errorResult('Table Analysis requires tableMarkdown (new) or passageId (reuse)');
          }
          if (!correctAnswer || !['A', 'B'].includes(correctAnswer))
            return errorResult('Table Analysis requires correctAnswer: "A" (True) or "B" (False)');

        } else if (questionType === 'Multi-Source Reasoning') {
          if (inputGroupId) {
            resolvedGroupId = inputGroupId;
          } else if (sources && sources.length >= 2) {
            resolvedGroupId = crypto.randomUUID();
            const passageRows = sources.map(s => ({
              set_id: setId,
              passage_text: s.passageText,
              passage_type: s.passageType,
              tab_label: s.tabLabel,
              passage_group_id: resolvedGroupId,
            }));
            const { error: pErr } = await supabase.from('passages').insert(passageRows);
            if (pErr) return errorResult(`Failed to create source passages: ${pErr.message}`);
          } else {
            return errorResult('Multi-Source Reasoning requires sources[] (min 2, to create new group) or passageGroupId (to reuse existing group)');
          }
          if (!choiceA || !choiceB || !correctAnswer)
            return errorResult('Multi-Source Reasoning requires choiceA, choiceB, and correctAnswer');

        } else if (questionType === 'Graphics Interpretation') {
          if (inputPassageId) {
            resolvedPassageId = inputPassageId;
          } else if (imageUrl) {
            const { data: pData, error: pErr } = await supabase
              .from('passages')
              .insert({ set_id: setId, passage_text: imageUrl, passage_type: 'image_url' })
              .select('id').single();
            if (pErr) return errorResult(`Failed to create image passage: ${pErr.message}`);
            resolvedPassageId = pData.id as string;
          } else {
            return errorResult('Graphics Interpretation requires imageUrl (new) or passageId (reuse)');
          }
          if (!choiceA || !choiceB || !correctAnswer)
            return errorResult('Graphics Interpretation requires choiceA, choiceB, and correctAnswer');
        }

        // ── Insert question ──
        const questionRow = buildDIQuestionRow(
          {
            questionNumber: qNum!,
            stem,
            choiceA: choiceA ?? 'True',
            choiceB: choiceB ?? 'False',
            choiceC,
            choiceD,
            choiceE,
            correctAnswer: correctAnswer ?? 'A',
            correctAnswer2,
            twoPartCol1Label: col1Label,
            twoPartCol2Label: col2Label,
            explanation,
            difficulty,
            topic,
            questionType,
          },
          setId,
          resolvedPassageId,
          resolvedGroupId
        );

        const { data: qData, error: qErr } = await supabase
          .from('questions').insert(questionRow).select('id').single();
        if (qErr) return errorResult(`Failed to insert question: ${qErr.message}`);

        // ── Update total_questions ──
        const { count } = await supabase
          .from('questions').select('id', { count: 'exact' }).eq('set_id', setId);
        if (count !== null) {
          await supabase.from('question_sets').update({ total_questions: count }).eq('id', setId);
        }

        const hints: string[] = [];
        if (resolvedPassageId) hints.push(`passageId: ${resolvedPassageId} (reuse for related questions)`);
        if (resolvedGroupId) hints.push(`passageGroupId: ${resolvedGroupId} (reuse for questions sharing these sources)`);

        return textResult({
          success: true,
          questionId: qData.id,
          setId,
          questionNumber: qNum,
          questionType,
          passageId: resolvedPassageId ?? null,
          passageGroupId: resolvedGroupId ?? null,
          message: `${questionType} question #${qNum} added. Question ID: ${qData.id}${hints.length ? '. ' + hints.join('. ') : ''}`,
        });
      } catch (err) {
        return errorResult(String(err));
      }
    }
  );
}
