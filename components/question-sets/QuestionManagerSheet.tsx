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

interface QuestionEditDialogProps {
  question: Question;
  onClose: () => void;
  onSaved: (updates: Partial<Question>) => void;
}

function QuestionEditDialog({ question, onClose, onSaved }: QuestionEditDialogProps) {
  const [saving, setSaving] = useState(false);

  const [questionNumber, setQuestionNumber] = useState(String(question.question_number));
  const [difficulty, setDifficulty] = useState(String(question.difficulty ?? ""));
  const [questionType, setQuestionType] = useState<QuestionType>(question.question_type);
  const [topic, setTopic] = useState(question.topic ?? "");

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

  const choiceSetters: Record<string, (v: string) => void> = {
    A: setChoiceA, B: setChoiceB, C: setChoiceC, D: setChoiceD, E: setChoiceE,
  };
  const choiceValues: Record<string, string> = {
    A: choiceA, B: choiceB, C: choiceC, D: choiceD, E: choiceE,
  };

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

          <TabsContent value="content" className="space-y-4">
            <div className="space-y-1">
              <Label>Stem *</Label>
              <Textarea
                value={stem}
                onChange={(e) => setStem(e.target.value)}
                className="bg-slate-800/50 border-slate-700 min-h-[80px]"
              />
            </div>
            {questionType === "Data Sufficiency" && (
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
            {["A", "B", "C", "D", "E"].map((letter) => (
              <div key={letter} className="space-y-1">
                <Label>Choice {letter}</Label>
                <Input
                  value={choiceValues[letter]}
                  onChange={(e) => choiceSetters[letter](e.target.value)}
                  className="bg-slate-800/50 border-slate-700"
                />
              </div>
            ))}
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
