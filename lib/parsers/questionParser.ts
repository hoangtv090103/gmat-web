import { ParsedHeader, ParsedQuestion, ParseResult, ParseError } from '@/types/gmat';

// ─── Text Normalization ──────────────────────────────────────

export function normalizeText(text: string): string {
  return text
    // Curly quotes → straight
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
    // Em/en dashes → standard
    .replace(/[\u2013\u2014]/g, '—')
    // Bullet symbols
    .replace(/[\u2022\u2023\u25E6\u2043\u2219]/g, '•')
    // Non-breaking spaces
    .replace(/\u00A0/g, ' ')
    // Ellipsis
    .replace(/\u2026/g, '...')
    // Checkmark variants
    .replace(/[\u2713\u2714\u2705]/g, '✓')
    // Multiple spaces → single
    .replace(/  +/g, ' ')
    // Normalize line endings
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');
}

// ─── Header Parsing ──────────────────────────────────────────

export function parseHeader(text: string): ParsedHeader {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);

  let title = 'GMAT Focus Edition';
  let section = '';
  let date: string | undefined;
  let topics: string | undefined;
  let difficulty_range: string | undefined;
  let total_questions: number | undefined;
  let target: string | undefined;

  // Look for "GMAT FOCUS EDITION" line
  const gmatIdx = lines.findIndex((l) => /gmat\s+focus\s+edition/i.test(l));
  if (gmatIdx >= 0) {
    title = lines[gmatIdx];
  }

  // Section name line (e.g. "Quant Block 3 — Mixed Weak Areas")
  const sectionLine = lines.find((l) => /block\s+\d+|section/i.test(l));
  if (sectionLine) {
    section = sectionLine;
  }

  // Date | Topics | Difficulty range line
  const metaLine = lines.find((l) => /\d{3,4}\s*[–\-]\s*\d{3,4}/.test(l));
  if (metaLine) {
    // Extract date (e.g. "March 4, 2026")
    const dateMatch = metaLine.match(/([A-Z][a-z]+\s+\d{1,2},?\s+\d{4})/);
    if (dateMatch) date = dateMatch[1];

    // Extract difficulty range (e.g. "505–605" or "505-605")
    const diffMatch = metaLine.match(/(\d{3})\s*[–\-]\s*(\d{3})/);
    if (diffMatch) difficulty_range = `${diffMatch[1]}–${diffMatch[2]}`;

    // Topics are between | separators; pick the middle segment
    const parts = metaLine.split('|').map((p) => p.trim());
    if (parts.length >= 2) {
      // Find the segment with topic keywords (not date, not difficulty)
      const topicPart = parts.find(
        (p) => !p.match(/\d{4}/) || p.includes('·') || p.includes('/')
      );
      if (topicPart && !topicPart.match(/^\d{3}/)) {
        topics = topicPart;
      }
    }
  }

  // Count questions from "Question N" patterns
  const questionMatches = text.match(/Question\s+\d+\s+Difficulty:/gi);
  if (questionMatches) {
    total_questions = questionMatches.length;
  }

  // Target (e.g. "Target: 5+/8")
  const targetMatch = text.match(/Target:\s*([\d+]+\/\d+)/i);
  if (targetMatch) target = targetMatch[1];

  return { title, section, date, topics, difficulty_range, total_questions, target };
}

// ─── Question Block Splitting ────────────────────────────────

function splitIntoQuestionBlocks(text: string): string[] {
  // Split on "Question N   Difficulty:" pattern
  const pattern = /(?=Question\s+\d+\s+Difficulty:)/gi;
  const blocks = text.split(pattern).filter((b) => /Question\s+\d+\s+Difficulty:/i.test(b));
  return blocks;
}

// ─── Answer Key Parsing ──────────────────────────────────────

interface AnswerKeyEntry {
  questionNumber: number;
  correctAnswer: string;
  explanation: string;
  s1Verdict?: string;
  s2Verdict?: string;
  reasoning?: string;
}

function parseAnswerKeys(text: string): Map<number, AnswerKeyEntry> {
  const map = new Map<number, AnswerKeyEntry>();

  // Split on "Answer Key — Question N" pattern
  const pattern = /(?=Answer\s+Key\s*[—\-–]+\s*Question\s+\d+)/gi;
  const blocks = text.split(pattern).filter((b) => /Answer\s+Key/i.test(b));

  for (const block of blocks) {
    const numMatch = block.match(/Answer\s+Key\s*[—\-–]+\s*Question\s+(\d+)/i);
    if (!numMatch) continue;

    const qNum = parseInt(numMatch[1], 10);

    // Correct answer
    const ansMatch = block.match(/Correct\s+Answer:\s*([A-E])/i);
    const correctAnswer = ansMatch ? ansMatch[1].toUpperCase() : '';

    // Solution/Explanation — everything after "Solution:" or "Correct Answer: X"
    let explanation = '';
    const solMatch = block.match(/Solution:\s*([\s\S]*)/i);
    if (solMatch) {
      explanation = solMatch[1].trim();
    } else if (ansMatch) {
      // Take everything after "Correct Answer: X"
      const afterAnswer = block.substring(block.indexOf(ansMatch[0]) + ansMatch[0].length);
      explanation = afterAnswer.trim();
    }

    // DS specific: Statement (1): SUFFICIENT/NOT SUFFICIENT
    const s1Match = block.match(/Statement\s*\(1\):\s*(SUFFICIENT|NOT\s+SUFFICIENT)/i);
    const s2Match = block.match(/Statement\s*\(2\):\s*(SUFFICIENT|NOT\s+SUFFICIENT)/i);

    // Reasoning
    const reasonMatch = block.match(/Reasoning:\s*([\s\S]*?)(?=\n\n|$)/i);

    map.set(qNum, {
      questionNumber: qNum,
      correctAnswer,
      explanation,
      s1Verdict: s1Match?.[1],
      s2Verdict: s2Match?.[1],
      reasoning: reasonMatch?.[1]?.trim(),
    });
  }

  return map;
}

// ─── Single Question Parsing ─────────────────────────────────

function parseQuestionBlock(block: string): Omit<ParsedQuestion, 'correct_answer' | 'explanation' | 's1_verdict' | 's2_verdict' | 'reasoning'> | null {
  // Extract question number and difficulty
  const headerMatch = block.match(
    /Question\s+(\d+)\s+Difficulty:\s*(\d+)\s*\|?\s*(?:Topic|Type):\s*(.+)/i
  );
  if (!headerMatch) return null;

  const question_number = parseInt(headerMatch[1], 10);
  const difficulty = parseInt(headerMatch[2], 10);
  const rawType = headerMatch[3].trim();

  // Determine question type
  const topic = rawType;
  let question_type = 'Problem Solving';
  if (/data\s+sufficiency/i.test(rawType)) {
    question_type = 'Data Sufficiency';
  } else if (/reading\s+comprehension/i.test(rawType)) {
    question_type = 'Reading Comprehension';
  } else if (/critical\s+reasoning/i.test(rawType)) {
    question_type = 'Critical Reasoning';
  } else if (/multi.?source/i.test(rawType)) {
    question_type = 'Multi-Source Reasoning';
  } else if (/table\s+analysis/i.test(rawType)) {
    question_type = 'Table Analysis';
  } else if (/graphics?\s+interpretation/i.test(rawType)) {
    question_type = 'Graphics Interpretation';
  } else if (/two.?part/i.test(rawType)) {
    question_type = 'Two-Part Analysis';
  }

  // Remove the header line to get the body
  const headerEnd = block.indexOf('\n', block.indexOf(headerMatch[0]));
  const body = headerEnd >= 0 ? block.substring(headerEnd + 1) : '';

  // Extract DS statements if present
  const s1Match = body.match(/\(1\)\s*([\s\S]*?)(?=\n\(2\)|\n\(A\)|\n\n)/);
  const s2Match = body.match(/\(2\)\s*([\s\S]*?)(?=\n\(A\)|\n\n)/);
  const statement1 = s1Match ? s1Match[1].trim() : undefined;
  const statement2 = s2Match ? s2Match[1].trim() : undefined;

  // Extract choices (A)-(E)
  const choicePattern = /\(([A-E])\)\s*([\s\S]*?)(?=\n\([A-E]\)|\n\n|$)/g;
  const choices: Record<string, string> = { A: '', B: '', C: '', D: '', E: '' };
  let match;
  while ((match = choicePattern.exec(body)) !== null) {
    choices[match[1].toUpperCase()] = match[2].trim();
  }

  // Stem: everything before first (1), (A), or choices
  let stemEnd = body.length;
  const firstMarker = body.match(/\n\s*\((?:1|A)\)/);
  if (firstMarker && firstMarker.index !== undefined) {
    stemEnd = firstMarker.index;
  }
  const stem = body.substring(0, stemEnd).trim();

  // For DS questions, auto-fill standard choices
  if (question_type === 'Data Sufficiency') {
    choices.A = 'Statement (1) ALONE is sufficient, but statement (2) alone is not sufficient.';
    choices.B = 'Statement (2) ALONE is sufficient, but statement (1) alone is not sufficient.';
    choices.C = 'BOTH statements TOGETHER are sufficient, but NEITHER alone is sufficient.';
    choices.D = 'EACH statement ALONE is sufficient.';
    choices.E = 'Statements (1) and (2) TOGETHER are NOT sufficient.';
  }

  return {
    question_number,
    difficulty,
    question_type,
    topic,
    stem,
    statement1,
    statement2,
    choices: {
      A: choices.A,
      B: choices.B,
      C: choices.C,
      D: choices.D,
      E: choices.E,
    },
  };
}

// ─── Main Parser ─────────────────────────────────────────────

export function parseGMATDocument(rawText: string): ParseResult {
  const text = normalizeText(rawText);
  const errors: ParseError[] = [];

  // Parse header
  const header = parseHeader(text);

  // Split text into questions section and answer key section
  const answerKeyStart = text.search(/Answer\s+Key\s*[—\-–&]/i);
  const questionsText = answerKeyStart >= 0 ? text.substring(0, answerKeyStart) : text;
  const answerKeyText = answerKeyStart >= 0 ? text.substring(answerKeyStart) : '';

  // Parse answer keys
  const answerKeys = parseAnswerKeys(answerKeyText);

  // Split into question blocks
  const blocks = splitIntoQuestionBlocks(questionsText);

  const questions: ParsedQuestion[] = [];

  for (const block of blocks) {
    try {
      const parsed = parseQuestionBlock(block);
      if (!parsed) {
        errors.push({
          message: 'Failed to parse question block',
          raw: block.substring(0, 100),
        });
        continue;
      }

      // Merge with answer key
      const answerKey = answerKeys.get(parsed.question_number);

      questions.push({
        ...parsed,
        correct_answer: answerKey?.correctAnswer || '',
        explanation: answerKey?.explanation,
        s1_verdict: answerKey?.s1Verdict,
        s2_verdict: answerKey?.s2Verdict,
        reasoning: answerKey?.reasoning,
      });
    } catch (err) {
      errors.push({
        message: `Error parsing block: ${err instanceof Error ? err.message : 'unknown'}`,
        raw: block.substring(0, 100),
      });
    }
  }

  // Update header question count if detected from parsing
  if (!header.total_questions && questions.length > 0) {
    header.total_questions = questions.length;
  }

  return { header, questions, errors };
}
