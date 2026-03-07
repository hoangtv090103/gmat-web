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
