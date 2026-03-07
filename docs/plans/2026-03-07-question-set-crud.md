# Question Set CRUD Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add full CRUD (edit set metadata, edit/delete individual questions, delete sets) accessible from the dashboard and via 4 new MCP tools for Claude Desktop.

**Architecture:** Kebab menu (`⋯`) on each set card in `app/page.tsx` → opens one of three modals/sheets: `SetEditModal` (edit metadata), `QuestionManagerSheet` (list + edit/delete questions), `DeleteConfirmDialog`. All icons use `FaIcon` from `@/components/ui/fa-icon`. MCP tools in a new `crud.ts` file follow existing `write.ts` patterns.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind CSS 4, shadcn/ui (Dialog, Sheet, DropdownMenu already installed), FontAwesome via FaIcon, Supabase + localStorage dual-mode via `lib/db.ts`, MCP SDK (`@modelcontextprotocol/sdk`), Zod.

---

## Task 1: Install missing shadcn Sheet component

**Files:**
- Create: `components/ui/sheet.tsx`

**Step 1: Install via shadcn CLI**

```bash
cd /Users/hoangtv/gmat-web
npx shadcn@latest add sheet --yes
```

Expected output: creates `components/ui/sheet.tsx`.

**Step 2: Verify file exists**

```bash
ls components/ui/sheet.tsx
```

Expected: file listed.

**Step 3: Commit**

```bash
git add components/ui/sheet.tsx
git commit -m "feat: install shadcn Sheet component for CRUD side panel"
```

---

## Task 2: Add `updateQuestionSet`, `updateQuestion`, `deleteQuestion` to `lib/db.ts`

**Files:**
- Modify: `lib/db.ts` (append after `deleteQuestionSet` at line 598)

**Step 1: Append 3 functions to `lib/db.ts`**

After the closing `}` of `deleteQuestionSet` (currently the last function), add:

```typescript
export async function updateQuestionSet(
  id: string,
  updates: Partial<Pick<QuestionSet, 'name' | 'section' | 'difficulty_range' | 'topics' | 'target' | 'study_date'>>
): Promise<void> {
  const supabase = getSupabase();

  if (supabase && isSupabaseConfigured()) {
    const { error } = await supabase.from('question_sets').update(updates).eq('id', id);
    if (error) throw new Error(error.message);
    return;
  }

  const sets = getLocal<QuestionSet>(STORAGE_KEYS.QUESTION_SETS);
  const idx = sets.findIndex((s) => s.id === id);
  if (idx >= 0) {
    sets[idx] = { ...sets[idx], ...updates };
    setLocal(STORAGE_KEYS.QUESTION_SETS, sets);
  }
}

export async function updateQuestion(
  id: string,
  updates: Partial<Omit<Question, 'id' | 'set_id' | 'created_at'>>
): Promise<void> {
  const supabase = getSupabase();

  if (supabase && isSupabaseConfigured()) {
    const { error } = await supabase.from('questions').update(updates).eq('id', id);
    if (error) throw new Error(error.message);
    return;
  }

  const questions = getLocal<Question>(STORAGE_KEYS.QUESTIONS);
  const idx = questions.findIndex((q) => q.id === id);
  if (idx >= 0) {
    questions[idx] = { ...questions[idx], ...updates };
    setLocal(STORAGE_KEYS.QUESTIONS, questions);
  }
}

export async function deleteQuestion(id: string): Promise<void> {
  const supabase = getSupabase();

  if (supabase && isSupabaseConfigured()) {
    const { error } = await supabase.from('questions').delete().eq('id', id);
    if (error) throw new Error(error.message);
    return;
  }

  setLocal(
    STORAGE_KEYS.QUESTIONS,
    getLocal<Question>(STORAGE_KEYS.QUESTIONS).filter((q) => q.id !== id)
  );
}
```

**Step 2: Verify TypeScript compiles**

```bash
cd /Users/hoangtv/gmat-web
npm run build 2>&1 | head -30
```

Expected: no new TypeScript errors from `lib/db.ts`.

**Step 3: Commit**

```bash
git add lib/db.ts
git commit -m "feat: add updateQuestionSet, updateQuestion, deleteQuestion to db.ts"
```

---

## Task 3: Create `DeleteConfirmDialog` component

**Files:**
- Create: `components/question-sets/DeleteConfirmDialog.tsx`

**Step 1: Create directory and file**

```bash
mkdir -p /Users/hoangtv/gmat-web/components/question-sets
```

Create `components/question-sets/DeleteConfirmDialog.tsx`:

```tsx
"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { FaIcon } from "@/components/ui/fa-icon";
import { faTriangleExclamation, faTrash } from "@fortawesome/free-solid-svg-icons";

interface DeleteConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
}

export function DeleteConfirmDialog({
  open,
  title,
  description,
  onConfirm,
  onCancel,
  loading = false,
}: DeleteConfirmDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onCancel()}>
      <DialogContent className="sm:max-w-md bg-slate-900 border-slate-700">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-400">
            <FaIcon icon={faTriangleExclamation} className="h-5 w-5" />
            {title}
          </DialogTitle>
          <DialogDescription className="text-slate-400">
            {description}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex gap-2 sm:justify-end mt-4">
          <Button
            variant="outline"
            onClick={onCancel}
            disabled={loading}
            className="border-slate-600"
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={onConfirm}
            disabled={loading}
            className="bg-red-600 hover:bg-red-700"
          >
            <FaIcon icon={faTrash} className="mr-2 h-4 w-4" />
            {loading ? "Deleting…" : "Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

**Step 2: Verify file created correctly**

```bash
cat components/question-sets/DeleteConfirmDialog.tsx | head -5
```

Expected: `"use client";` on first line.

**Step 3: Commit**

```bash
git add components/question-sets/DeleteConfirmDialog.tsx
git commit -m "feat: add DeleteConfirmDialog for CRUD confirmations"
```

---

## Task 4: Create `SetEditModal` component

**Files:**
- Create: `components/question-sets/SetEditModal.tsx`

**Step 1: Create `components/question-sets/SetEditModal.tsx`**

```tsx
"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FaIcon } from "@/components/ui/fa-icon";
import { faFloppyDisk, faXmark } from "@fortawesome/free-solid-svg-icons";
import { updateQuestionSet } from "@/lib/db";
import { QuestionSet } from "@/types/gmat";
import { toast } from "sonner";

interface SetEditModalProps {
  open: boolean;
  questionSet: QuestionSet | null;
  onClose: () => void;
  onSaved: (updated: Partial<QuestionSet>) => void;
}

export function SetEditModal({ open, questionSet, onClose, onSaved }: SetEditModalProps) {
  const [name, setName] = useState("");
  const [section, setSection] = useState("");
  const [difficultyRange, setDifficultyRange] = useState("");
  const [topics, setTopics] = useState("");
  const [target, setTarget] = useState("");
  const [studyDate, setStudyDate] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (questionSet) {
      setName(questionSet.name);
      setSection(questionSet.section ?? "");
      setDifficultyRange(questionSet.difficulty_range ?? "");
      setTopics(questionSet.topics ?? "");
      setTarget(questionSet.target ?? "");
      setStudyDate(questionSet.study_date ?? "");
    }
  }, [questionSet]);

  async function handleSave() {
    if (!questionSet || !name.trim()) return;
    setSaving(true);
    try {
      const updates = {
        name: name.trim(),
        section: section || undefined,
        difficulty_range: difficultyRange || undefined,
        topics: topics || undefined,
        target: target || undefined,
        study_date: studyDate || undefined,
      };
      await updateQuestionSet(questionSet.id, updates);
      onSaved(updates);
      toast.success("Question set updated");
      onClose();
    } catch (err) {
      toast.error(`Failed to update: ${err}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg bg-slate-900 border-slate-700">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span>Edit Question Set</span>
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="h-7 w-7 text-slate-400 hover:text-white"
            >
              <FaIcon icon={faXmark} className="h-4 w-4" />
            </Button>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1">
            <Label htmlFor="set-name">Name *</Label>
            <Input
              id="set-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="bg-slate-800/50 border-slate-700"
              placeholder="e.g. Quant Practice Set 1"
            />
          </div>

          <div className="space-y-1">
            <Label>Section</Label>
            <Select value={section} onValueChange={setSection}>
              <SelectTrigger className="bg-slate-800/50 border-slate-700">
                <SelectValue placeholder="Select section…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Quantitative">Quantitative</SelectItem>
                <SelectItem value="Verbal">Verbal</SelectItem>
                <SelectItem value="Data Insights">Data Insights</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label htmlFor="set-difficulty">Difficulty Range</Label>
              <Input
                id="set-difficulty"
                value={difficultyRange}
                onChange={(e) => setDifficultyRange(e.target.value)}
                className="bg-slate-800/50 border-slate-700"
                placeholder="e.g. 600-700"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="set-study-date">Study Date</Label>
              <Input
                id="set-study-date"
                type="date"
                value={studyDate}
                onChange={(e) => setStudyDate(e.target.value)}
                className="bg-slate-800/50 border-slate-700"
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="set-topics">Topics</Label>
            <Input
              id="set-topics"
              value={topics}
              onChange={(e) => setTopics(e.target.value)}
              className="bg-slate-800/50 border-slate-700"
              placeholder="e.g. Algebra, Number Properties"
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="set-target">Target</Label>
            <Input
              id="set-target"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              className="bg-slate-800/50 border-slate-700"
              placeholder="e.g. 700+"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving} className="border-slate-600">
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving || !name.trim()}
            className="bg-blue-600 hover:bg-blue-700"
          >
            <FaIcon icon={faFloppyDisk} className="mr-2 h-4 w-4" />
            {saving ? "Saving…" : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

**Step 2: Commit**

```bash
git add components/question-sets/SetEditModal.tsx
git commit -m "feat: add SetEditModal for editing question set metadata"
```

---

## Task 5: Create `QuestionManagerSheet` component

**Files:**
- Create: `components/question-sets/QuestionManagerSheet.tsx`

**Context:** This is a side Sheet showing all questions in a set. Each question row has Edit (opens inline Dialog) and Delete (opens DeleteConfirmDialog) buttons using FaIcon. The edit Dialog shows all question fields in 3 tabs. Uses shadcn Sheet (installed in Task 1), Dialog, Tabs.

**Step 1: Create `components/question-sets/QuestionManagerSheet.tsx`**

```tsx
"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FaIcon } from "@/components/ui/fa-icon";
import {
  faPencil,
  faTrash,
  faFloppyDisk,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";
import { getQuestionsBySetId, updateQuestion, deleteQuestion } from "@/lib/db";
import { Question, QuestionSet, QuestionType } from "@/types/gmat";
import { DeleteConfirmDialog } from "./DeleteConfirmDialog";
import { toast } from "sonner";

const QUESTION_TYPES: QuestionType[] = [
  "Problem Solving",
  "Data Sufficiency",
  "Critical Reasoning",
  "Reading Comprehension",
  "Multi-Source Reasoning",
  "Table Analysis",
  "Graphics Interpretation",
  "Two-Part Analysis",
];

interface QuestionManagerSheetProps {
  open: boolean;
  questionSet: QuestionSet | null;
  onClose: () => void;
  onChanged: () => void;
}

export function QuestionManagerSheet({
  open,
  questionSet,
  onClose,
  onChanged,
}: QuestionManagerSheetProps) {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);
  const [deletingQuestion, setDeletingQuestion] = useState<Question | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const loadQuestions = useCallback(async () => {
    if (!questionSet) return;
    setLoading(true);
    try {
      const qs = await getQuestionsBySetId(questionSet.id);
      setQuestions(qs);
    } catch (err) {
      toast.error(`Failed to load questions: ${err}`);
    } finally {
      setLoading(false);
    }
  }, [questionSet]);

  useEffect(() => {
    if (open && questionSet) {
      loadQuestions();
    }
  }, [open, questionSet, loadQuestions]);

  async function handleDeleteQuestion() {
    if (!deletingQuestion) return;
    setDeleteLoading(true);
    try {
      await deleteQuestion(deletingQuestion.id);
      setQuestions((prev) => prev.filter((q) => q.id !== deletingQuestion.id));
      setDeletingQuestion(null);
      onChanged();
      toast.success(`Question ${deletingQuestion.question_number} deleted`);
    } catch (err) {
      toast.error(`Failed to delete: ${err}`);
    } finally {
      setDeleteLoading(false);
    }
  }

  return (
    <>
      <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
        <SheetContent
          side="right"
          className="w-full sm:max-w-2xl bg-slate-900 border-slate-700 overflow-y-auto"
        >
          <SheetHeader className="mb-4">
            <SheetTitle className="text-base">
              {questionSet?.name}
              <Badge variant="outline" className="ml-2 border-slate-600 text-xs font-normal">
                {questions.length} questions
              </Badge>
            </SheetTitle>
          </SheetHeader>

          {loading ? (
            <p className="text-sm text-muted-foreground animate-pulse">Loading…</p>
          ) : questions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No questions in this set.</p>
          ) : (
            <div className="space-y-2">
              {questions.map((q) => (
                <div
                  key={q.id}
                  className="flex items-center gap-3 p-3 rounded-lg bg-slate-800/50 border border-slate-700/50"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-xs font-medium text-slate-400">Q{q.question_number}</span>
                      <Badge variant="outline" className="text-xs border-slate-600 py-0">
                        {q.question_type}
                      </Badge>
                      {q.difficulty && (
                        <span className="text-xs text-slate-500">{q.difficulty}</span>
                      )}
                    </div>
                    <p className="text-sm line-clamp-1 text-slate-200">{q.stem}</p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-slate-400 hover:text-blue-400"
                      onClick={() => setEditingQuestion(q)}
                    >
                      <FaIcon icon={faPencil} className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-slate-400 hover:text-red-400"
                      onClick={() => setDeletingQuestion(q)}
                    >
                      <FaIcon icon={faTrash} className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Question Edit Dialog */}
      {editingQuestion && (
        <QuestionEditDialog
          question={editingQuestion}
          onClose={() => setEditingQuestion(null)}
          onSaved={(updated) => {
            setQuestions((prev) =>
              prev.map((q) => (q.id === editingQuestion.id ? { ...q, ...updated } : q))
            );
            setEditingQuestion(null);
            onChanged();
          }}
        />
      )}

      {/* Delete Confirm */}
      <DeleteConfirmDialog
        open={!!deletingQuestion}
        title="Delete Question"
        description={`Delete Question ${deletingQuestion?.question_number}? This cannot be undone.`}
        onConfirm={handleDeleteQuestion}
        onCancel={() => setDeletingQuestion(null)}
        loading={deleteLoading}
      />
    </>
  );
}

// ── Inline question edit dialog ────────────────────────────────────────────────

interface QuestionEditDialogProps {
  question: Question;
  onClose: () => void;
  onSaved: (updates: Partial<Question>) => void;
}

function QuestionEditDialog({ question, onClose, onSaved }: QuestionEditDialogProps) {
  const [saving, setSaving] = useState(false);

  // Metadata tab
  const [questionNumber, setQuestionNumber] = useState(String(question.question_number));
  const [difficulty, setDifficulty] = useState(String(question.difficulty ?? ""));
  const [questionType, setQuestionType] = useState<QuestionType>(question.question_type);
  const [topic, setTopic] = useState(question.topic ?? "");

  // Content tab
  const [stem, setStem] = useState(question.stem);
  const [statement1, setStatement1] = useState(question.statement1 ?? "");
  const [statement2, setStatement2] = useState(question.statement2 ?? "");
  const [choiceA, setChoiceA] = useState(question.choice_a);
  const [choiceB, setChoiceB] = useState(question.choice_b);
  const [choiceC, setChoiceC] = useState(question.choice_c);
  const [choiceD, setChoiceD] = useState(question.choice_d);
  const [choiceE, setChoiceE] = useState(question.choice_e);
  const [correctAnswer, setCorrectAnswer] = useState(question.correct_answer);
  const [explanation, setExplanation] = useState(question.explanation ?? "");

  // Type-specific tab
  const [col1Label, setCol1Label] = useState(question.two_part_col1_label ?? "");
  const [col2Label, setCol2Label] = useState(question.two_part_col2_label ?? "");
  const [correctAnswer2, setCorrectAnswer2] = useState(question.correct_answer2 ?? "");
  const [s1Verdict, setS1Verdict] = useState(question.s1_verdict ?? "");
  const [s2Verdict, setS2Verdict] = useState(question.s2_verdict ?? "");
  const [reasoning, setReasoning] = useState(question.reasoning ?? "");

  async function handleSave() {
    setSaving(true);
    try {
      const updates: Partial<Question> = {
        question_number: Number(questionNumber),
        difficulty: difficulty ? Number(difficulty) : undefined,
        question_type: questionType,
        topic: topic || undefined,
        stem,
        statement1: statement1 || undefined,
        statement2: statement2 || undefined,
        choice_a: choiceA,
        choice_b: choiceB,
        choice_c: choiceC,
        choice_d: choiceD,
        choice_e: choiceE,
        correct_answer: correctAnswer,
        explanation: explanation || undefined,
        two_part_col1_label: col1Label || undefined,
        two_part_col2_label: col2Label || undefined,
        correct_answer2: correctAnswer2 || undefined,
        s1_verdict: s1Verdict || undefined,
        s2_verdict: s2Verdict || undefined,
        reasoning: reasoning || undefined,
      };
      await updateQuestion(question.id, updates);
      onSaved(updates);
      toast.success(`Question ${questionNumber} updated`);
    } catch (err) {
      toast.error(`Failed to save: ${err}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto bg-slate-900 border-slate-700">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span>Edit Question {question.question_number}</span>
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="h-7 w-7 text-slate-400 hover:text-white"
            >
              <FaIcon icon={faXmark} className="h-4 w-4" />
            </Button>
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="content">
          <TabsList className="mb-4 bg-slate-800">
            <TabsTrigger value="metadata">Metadata</TabsTrigger>
            <TabsTrigger value="content">Content</TabsTrigger>
            <TabsTrigger value="type-specific">Type-Specific</TabsTrigger>
          </TabsList>

          {/* Metadata Tab */}
          <TabsContent value="metadata" className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Question Number</Label>
                <Input
                  type="number"
                  value={questionNumber}
                  onChange={(e) => setQuestionNumber(e.target.value)}
                  className="bg-slate-800/50 border-slate-700"
                />
              </div>
              <div className="space-y-1">
                <Label>Difficulty (GMAT scale)</Label>
                <Input
                  type="number"
                  value={difficulty}
                  onChange={(e) => setDifficulty(e.target.value)}
                  className="bg-slate-800/50 border-slate-700"
                  placeholder="e.g. 650"
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Question Type</Label>
              <Select value={questionType} onValueChange={(v) => setQuestionType(v as QuestionType)}>
                <SelectTrigger className="bg-slate-800/50 border-slate-700">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {QUESTION_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Topic</Label>
              <Input
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                className="bg-slate-800/50 border-slate-700"
                placeholder="e.g. Algebra"
              />
            </div>
          </TabsContent>

          {/* Content Tab */}
          <TabsContent value="content" className="space-y-4">
            <div className="space-y-1">
              <Label>Stem *</Label>
              <Textarea
                value={stem}
                onChange={(e) => setStem(e.target.value)}
                className="bg-slate-800/50 border-slate-700 min-h-[80px]"
              />
            </div>
            {(questionType === "Data Sufficiency") && (
              <>
                <div className="space-y-1">
                  <Label>Statement 1</Label>
                  <Textarea
                    value={statement1}
                    onChange={(e) => setStatement1(e.target.value)}
                    className="bg-slate-800/50 border-slate-700"
                  />
                </div>
                <div className="space-y-1">
                  <Label>Statement 2</Label>
                  <Textarea
                    value={statement2}
                    onChange={(e) => setStatement2(e.target.value)}
                    className="bg-slate-800/50 border-slate-700"
                  />
                </div>
              </>
            )}
            {["A", "B", "C", "D", "E"].map((letter) => {
              const val = { A: choiceA, B: choiceB, C: choiceC, D: choiceD, E: choiceE }[letter]!;
              const setter = { A: setChoiceA, B: setChoiceB, C: setChoiceC, D: setChoiceD, E: setChoiceE }[letter]!;
              return (
                <div key={letter} className="space-y-1">
                  <Label>Choice {letter}</Label>
                  <Input
                    value={val}
                    onChange={(e) => setter(e.target.value)}
                    className="bg-slate-800/50 border-slate-700"
                  />
                </div>
              );
            })}
            <div className="space-y-1">
              <Label>Correct Answer</Label>
              <Select value={correctAnswer} onValueChange={setCorrectAnswer}>
                <SelectTrigger className="bg-slate-800/50 border-slate-700">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["A", "B", "C", "D", "E"].map((l) => (
                    <SelectItem key={l} value={l}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Explanation</Label>
              <Textarea
                value={explanation}
                onChange={(e) => setExplanation(e.target.value)}
                className="bg-slate-800/50 border-slate-700"
              />
            </div>
          </TabsContent>

          {/* Type-Specific Tab */}
          <TabsContent value="type-specific" className="space-y-4">
            {questionType === "Two-Part Analysis" && (
              <>
                <div className="space-y-1">
                  <Label>Column 1 Label (Part 1)</Label>
                  <Input
                    value={col1Label}
                    onChange={(e) => setCol1Label(e.target.value)}
                    className="bg-slate-800/50 border-slate-700"
                    placeholder="e.g. Team X wins"
                  />
                </div>
                <div className="space-y-1">
                  <Label>Column 2 Label (Part 2)</Label>
                  <Input
                    value={col2Label}
                    onChange={(e) => setCol2Label(e.target.value)}
                    className="bg-slate-800/50 border-slate-700"
                    placeholder="e.g. Team Y wins"
                  />
                </div>
                <div className="space-y-1">
                  <Label>Correct Answer Part 2</Label>
                  <Select value={correctAnswer2} onValueChange={setCorrectAnswer2}>
                    <SelectTrigger className="bg-slate-800/50 border-slate-700">
                      <SelectValue placeholder="Select…" />
                    </SelectTrigger>
                    <SelectContent>
                      {["A", "B", "C", "D", "E"].map((l) => (
                        <SelectItem key={l} value={l}>{l}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}
            {questionType === "Data Sufficiency" && (
              <>
                <div className="space-y-1">
                  <Label>Statement 1 Verdict</Label>
                  <Input
                    value={s1Verdict}
                    onChange={(e) => setS1Verdict(e.target.value)}
                    className="bg-slate-800/50 border-slate-700"
                    placeholder="sufficient / not sufficient"
                  />
                </div>
                <div className="space-y-1">
                  <Label>Statement 2 Verdict</Label>
                  <Input
                    value={s2Verdict}
                    onChange={(e) => setS2Verdict(e.target.value)}
                    className="bg-slate-800/50 border-slate-700"
                  />
                </div>
                <div className="space-y-1">
                  <Label>Reasoning</Label>
                  <Textarea
                    value={reasoning}
                    onChange={(e) => setReasoning(e.target.value)}
                    className="bg-slate-800/50 border-slate-700"
                  />
                </div>
              </>
            )}
            {!["Two-Part Analysis", "Data Sufficiency"].includes(questionType) && (
              <p className="text-sm text-muted-foreground">
                No type-specific fields for {questionType}.
              </p>
            )}
          </TabsContent>
        </Tabs>

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={onClose} disabled={saving} className="border-slate-600">
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving || !stem.trim()}
            className="bg-blue-600 hover:bg-blue-700"
          >
            <FaIcon icon={faFloppyDisk} className="mr-2 h-4 w-4" />
            {saving ? "Saving…" : "Save Question"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

**Step 2: Commit**

```bash
git add components/question-sets/QuestionManagerSheet.tsx
git commit -m "feat: add QuestionManagerSheet for per-question edit/delete"
```

---

## Task 6: Wire CRUD into `app/page.tsx`

**Files:**
- Modify: `app/page.tsx`

**Context:** The dashboard's `renderSetCard` function renders each set card. We need to:
1. Import the 3 new components + `DropdownMenu` + new db functions + new FaIcons
2. Add CRUD state to `DashboardPage` (which set is selected for which action)
3. Update `renderSetCard` to include a kebab menu button (`⋯`) that opens the dropdown
4. Render the 3 modal/sheet components at the bottom of the JSX
5. Update `sets` state when a set is edited/deleted (re-fetch or mutate locally)

**Step 1: Add imports at top of `app/page.tsx`**

After the existing FaIcon imports (`faFile` is last), add:
```typescript
import {
  faEllipsisVertical,
  faPencil,
  faTrash,
  faListUl,
} from "@fortawesome/free-solid-svg-icons";
```

After existing db import line `import { getQuestionSets, getAllSessions, getAllResponses } from "@/lib/db";`, add:
```typescript
import { deleteQuestionSet } from "@/lib/db";
```

After existing component imports, add:
```typescript
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SetEditModal } from "@/components/question-sets/SetEditModal";
import { QuestionManagerSheet } from "@/components/question-sets/QuestionManagerSheet";
import { DeleteConfirmDialog } from "@/components/question-sets/DeleteConfirmDialog";
import { QuestionSet } from "@/types/gmat";  // already imported — ensure it's there
```

**Step 2: Add CRUD state variables to `DashboardPage` (after existing state)**

After `const [timeFilter, setTimeFilter] = useState<TimeFilter>("all");`, add:
```typescript
const [editingSet, setEditingSet] = useState<QuestionSet | null>(null);
const [managingSet, setManagingSet] = useState<QuestionSet | null>(null);
const [deletingSet, setDeletingSet] = useState<QuestionSet | null>(null);
const [deleteSetLoading, setDeleteSetLoading] = useState(false);
```

**Step 3: Add `handleDeleteSet` function in `DashboardPage` (after `getLastScore`)**

```typescript
async function handleDeleteSet() {
  if (!deletingSet) return;
  setDeleteSetLoading(true);
  try {
    await deleteQuestionSet(deletingSet.id);
    setSets((prev) => prev.filter((s) => s.id !== deletingSet.id));
    setDeletingSet(null);
    toast.success("Question set deleted");
  } catch (err) {
    toast.error(`Failed to delete: ${err}`);
  } finally {
    setDeleteSetLoading(false);
  }
}
```

Note: `toast` is already used elsewhere but needs to be imported — check if `import { toast } from "sonner";` is present. If not, add it.

**Step 4: Update `renderSetCard` — add kebab menu to the card header**

Locate the existing header `div` inside `renderSetCard`:
```tsx
<div className="flex items-start justify-between">
  <CardTitle className="text-base font-semibold line-clamp-2">
    {qs.name}
  </CardTitle>
  {lastScore && (
    <Badge ...>
      {lastScore.correct}/{lastScore.total}
    </Badge>
  )}
</div>
```

Replace with:
```tsx
<div className="flex items-start justify-between">
  <CardTitle className="text-base font-semibold line-clamp-2 flex-1 mr-2">
    {qs.name}
  </CardTitle>
  <div className="flex items-center gap-2 shrink-0">
    {lastScore && (
      <Badge
        variant={lastScore.correct / lastScore.total >= 0.7 ? "default" : "destructive"}
        className="shrink-0"
      >
        {lastScore.correct}/{lastScore.total}
      </Badge>
    )}
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-slate-400 hover:text-white"
          onClick={(e) => e.preventDefault()}
        >
          <FaIcon icon={faEllipsisVertical} className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="bg-slate-900 border-slate-700">
        <DropdownMenuItem
          onClick={() => setEditingSet(qs)}
          className="cursor-pointer text-slate-200 hover:bg-slate-800 focus:bg-slate-800"
        >
          <FaIcon icon={faPencil} className="mr-2 h-4 w-4 text-blue-400" />
          Edit Set Info
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => setManagingSet(qs)}
          className="cursor-pointer text-slate-200 hover:bg-slate-800 focus:bg-slate-800"
        >
          <FaIcon icon={faListUl} className="mr-2 h-4 w-4 text-green-400" />
          Manage Questions
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => setDeletingSet(qs)}
          className="cursor-pointer text-red-400 hover:bg-slate-800 focus:bg-slate-800"
        >
          <FaIcon icon={faTrash} className="mr-2 h-4 w-4" />
          Delete Set
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  </div>
</div>
```

**Step 5: Add modal/sheet components before the closing `</div>` of the return**

At the very bottom of the return, before the final `</div>`:
```tsx
{/* CRUD modals */}
<SetEditModal
  open={!!editingSet}
  questionSet={editingSet}
  onClose={() => setEditingSet(null)}
  onSaved={(updated) =>
    setSets((prev) =>
      prev.map((s) => (s.id === editingSet?.id ? { ...s, ...updated } : s))
    )
  }
/>
<QuestionManagerSheet
  open={!!managingSet}
  questionSet={managingSet}
  onClose={() => setManagingSet(null)}
  onChanged={() => {/* question count may change — optionally re-fetch */}}
/>
<DeleteConfirmDialog
  open={!!deletingSet}
  title="Delete Question Set"
  description={`Delete "${deletingSet?.name}" and all its questions? This cannot be undone.`}
  onConfirm={handleDeleteSet}
  onCancel={() => setDeletingSet(null)}
  loading={deleteSetLoading}
/>
```

**Step 6: Verify build**

```bash
npm run build 2>&1 | head -50
```

Expected: no TypeScript errors.

**Step 7: Commit**

```bash
git add app/page.tsx
git commit -m "feat: add CRUD kebab menu to dashboard question set cards"
```

---

## Task 7: Create MCP `crud.ts` tools

**Files:**
- Create: `mcp-server/src/tools/crud.ts`

**Step 1: Create `mcp-server/src/tools/crud.ts`**

```typescript
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
    async ({ setId, confirm: _ }) => {
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
    'Update fields of a specific question. Use get_question_sets + get_questions (or list from the web app) to find question IDs.',
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
    'Permanently delete a single question from a set. The set\'s total_questions count will be decremented automatically.',
    {
      questionId: z.string().uuid().describe('UUID of the question to delete'),
      confirm: z.literal(true).describe('Must be true to confirm deletion'),
    },
    async ({ questionId, confirm: _ }) => {
      try {
        // Get set_id before deleting (to update count)
        const { data: qData } = await supabase
          .from('questions')
          .select('set_id')
          .eq('id', questionId)
          .single();

        const { error } = await supabase.from('questions').delete().eq('id', questionId);
        if (error) return errorResult(error.message);

        // Update total_questions count
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
```

**Step 2: Commit**

```bash
git add mcp-server/src/tools/crud.ts
git commit -m "feat: add CRUD MCP tools for question set and question management"
```

---

## Task 8: Register CRUD tools in `mcp-server/src/index.ts`

**Files:**
- Modify: `mcp-server/src/index.ts`

**Step 1: Add import**

After `import { registerDIWriteTools } from './tools/di-write.js';`, add:
```typescript
import { registerCrudTools } from './tools/crud.js';
```

**Step 2: Register the tools**

After `registerDIWriteTools(server, supabase);`, add:
```typescript
registerCrudTools(server, supabase);
```

**Step 3: Update tool count in log message**

Change:
```typescript
process.stderr.write('GMAT Coach MCP server started. 18 tools ready.\n');
```
To:
```typescript
process.stderr.write('GMAT Coach MCP server started. 22 tools ready.\n');
```

**Step 4: Verify TypeScript compiles**

```bash
cd /Users/hoangtv/gmat-web/mcp-server
npm run build 2>&1 | head -30
```

Expected: no errors.

**Step 5: Commit**

```bash
cd /Users/hoangtv/gmat-web
git add mcp-server/src/index.ts
git commit -m "feat: register CRUD tools in MCP server (22 tools total)"
```

---

## Task 9: Final build verification

**Step 1: Build the Next.js app**

```bash
cd /Users/hoangtv/gmat-web
npm run build 2>&1 | tail -20
```

Expected: no errors. Warnings are acceptable.

**Step 2: Lint**

```bash
npm run lint 2>&1 | head -30
```

Expected: no errors (warnings acceptable).

**Step 3: Final commit if any lint fixes needed**

```bash
git add -A
git commit -m "fix: resolve any lint issues from CRUD implementation"
```
