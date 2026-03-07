'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import type { Question, Passage } from '@/types/gmat';

// ─── Markdown Table Parser ────────────────────────────────────

function parseMarkdownTable(markdown: string): { headers: string[]; rows: string[][] } {
  const lines = markdown.trim().split('\n').filter((l) => l.trim());
  const dataLines = lines.filter((l) => !/^\s*\|[-:\s|]+\|\s*$/.test(l));
  const parseRow = (line: string) =>
    line
      .split('|')
      .map((c) => c.trim())
      .filter((_, i, arr) => i > 0 && i < arr.length - 1);
  if (dataLines.length === 0) return { headers: [], rows: [] };
  return {
    headers: parseRow(dataLines[0]),
    rows: dataLines.slice(1).map(parseRow),
  };
}

// ─── Shared helpers ───────────────────────────────────────────

const CHOICE_KEYS = ['A', 'B', 'C', 'D', 'E'] as const;
type ChoiceKey = (typeof CHOICE_KEYS)[number];

function getChoiceValue(question: Question, key: ChoiceKey): string {
  switch (key) {
    case 'A': return question.choice_a;
    case 'B': return question.choice_b;
    case 'C': return question.choice_c;
    case 'D': return question.choice_d;
    case 'E': return question.choice_e;
  }
}

/** Returns the Tailwind classes for a standard A-E choice button */
function choiceButtonClasses(
  key: ChoiceKey,
  selectedAnswer: string | null,
  correctAnswer: string,
  showCorrect?: boolean,
  locked?: boolean
): string {
  const isSelected = selectedAnswer === key;
  const isCorrect = correctAnswer === key;

  let stateClasses = '';

  if (showCorrect) {
    if (isCorrect) {
      stateClasses = 'bg-green-500/20 border-green-500 text-green-200';
    } else if (isSelected) {
      stateClasses = 'bg-red-500/20 border-red-500 text-red-200';
    } else {
      stateClasses = 'bg-zinc-800/50 border-zinc-700 text-zinc-200 hover:bg-zinc-700/50';
    }
  } else if (isSelected) {
    stateClasses = 'bg-blue-500/20 border-blue-500 text-blue-200';
  } else {
    stateClasses = 'bg-zinc-800/50 border-zinc-700 text-zinc-200 hover:bg-zinc-700/50';
  }

  return cn(
    'w-full text-left px-4 py-2.5 rounded-lg border text-sm transition-colors',
    stateClasses,
    locked && 'pointer-events-none opacity-70'
  );
}

// ─── Standard A-E Choice Buttons ─────────────────────────────

interface ChoiceButtonsProps {
  question: Question;
  selectedAnswer: string | null;
  onSelect: (answer: string) => void;
  locked?: boolean;
  showCorrect?: boolean;
}

function ChoiceButtons({ question, selectedAnswer, onSelect, locked, showCorrect }: ChoiceButtonsProps) {
  return (
    <div className="flex flex-col gap-2 mt-4">
      {CHOICE_KEYS.map((key) => {
        const value = getChoiceValue(question, key);
        if (!value) return null;
        return (
          <button
            key={key}
            onClick={() => !locked && onSelect(key)}
            className={choiceButtonClasses(key, selectedAnswer, question.correct_answer, showCorrect, locked)}
          >
            <span className="font-semibold mr-2">{key}.</span>
            {value}
          </button>
        );
      })}
    </div>
  );
}

// ─── Component 1: TwoPartRenderer ────────────────────────────

interface TwoPartRendererProps {
  question: Question;
  selectedAnswer: string | null;
  selectedAnswer2: string | null;
  onSelect: (answer: string) => void;
  onSelect2: (answer: string) => void;
  locked?: boolean;
  mode?: string;
  showCorrect?: boolean;
}

export function TwoPartRenderer({
  question,
  selectedAnswer,
  selectedAnswer2,
  onSelect,
  onSelect2,
  locked,
  showCorrect,
}: TwoPartRendererProps) {
  const col1Label = question.two_part_col1_label || 'Part 1';
  const col2Label = question.two_part_col2_label || 'Part 2';

  function part1CellClasses(key: ChoiceKey): string {
    const isSelected = selectedAnswer === key;
    const isCorrect = question.correct_answer === key;

    let stateClasses = '';
    if (showCorrect) {
      if (isCorrect) {
        stateClasses = 'bg-green-500/20 border border-green-500';
      } else if (isSelected) {
        stateClasses = 'bg-red-500/20 border border-red-500';
      } else {
        stateClasses = 'hover:bg-zinc-700/50 border border-transparent';
      }
    } else if (isSelected) {
      stateClasses = 'bg-blue-500/20 border border-blue-500';
    } else {
      stateClasses = 'hover:bg-zinc-700/50 border border-transparent';
    }

    return cn(
      'cursor-pointer text-center rounded px-2 py-1 transition-colors select-none',
      stateClasses,
      locked && 'pointer-events-none opacity-70'
    );
  }

  function part2CellClasses(key: ChoiceKey): string {
    const isSelected = selectedAnswer2 === key;
    const isCorrect = question.correct_answer2 === key;

    let stateClasses = '';
    if (showCorrect) {
      if (isCorrect) {
        stateClasses = 'bg-green-500/20 border border-green-500';
      } else if (isSelected) {
        stateClasses = 'bg-red-500/20 border border-red-500';
      } else {
        stateClasses = 'hover:bg-zinc-700/50 border border-transparent';
      }
    } else if (isSelected) {
      stateClasses = 'bg-blue-500/20 border border-blue-500';
    } else {
      stateClasses = 'hover:bg-zinc-700/50 border border-transparent';
    }

    return cn(
      'cursor-pointer text-center rounded px-2 py-1 transition-colors select-none',
      stateClasses,
      locked && 'pointer-events-none opacity-70'
    );
  }

  const rows = CHOICE_KEYS.map((key) => ({
    key,
    value: getChoiceValue(question, key),
  })).filter((r) => r.value !== '');

  return (
    <div className="overflow-x-auto rounded-lg border border-zinc-700">
      <Table>
        <TableHeader>
          <TableRow className="border-zinc-700 hover:bg-transparent">
            <TableHead className="text-zinc-300 font-semibold border-r border-zinc-700 min-w-[200px]">
              Choice
            </TableHead>
            <TableHead className="text-zinc-300 font-semibold border-r border-zinc-700 text-center w-32">
              <div className="text-xs text-zinc-400 mb-0.5">Part 1</div>
              <div>{col1Label}</div>
            </TableHead>
            <TableHead className="text-zinc-300 font-semibold text-center w-32">
              <div className="text-xs text-zinc-400 mb-0.5">Part 2</div>
              <div>{col2Label}</div>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map(({ key, value }) => (
            <TableRow key={key} className="border-zinc-700 hover:bg-zinc-800/30">
              <TableCell className="text-zinc-200 border-r border-zinc-700 whitespace-normal py-3">
                <span className="font-semibold text-zinc-400 mr-2">{key}.</span>
                {value}
              </TableCell>
              <TableCell className="border-r border-zinc-700 py-3">
                <div
                  className={part1CellClasses(key)}
                  onClick={() => !locked && onSelect(key)}
                >
                  <div
                    className={cn(
                      'mx-auto w-4 h-4 rounded-full border-2 flex items-center justify-center',
                      selectedAnswer === key
                        ? 'border-blue-500 bg-blue-500'
                        : 'border-zinc-500'
                    )}
                  >
                    {selectedAnswer === key && (
                      <div className="w-1.5 h-1.5 rounded-full bg-white" />
                    )}
                  </div>
                </div>
              </TableCell>
              <TableCell className="py-3">
                <div
                  className={part2CellClasses(key)}
                  onClick={() => !locked && onSelect2(key)}
                >
                  <div
                    className={cn(
                      'mx-auto w-4 h-4 rounded-full border-2 flex items-center justify-center',
                      selectedAnswer2 === key
                        ? 'border-blue-500 bg-blue-500'
                        : 'border-zinc-500'
                    )}
                  >
                    {selectedAnswer2 === key && (
                      <div className="w-1.5 h-1.5 rounded-full bg-white" />
                    )}
                  </div>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

// ─── Component 2: TableAnalysisRenderer ──────────────────────

interface TableAnalysisRendererProps {
  passage: Passage;
  question: Question;
  selectedAnswer: string | null;
  onSelect: (answer: string) => void;
  locked?: boolean;
  showCorrect?: boolean;
  /** Pass true when the table is already displayed in the left passage panel */
  hideSources?: boolean;
}

export function TableAnalysisRenderer({
  passage,
  question,
  selectedAnswer,
  onSelect,
  locked,
  showCorrect,
  hideSources,
}: TableAnalysisRendererProps) {
  const { headers, rows } = hideSources ? { headers: [], rows: [] } : parseMarkdownTable(passage.passage_text);

  function tfButtonClasses(key: 'A' | 'B'): string {
    const isSelected = selectedAnswer === key;
    const isCorrect = question.correct_answer === key;

    let stateClasses = '';
    if (showCorrect) {
      if (isCorrect) {
        stateClasses = 'bg-green-500/20 border-green-500 text-green-200';
      } else if (isSelected) {
        stateClasses = 'bg-red-500/20 border-red-500 text-red-200';
      } else {
        stateClasses = 'bg-zinc-800/50 border-zinc-700 text-zinc-200 hover:bg-zinc-700/50';
      }
    } else if (isSelected) {
      stateClasses = 'bg-blue-500/20 border-blue-500 text-blue-200';
    } else {
      stateClasses = 'bg-zinc-800/50 border-zinc-700 text-zinc-200 hover:bg-zinc-700/50';
    }

    return cn(
      'px-8 py-2.5 rounded-lg border text-sm font-medium transition-colors',
      stateClasses,
      locked && 'pointer-events-none opacity-70'
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Scrollable table — hidden when left panel already shows it */}
      {!hideSources && (
        <div className="overflow-x-auto rounded-lg border border-zinc-700 max-h-72 overflow-y-auto">
          <Table>
            {headers.length > 0 && (
              <TableHeader>
                <TableRow className="border-zinc-700 hover:bg-transparent sticky top-0 bg-zinc-900">
                  {headers.map((h, i) => (
                    <TableHead key={i} className="text-zinc-300 font-semibold border-r last:border-r-0 border-zinc-700 whitespace-normal">
                      {h}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
            )}
            <TableBody>
              {rows.map((row, ri) => (
                <TableRow key={ri} className="border-zinc-700 hover:bg-zinc-800/30">
                  {row.map((cell, ci) => (
                    <TableCell key={ci} className="text-zinc-200 border-r last:border-r-0 border-zinc-700 whitespace-normal py-2">
                      {cell}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* True / False buttons */}
      <div className="flex gap-3">
        <button
          onClick={() => !locked && onSelect('A')}
          className={tfButtonClasses('A')}
        >
          True
        </button>
        <button
          onClick={() => !locked && onSelect('B')}
          className={tfButtonClasses('B')}
        >
          False
        </button>
      </div>
    </div>
  );
}

// ─── Passage content renderer (used by MSR and exam page left panel) ────────

export function PassageContent({ passage }: { passage: Passage }) {
  if (passage.passage_type === 'table_markdown') {
    const { headers, rows } = parseMarkdownTable(passage.passage_text);
    return (
      <div className="overflow-x-auto rounded-lg border border-zinc-700 max-h-72 overflow-y-auto">
        <Table>
          {headers.length > 0 && (
            <TableHeader>
              <TableRow className="border-zinc-700 hover:bg-transparent sticky top-0 bg-zinc-900">
                {headers.map((h, i) => (
                  <TableHead key={i} className="text-zinc-300 font-semibold border-r last:border-r-0 border-zinc-700 whitespace-normal">
                    {h}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
          )}
          <TableBody>
            {rows.map((row, ri) => (
              <TableRow key={ri} className="border-zinc-700 hover:bg-zinc-800/30">
                {row.map((cell, ci) => (
                  <TableCell key={ci} className="text-zinc-200 border-r last:border-r-0 border-zinc-700 whitespace-normal py-2">
                    {cell}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  }

  if (passage.passage_type === 'image_url') {
    return (
      <img
        src={passage.passage_text}
        alt="Passage"
        className="max-h-80 object-contain mx-auto rounded-md"
      />
    );
  }

  // Default: 'text'
  return (
    <p className="text-zinc-200 text-sm whitespace-pre-wrap leading-relaxed">
      {passage.passage_text}
    </p>
  );
}

// ─── MSR Left Panel: Tabs with source passages ───────────────

export function MultiSourceTabs({ passages }: { passages: Passage[] }) {
  const defaultTab = passages[0]?.id ?? '';
  return (
    <Tabs defaultValue={defaultTab} className="flex flex-col flex-1 min-h-0">
      <TabsList className="shrink-0 bg-slate-900/80 border-b border-slate-700/50 h-auto rounded-none p-0 w-full justify-start">
        {passages.map((passage, index) => (
          <TabsTrigger
            key={passage.id}
            value={passage.id}
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-blue-400 data-[state=active]:bg-transparent data-[state=active]:text-white data-[state=inactive]:text-slate-400 text-[11px] font-semibold uppercase tracking-[0.12em] px-5 py-2.5 transition-colors"
          >
            {passage.tab_label || `Source ${index + 1}`}
          </TabsTrigger>
        ))}
      </TabsList>
      <div className="flex-1 overflow-y-auto bg-[#0B1623]/50">
        {passages.map((passage) => (
          <TabsContent key={passage.id} value={passage.id} className="mt-0 px-8 py-7">
            <PassageContent passage={passage} />
          </TabsContent>
        ))}
      </div>
    </Tabs>
  );
}

// ─── Component 3: MultiSourceRenderer ────────────────────────

interface MultiSourceRendererProps {
  passages: Passage[];
  question: Question;
  selectedAnswer: string | null;
  onSelect: (answer: string) => void;
  locked?: boolean;
  showCorrect?: boolean;
  /** Pass true when passages are already shown in the left split panel */
  hideSources?: boolean;
}

export function MultiSourceRenderer({
  passages,
  question,
  selectedAnswer,
  onSelect,
  locked,
  showCorrect,
  hideSources,
}: MultiSourceRendererProps) {
  if (hideSources) {
    return (
      <ChoiceButtons
        question={question}
        selectedAnswer={selectedAnswer}
        onSelect={onSelect}
        locked={locked}
        showCorrect={showCorrect}
      />
    );
  }

  const defaultTab = passages[0]?.id ?? '';

  return (
    <div className="flex flex-col gap-4">
      <Tabs defaultValue={defaultTab}>
        <TabsList className="bg-zinc-800 border border-zinc-700 h-auto p-1 flex-wrap gap-1">
          {passages.map((passage, index) => (
            <TabsTrigger
              key={passage.id}
              value={passage.id}
              className="text-sm data-[state=active]:bg-zinc-700 data-[state=active]:text-zinc-100 text-zinc-400"
            >
              {passage.tab_label || `Source ${index + 1}`}
            </TabsTrigger>
          ))}
        </TabsList>
        {passages.map((passage) => (
          <TabsContent key={passage.id} value={passage.id} className="mt-3">
            <PassageContent passage={passage} />
          </TabsContent>
        ))}
      </Tabs>

      {/* A-E Choice buttons */}
      <ChoiceButtons
        question={question}
        selectedAnswer={selectedAnswer}
        onSelect={onSelect}
        locked={locked}
        showCorrect={showCorrect}
      />
    </div>
  );
}

// ─── Component 4: GraphicsRenderer ───────────────────────────

interface GraphicsRendererProps {
  passage: Passage;
  question: Question;
  selectedAnswer: string | null;
  onSelect: (answer: string) => void;
  locked?: boolean;
  showCorrect?: boolean;
  /** Pass true when the image is already displayed in the left passage panel */
  hideSources?: boolean;
}

export function GraphicsRenderer({
  passage,
  question,
  selectedAnswer,
  onSelect,
  locked,
  showCorrect,
  hideSources,
}: GraphicsRendererProps) {
  return (
    <div className="flex flex-col gap-4">
      {/* Chart/image — hidden when left panel already shows it */}
      {!hideSources && (
        <div className="flex justify-center p-4 bg-zinc-800/40 rounded-lg border border-zinc-700">
          <img
            src={passage.passage_text}
            alt="Chart"
            className="max-h-80 object-contain mx-auto rounded-md"
          />
        </div>
      )}

      {/* A-E Choice buttons */}
      <ChoiceButtons
        question={question}
        selectedAnswer={selectedAnswer}
        onSelect={onSelect}
        locked={locked}
        showCorrect={showCorrect}
      />
    </div>
  );
}
