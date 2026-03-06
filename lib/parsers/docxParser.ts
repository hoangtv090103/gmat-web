import mammoth from 'mammoth';
import { parseGMATDocument, normalizeText } from './questionParser';
import { ParseResult } from '@/types/gmat';

export async function parseDocxFile(file: File): Promise<ParseResult> {
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer });
  const text = normalizeText(result.value);
  return parseGMATDocument(text);
}
