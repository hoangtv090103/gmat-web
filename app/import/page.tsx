"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { parseGMATDocument } from "@/lib/parsers/questionParser";
import { parseDocxFile } from "@/lib/parsers/docxParser";
import { parsePdfFile } from "@/lib/parsers/pdfParser";
import { saveQuestionSet } from "@/lib/db";
import { ParseResult, ParsedQuestion, QuestionType } from "@/types/gmat";
import {
  faArrowLeft,
  faCircleCheck,
  faFile,
  faFolderOpen,
  faSpinner,
  faTriangleExclamation,
} from "@fortawesome/free-solid-svg-icons";
import { FaIcon } from "@/components/ui/fa-icon";

export default function ImportPage() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);

  const handleFile = useCallback(async (f: File) => {
    setFile(f);
    setError(null);
    setParseResult(null);
    setParsing(true);

    try {
      let result: ParseResult;
      const ext = f.name.split(".").pop()?.toLowerCase();

      if (ext === "docx") {
        result = await parseDocxFile(f);
      } else if (ext === "pdf") {
        result = await parsePdfFile(f);
      } else if (ext === "txt" || ext === "md") {
        const text = await f.text();
        result = parseGMATDocument(text);
      } else {
        throw new Error(
          `Unsupported file type: .${ext}. Use .docx, .pdf, or .txt`,
        );
      }

      if (result.questions.length === 0) {
        throw new Error("No questions found in file. Please check the format.");
      }

      setParseResult(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to parse file");
    } finally {
      setParsing(false);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragActive(false);
      const f = e.dataTransfer.files[0];
      if (f) handleFile(f);
    },
    [handleFile],
  );

  const handleSave = async () => {
    if (!parseResult || !file) return;
    setSaving(true);
    setError(null);

    try {
      const { header, questions } = parseResult;
      await saveQuestionSet(
        {
          name:
            header.section || header.title || file.name.replace(/\.[^.]+$/, ""),
          section: header.section,
          difficulty_range: header.difficulty_range,
          topics: header.topics,
          target: header.target,
          total_questions: questions.length,
          source_filename: file.name,
          study_date: header.date,
        },
        questions.map((q) => ({
          question_number: q.question_number,
          difficulty: q.difficulty,
          question_type: q.question_type as QuestionType,
          topic: q.topic,
          stem: q.stem,
          statement1: q.statement1,
          statement2: q.statement2,
          choice_a: q.choices.A,
          choice_b: q.choices.B,
          choice_c: q.choices.C,
          choice_d: q.choices.D,
          choice_e: q.choices.E,
          correct_answer: q.correct_answer,
          explanation: q.explanation,
          s1_verdict: q.s1_verdict,
          s2_verdict: q.s2_verdict,
          reasoning: q.reasoning,
        })),
      );

      router.push("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen p-6 max-w-4xl mx-auto">
      {/* Header */}
      <header className="mb-8 animate-fade-in">
        <Button
          variant="ghost"
          onClick={() => router.push("/")}
          className="mb-4 text-muted-foreground hover:text-foreground"
        >
          <FaIcon icon={faArrowLeft} className="mr-2 h-3.5 w-3.5" />
          Back to Dashboard
        </Button>
        <h1 className="text-2xl font-bold">Import Question Set</h1>
        <p className="text-muted-foreground mt-1">
          Upload a GMAT question file (.docx, .pdf, .txt) to import questions
        </p>
      </header>

      {/* Dropzone */}
      <div
        className={`
          border-2 border-dashed rounded-xl p-12 text-center mb-6 transition-all duration-200 cursor-pointer
          ${dragActive ? "border-blue-500 bg-blue-500/10" : "border-blue-500/20 hover:border-blue-500/40"}
          ${file ? "border-green-500/40" : ""}
        `}
        onDragOver={(e) => {
          e.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={handleDrop}
        onClick={() => document.getElementById("file-input")?.click()}
      >
        <input
          id="file-input"
          type="file"
          accept=".docx,.pdf,.txt,.md"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
          }}
        />
        <div className="text-5xl mb-4 flex justify-center">
          {file ? (
            <FaIcon icon={faCircleCheck} className="h-10 w-10 text-emerald-400" />
          ) : dragActive ? (
            <FaIcon icon={faFolderOpen} className="h-10 w-10 text-blue-400" />
          ) : (
            <FaIcon icon={faFile} className="h-10 w-10 text-slate-400" />
          )}
        </div>
        <p className="text-lg font-medium mb-2">
          {file ? file.name : "Drop your GMAT file here"}
        </p>
        <p className="text-sm text-muted-foreground">
          {file
            ? `${(file.size / 1024).toFixed(1)} KB`
            : "or click to browse — supports .docx, .pdf, .txt"}
        </p>
      </div>

      {/* Parsing Progress */}
      {parsing && (
        <Card className="glass-card mb-6 animate-fade-in">
          <CardContent className="py-6">
            <div className="flex items-center gap-3 mb-3">
              <FaIcon icon={faSpinner} className="h-4 w-4 text-slate-300" spin />
              <span>Parsing questions...</span>
            </div>
            <Progress value={50} className="h-2" />
          </CardContent>
        </Card>
      )}

      {/* Error */}
      {error && (
        <Card className="border-red-500/30 bg-red-500/5 mb-6 animate-fade-in">
          <CardContent className="py-4">
            <p className="text-red-400">{error}</p>
          </CardContent>
        </Card>
      )}

      {/* Parse Result Preview */}
      {parseResult && (
        <div className="space-y-6 animate-slide-up">
          {/* Summary */}
          <Card className="glass-card">
            <CardHeader>
              <CardTitle className="text-lg flex items-center justify-between">
                <span>Parse Results</span>
                <div className="flex gap-2">
                  <Badge className="bg-green-600">
                    {parseResult.questions.length} parsed
                  </Badge>
                  {parseResult.errors.length > 0 && (
                    <Badge variant="destructive">
                      {parseResult.errors.length} errors
                    </Badge>
                  )}
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Section:</span>
                  <p className="font-medium">
                    {parseResult.header.section || "N/A"}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">Difficulty:</span>
                  <p className="font-medium">
                    {parseResult.header.difficulty_range || "N/A"}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">Topics:</span>
                  <p className="font-medium">
                    {parseResult.header.topics || "N/A"}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">Date:</span>
                  <p className="font-medium">
                    {parseResult.header.date || "N/A"}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Question Preview (first 3) */}
          <div>
            <h3 className="text-lg font-semibold mb-3">
              Preview ({Math.min(3, parseResult.questions.length)} of{" "}
              {parseResult.questions.length})
            </h3>
            <div className="space-y-3">
              {parseResult.questions.slice(0, 3).map((q: ParsedQuestion) => (
                <Card key={q.question_number} className="glass-card">
                  <CardContent className="py-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge
                        variant="outline"
                        className="border-blue-500/30 text-blue-400"
                      >
                        Q{q.question_number}
                      </Badge>
                      <Badge variant="outline" className="border-slate-500/30">
                        {q.difficulty}
                      </Badge>
                      <Badge
                        variant="outline"
                        className="border-purple-500/30 text-purple-400"
                      >
                        {q.topic || q.question_type}
                      </Badge>
                      {q.correct_answer && (
                        <Badge className="bg-green-600/20 text-green-400 ml-auto">
                          <FaIcon icon={faCircleCheck} className="mr-2 h-3 w-3" />
                          {q.correct_answer}
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm leading-relaxed line-clamp-3">
                      {q.stem}
                    </p>
                    <div className="mt-2 grid grid-cols-1 gap-1 text-xs text-muted-foreground">
                      {["A", "B", "C", "D", "E"].map((letter) => {
                        const choice =
                          q.choices[letter as keyof typeof q.choices];
                        if (!choice) return null;
                        return (
                          <div
                            key={letter}
                            className={`truncate ${letter === q.correct_answer ? "text-green-400 font-medium" : ""}`}
                          >
                            ({letter}) {choice.substring(0, 80)}
                            {choice.length > 80 ? "..." : ""}
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          {/* Parse Errors */}
          {parseResult.errors.length > 0 && (
            <Card className="border-yellow-500/30 bg-yellow-500/5">
              <CardHeader>
                <CardTitle className="text-sm text-yellow-400">
                  <span className="inline-flex items-center gap-2">
                    <FaIcon icon={faTriangleExclamation} className="h-4 w-4" />
                    Parse Warnings ({parseResult.errors.length})
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 text-xs text-muted-foreground">
                  {parseResult.errors.map((err, i) => (
                    <div key={i} className="flex gap-2">
                      <span className="text-yellow-400 shrink-0">•</span>
                      <span>
                        {err.message}{" "}
                        {err.raw ? `— "${err.raw.substring(0, 50)}..."` : ""}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Save Button */}
          <div className="flex justify-end gap-3">
            <Button
              variant="outline"
              onClick={() => {
                setParseResult(null);
                setFile(null);
              }}
            >
              Cancel
            </Button>
            <Button
              className="bg-blue-600 hover:bg-blue-700 shadow-lg shadow-blue-600/20 px-8"
              onClick={handleSave}
              disabled={saving}
            >
              {saving
                ? "Saving..."
                : `Save ${parseResult.questions.length} Questions`}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
