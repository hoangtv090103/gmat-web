// Shared types used across MCP tools

export type SectionType = 'quant' | 'verbal' | 'di';
export type ExamMode = 'timed' | 'practice' | 'review' | 'simulation';
export type ErrorCategory = 'Content' | 'Process' | 'Habit';

// GMAT target seconds per question type
export const QUESTION_TIME_TARGETS: Record<string, number> = {
  'Problem Solving': 120,
  'Data Sufficiency': 120,
  'Critical Reasoning': 120,
  'Reading Comprehension': 150,
  'Multi-Source Reasoning': 150,
  'Table Analysis': 120,
  'Graphics Interpretation': 120,
  'Two-Part Analysis': 150,
};

// Section type → Supabase question_sets.section values
export const SECTION_TO_SET_SECTIONS: Record<SectionType, string[]> = {
  quant: ['Quantitative', 'Quant', 'quantitative', 'quant', 'Problem Solving', 'Data Sufficiency'],
  verbal: ['Verbal', 'verbal', 'Critical Reasoning', 'Reading Comprehension'],
  di: ['Data Insights', 'DI', 'data insights', 'di', 'Multi-Source Reasoning', 'Table Analysis', 'Graphics Interpretation', 'Two-Part Analysis'],
};

// Section type → question_type values (for filtering by section when no set join available)
export const SECTION_TO_QUESTION_TYPES: Record<SectionType, string[]> = {
  quant: ['Problem Solving', 'Data Sufficiency'],
  verbal: ['Critical Reasoning', 'Reading Comprehension'],
  di: ['Multi-Source Reasoning', 'Table Analysis', 'Graphics Interpretation', 'Two-Part Analysis'],
};

export function getDateFilter(period: 'week' | 'month' | 'all'): string | null {
  if (period === 'all') return null;
  const now = new Date();
  if (period === 'week') {
    now.setDate(now.getDate() - 7);
  } else {
    now.setMonth(now.getMonth() - 1);
  }
  return now.toISOString();
}

export function toPercent(correct: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((correct / total) * 100);
}

// Helper to format tool result as MCP text content
export function textResult(data: unknown): { content: Array<{ type: 'text'; text: string }> } {
  return {
    content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
  };
}

export function errorResult(message: string): { content: Array<{ type: 'text'; text: string }> } {
  return {
    content: [{ type: 'text', text: `Error: ${message}` }],
  };
}
