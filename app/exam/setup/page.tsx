"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { getQuestionsBySetId, getQuestionSets, createSession } from "@/lib/db";
import { QuestionSet, Question, ExamMode } from "@/types/gmat";
import { useExamStore } from "@/store/examStore";
import { Suspense } from "react";
import {
  faArrowLeft,
  faArrowRight,
  faClock,
  faEye,
  faPen,
  faSpinner,
} from "@fortawesome/free-solid-svg-icons";
import { FaIcon } from "@/components/ui/fa-icon";

function ExamSetupContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const setId = searchParams.get("setId");
  const modeParam = (searchParams.get("mode") as ExamMode) || "timed";

  const [questionSet, setQuestionSet] = useState<QuestionSet | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [mode, setMode] = useState<ExamMode>(modeParam);
  const [minutesPerQuestion, setMinutesPerQuestion] = useState(2);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);

  const initSession = useExamStore((s) => s.initSession);

  useEffect(() => {
    async function load() {
      if (!setId) return;
      try {
        const sets = await getQuestionSets();
        const qs = sets.find((s) => s.id === setId);
        if (qs) setQuestionSet(qs);

        const q = await getQuestionsBySetId(setId);
        setQuestions(q);
      } catch (e) {
        console.error("Failed to load:", e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [setId]);

  const handleStart = async () => {
    if (!setId || questions.length === 0) return;
    setStarting(true);

    try {
      const totalTimeMs =
        mode === "timed"
          ? minutesPerQuestion * 60 * 1000 * questions.length
          : 0;

      const sessionId = await createSession({
        set_id: setId,
        mode,
        total_count: questions.length,
      });

      initSession({
        sessionId,
        setId,
        mode,
        questions,
        totalTimeMs,
      });

      router.push(`/exam/${sessionId}`);
    } catch (e) {
      console.error("Failed to start session:", e);
      setStarting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!questionSet || questions.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="glass-card max-w-md">
          <CardContent className="py-8 text-center">
            <p className="text-lg mb-4">Question set not found</p>
            <Button onClick={() => router.push("/")}>Back to Dashboard</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const totalMinutes = minutesPerQuestion * questions.length;

  return (
    <div className="min-h-screen p-6 max-w-2xl mx-auto">
      <Button
        variant="ghost"
        onClick={() => router.push("/")}
        className="mb-6 text-muted-foreground"
      >
        <FaIcon icon={faArrowLeft} className="mr-2 h-3.5 w-3.5" />
        Back
      </Button>

      <Card className="glass-card animate-slide-up">
        <CardHeader>
          <CardTitle className="text-xl">Start Exam</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Set Info */}
          <div className="glass rounded-lg p-4 space-y-2">
            <h3 className="font-semibold">{questionSet.name}</h3>
            <div className="flex flex-wrap gap-2 text-sm">
              {questionSet.difficulty_range && (
                <Badge
                  variant="outline"
                  className="border-blue-500/30 text-blue-400"
                >
                  {questionSet.difficulty_range}
                </Badge>
              )}
              <Badge variant="outline">{questions.length} questions</Badge>
              {questionSet.topics && (
                <span className="text-muted-foreground">
                  {questionSet.topics}
                </span>
              )}
            </div>
          </div>

          {/* Mode Selection */}
          <div>
            <Label className="text-sm font-medium mb-3 block">Exam Mode</Label>
            <div className="grid grid-cols-3 gap-3">
              {(
                [
                  {
                    value: "timed",
                    label: "Timed",
                    icon: faClock,
                    desc: "Countdown timer, real exam conditions",
                    color: "blue",
                  },
                  {
                    value: "practice",
                    label: "Practice",
                    icon: faPen,
                    desc: "Count-up timer, see answers per Q",
                    color: "green",
                  },
                  {
                    value: "review",
                    label: "Review",
                    icon: faEye,
                    desc: "No timer, all answers visible",
                    color: "purple",
                  },
                ] as const
              ).map((m) => (
                <button
                  key={m.value}
                  onClick={() => setMode(m.value)}
                  className={`
                    p-4 rounded-lg border text-left transition-all duration-200
                    ${
                      mode === m.value
                        ? `border-${m.color}-500 bg-${m.color}-500/10 shadow-lg`
                        : "border-slate-700 hover:border-slate-600"
                    }
                  `}
                  style={
                    mode === m.value
                      ? {
                          borderColor:
                            m.color === "blue"
                              ? "#3B82F6"
                              : m.color === "green"
                                ? "#10B981"
                                : "#8B5CF6",
                          backgroundColor:
                            m.color === "blue"
                              ? "rgba(59,130,246,0.1)"
                              : m.color === "green"
                                ? "rgba(16,185,129,0.1)"
                                : "rgba(139,92,246,0.1)",
                        }
                      : {}
                  }
                >
                  <div className="text-lg mb-1 flex items-center gap-2">
                    <FaIcon icon={m.icon} className="h-4 w-4 text-slate-200" />
                    {m.label}
                  </div>
                  <div className="text-xs text-muted-foreground">{m.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Time Per Question (timed only) */}
          {mode === "timed" && (
            <div>
              <Label className="text-sm font-medium mb-2 block">
                Time per question (minutes)
              </Label>
              <div className="flex items-center gap-4">
                <Input
                  type="number"
                  min={1}
                  max={10}
                  value={minutesPerQuestion}
                  onChange={(e) =>
                    setMinutesPerQuestion(parseInt(e.target.value) || 2)
                  }
                  className="w-24"
                />
                <span className="text-sm text-muted-foreground">
                  Total: {totalMinutes} minutes for {questions.length} questions
                </span>
              </div>
            </div>
          )}

          {/* Start Button */}
          <Button
            className="w-full bg-blue-600 hover:bg-blue-700 h-12 text-lg shadow-lg shadow-blue-600/20"
            onClick={handleStart}
            disabled={starting}
          >
            {starting ? (
              <span className="inline-flex items-center gap-2">
                <FaIcon icon={faSpinner} className="h-4 w-4" spin />
                Starting...
              </span>
            ) : (
              <span className="inline-flex items-center gap-2">
                Start Exam <FaIcon icon={faArrowRight} className="h-4 w-4" />
              </span>
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

export default function ExamSetupPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <div className="animate-pulse text-muted-foreground">Loading...</div>
        </div>
      }
    >
      <ExamSetupContent />
    </Suspense>
  );
}
