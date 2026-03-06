"use client";

import { useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useExamStore } from "@/store/examStore";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DS_CHOICES } from "@/types/gmat";
import { updateSession, saveResponses, saveTrackingEvents } from "@/lib/db";

function formatTime(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export default function ExamPage() {
  const router = useRouter();
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sessionStartRef = useRef(0);

  const {
    sessionId,
    mode,
    questions,
    isActive,
    isSubmitted,
    currentIndex,
    questionStates,
    totalTimeMs,
    remainingTimeMs,
    timerWarnings,
    pendingEvents,
    selectAnswer,
    deselectAnswer,
    toggleFlag,
    setConfidence,
    navigateNext,
    navigateBack,
    navigateTo,
    updateTimer,
    addTimerWarning,
    trackEvent,
    submitExam,
    resetSession,
    sessionStartTime,
  } = useExamStore();

  const currentQuestion = questions[currentIndex];
  const currentState = questionStates[currentIndex] || {
    selectedAnswer: null,
    firstAnswer: null,
    answerChanges: [],
    flagged: false,
    timeSpentMs: 0,
    questionDisplayedAt: 0,
  };

  const isDS = currentQuestion?.question_type === "Data Sufficiency";
  const isReview = mode === "review";
  const isPractice = mode === "practice";

  // ─── Timer ───────────────────────────────────────────────
  useEffect(() => {
    if (!isActive || isSubmitted || isReview) return;

    sessionStartRef.current = sessionStartTime || performance.now();

    timerRef.current = setInterval(() => {
      const elapsed = performance.now() - sessionStartRef.current;
      updateTimer(elapsed);

      // Timer warnings (timed mode)
      if (mode === "timed" && totalTimeMs > 0) {
        const remaining = totalTimeMs - elapsed;
        const pct = remaining / totalTimeMs;

        if (pct <= 0.5 && !timerWarnings.has("50pct")) {
          addTimerWarning("50pct");
          trackEvent("time_warning_50pct");
        }
        if (pct <= 0.25 && !timerWarnings.has("25pct")) {
          addTimerWarning("25pct");
          trackEvent("time_warning_25pct");
        }
        if (remaining <= 30000 && !timerWarnings.has("30sec")) {
          addTimerWarning("30sec");
          trackEvent("time_warning_30sec");
        }
        if (remaining <= 0) {
          handleSubmit();
        }
      }
    }, 250);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive, isSubmitted, mode]);

  // ─── Timer Color ─────────────────────────────────────────
  const getTimerClass = () => {
    if (mode !== "timed" || totalTimeMs === 0) return "timer-normal";
    const pct = remainingTimeMs / totalTimeMs;
    if (pct <= 0 || remainingTimeMs <= 30000) return "timer-warning-critical";
    if (pct <= 0.25) return "timer-warning-25";
    if (pct <= 0.5) return "timer-warning-50";
    return "timer-normal";
  };

  // ─── Submit ──────────────────────────────────────────────
  const handleSubmit = useCallback(async () => {
    if (!sessionId) return;

    submitExam();

    // Calculate results
    const totalCorrect = questions.reduce((count, q, i) => {
      const qs = questionStates[i];
      if (qs?.selectedAnswer && qs.selectedAnswer === q.correct_answer)
        return count + 1;
      return count;
    }, 0);

    const totalTimeSeconds = Math.round(
      (performance.now() - sessionStartRef.current) / 1000,
    );

    // Save to DB
    try {
      await updateSession(sessionId, {
        completed_at: new Date().toISOString(),
        total_time_seconds: totalTimeSeconds,
        correct_count: totalCorrect,
        score: totalCorrect,
        total_count: questions.length,
      });

      const responses = questions.map((q, i) => {
        const qs = questionStates[i] || {};
        return {
          session_id: sessionId,
          question_id: q.id,
          question_order: i + 1,
          selected_answer: qs.selectedAnswer || null,
          is_correct: qs.selectedAnswer
            ? qs.selectedAnswer === q.correct_answer
            : null,
          time_spent_seconds: Math.round((qs.timeSpentMs || 0) / 1000),
          flagged_for_review: qs.flagged || false,
          answer_changes: qs.answerChanges || [],
          first_answer: qs.firstAnswer || null,
          confidence_rating: qs.confidenceRating,
        };
      });

      await saveResponses(responses);

      const events = pendingEvents.map((e) => ({
        session_id: sessionId,
        question_id: e.question_id,
        event_type: e.event_type,
        event_data: e.event_data,
        timestamp_offset_ms: e.timestamp_offset_ms,
      }));

      if (events.length > 0) {
        await saveTrackingEvents(events);
      }
    } catch (e) {
      console.error("Failed to save session data:", e);
    }

    router.push(`/results/${sessionId}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, questions, questionStates, pendingEvents, router]);

  // ─── Keyboard Shortcuts ──────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!isActive || isSubmitted) return;

      switch (e.key.toLowerCase()) {
        case "n":
        case "arrowright":
          navigateNext();
          break;
        case "b":
        case "arrowleft":
          navigateBack();
          break;
        case "f":
          toggleFlag();
          break;
        case "a":
          selectAnswer("A");
          break;
        case "s":
          selectAnswer("B");
          break;
        case "d":
          selectAnswer("C");
          break;
        case "w":
          selectAnswer("D");
          break;
        case "e":
          selectAnswer("E");
          break;
        case "1":
          setConfidence(1);
          break;
        case "2":
          setConfidence(2);
          break;
        case "3":
          setConfidence(3);
          break;
        case "4":
          setConfidence(4);
          break;
        case "5":
          setConfidence(5);
          break;
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [
    isActive,
    isSubmitted,
    navigateNext,
    navigateBack,
    toggleFlag,
    selectAnswer,
    setConfidence,
  ]);

  // ─── Redirect if no session ──────────────────────────────
  if (!sessionId || !isActive || questions.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center glass-card p-8 rounded-xl">
          <p className="text-lg mb-4">No active exam session</p>
          <Button
            onClick={() => {
              resetSession();
              router.push("/");
            }}
            className="bg-blue-600 hover:bg-blue-700"
          >
            Back to Dashboard
          </Button>
        </div>
      </div>
    );
  }

  // ─── Get answer choices ──────────────────────────────────
  const choices = isDS
    ? [
        { key: "A", text: DS_CHOICES.A },
        { key: "B", text: DS_CHOICES.B },
        { key: "C", text: DS_CHOICES.C },
        { key: "D", text: DS_CHOICES.D },
        { key: "E", text: DS_CHOICES.E },
      ]
    : [
        { key: "A", text: currentQuestion.choice_a },
        { key: "B", text: currentQuestion.choice_b },
        { key: "C", text: currentQuestion.choice_c },
        { key: "D", text: currentQuestion.choice_d },
        { key: "E", text: currentQuestion.choice_e },
      ].filter((c) => c.text);

  const answeredCount = Object.values(questionStates).filter(
    (qs) => qs.selectedAnswer !== null,
  ).length;

  return (
    <div className="min-h-screen flex flex-col bg-[#0A1628]">
      {/* ─── Top Bar ─────────────────────────────────────────── */}
      <header className="glass border-b border-blue-500/10 px-6 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <span className="text-sm font-bold text-blue-400 tracking-wider">
            GMAT FOCUS EDITION
          </span>
          <div className="h-4 w-px bg-slate-700" />
          <span className="text-sm text-muted-foreground">
            Q {currentIndex + 1} of {questions.length}
          </span>
        </div>

        <div className="flex items-center gap-4">
          {/* Flag Button */}
          <button
            onClick={toggleFlag}
            className={`
              flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-all
              ${
                currentState.flagged
                  ? "bg-yellow-500/20 text-yellow-400 border border-yellow-500/30"
                  : "text-muted-foreground hover:text-foreground hover:bg-slate-800"
              }
            `}
          >
            {currentState.flagged ? "🚩" : "⚑"} Flag
          </button>

          <div className="h-4 w-px bg-slate-700" />

          {/* Timer */}
          <div className={`text-xl font-mono font-bold ${getTimerClass()}`}>
            ⏱{" "}
            {mode === "timed"
              ? formatTime(remainingTimeMs)
              : formatTime(
                  performance.now() - (sessionStartTime || performance.now()),
                )}
          </div>
        </div>
      </header>

      {/* ─── Progress Dots ───────────────────────────────────── */}
      <div className="px-6 py-2 flex items-center gap-1.5 overflow-x-auto shrink-0 bg-[#0A1628]/80">
        {questions.map((_, i) => {
          const qs = questionStates[i];
          const isAnswered = qs?.selectedAnswer !== null;
          const isFlagged = qs?.flagged;
          const isCurrent = i === currentIndex;

          return (
            <button
              key={i}
              onClick={() => navigateTo(i)}
              className={`
                w-7 h-7 rounded-full text-xs font-medium flex items-center justify-center transition-all shrink-0
                ${
                  isCurrent
                    ? "bg-blue-600 text-white shadow-lg shadow-blue-600/30 scale-110"
                    : isAnswered
                      ? "bg-blue-500/20 text-blue-400 border border-blue-500/30"
                      : "bg-slate-800 text-slate-500 border border-slate-700"
                }
                ${isFlagged ? "ring-2 ring-yellow-500/50" : ""}
                hover:scale-105
              `}
              title={`Q${i + 1}${isFlagged ? " (flagged)" : ""}${isAnswered ? " (answered)" : ""}`}
            >
              {i + 1}
            </button>
          );
        })}
      </div>

      {/* ─── Main Content ────────────────────────────────────── */}
      <main className="flex-1 overflow-y-auto p-6 max-w-4xl mx-auto w-full">
        <div className="animate-fade-in" key={currentIndex}>
          {/* Question Header */}
          <div className="flex items-center gap-3 mb-4">
            <Badge className="bg-blue-600/20 text-blue-400 border border-blue-500/30">
              Question {currentQuestion.question_number}
            </Badge>
            <Badge
              variant="outline"
              className="border-purple-500/30 text-purple-400"
            >
              {currentQuestion.topic || currentQuestion.question_type}
            </Badge>
            <Badge variant="outline" className="border-slate-600">
              Difficulty: {currentQuestion.difficulty}
            </Badge>
          </div>

          {/* Question Stem */}
          <div className="glass rounded-xl p-6 mb-6">
            <p className="text-lg leading-relaxed whitespace-pre-wrap">
              {currentQuestion.stem}
            </p>

            {/* DS Statements */}
            {isDS &&
              (currentQuestion.statement1 || currentQuestion.statement2) && (
                <div className="mt-4 pt-4 border-t border-slate-700 space-y-2">
                  {currentQuestion.statement1 && (
                    <p className="text-base">
                      <span className="text-blue-400 font-medium">(1)</span>{" "}
                      {currentQuestion.statement1}
                    </p>
                  )}
                  {currentQuestion.statement2 && (
                    <p className="text-base">
                      <span className="text-blue-400 font-medium">(2)</span>{" "}
                      {currentQuestion.statement2}
                    </p>
                  )}
                </div>
              )}
          </div>

          {/* Separator */}
          <div className="border-t border-blue-500/10 mb-6" />

          {/* Answer Choices */}
          <div className="space-y-3 mb-6">
            {choices.map((choice) => {
              const isSelected = currentState.selectedAnswer === choice.key;
              const showResult =
                isReview ||
                (isPractice && currentState.selectedAnswer !== null);
              const isCorrect = choice.key === currentQuestion.correct_answer;

              let stateClass = "";
              if (showResult) {
                if (isCorrect) stateClass = "correct";
                else if (isSelected && !isCorrect) stateClass = "incorrect";
              } else if (isSelected) {
                stateClass = "selected";
              }

              return (
                <button
                  key={choice.key}
                  onClick={() => {
                    if (isReview) return;
                    if (isSelected && !isPractice && mode === "timed") return;
                    if (isSelected) {
                      deselectAnswer();
                    } else {
                      selectAnswer(choice.key);
                    }
                  }}
                  className={`answer-choice w-full text-left flex items-start gap-3 ${stateClass}`}
                  disabled={isReview}
                >
                  <span
                    className={`
                    w-8 h-8 shrink-0 rounded-full flex items-center justify-center text-sm font-bold border
                    ${
                      isSelected
                        ? "bg-blue-600 border-blue-500 text-white"
                        : showResult && isCorrect
                          ? "bg-green-600/20 border-green-500 text-green-400"
                          : "border-slate-600 text-slate-400"
                    }
                  `}
                  >
                    {choice.key}
                  </span>
                  <span className="pt-1 text-sm leading-relaxed">
                    {choice.text}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Confidence Rating */}
          <div className="flex items-center gap-3 mb-6">
            <span className="text-xs text-muted-foreground">Confidence:</span>
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                onClick={() => setConfidence(n)}
                className={`
                  w-8 h-8 rounded-md text-xs font-medium transition-all
                  ${
                    currentState.confidenceRating === n
                      ? "bg-blue-600 text-white"
                      : "bg-slate-800 text-slate-400 hover:bg-slate-700"
                  }
                `}
              >
                {n}
              </button>
            ))}
          </div>

          {/* Practice Mode: Show explanation after answering */}
          {isPractice &&
            currentState.selectedAnswer &&
            currentQuestion.explanation && (
              <div className="glass rounded-xl p-5 mb-6 border border-green-500/20 animate-slide-up">
                <h4 className="text-sm font-semibold text-green-400 mb-2">
                  Explanation
                </h4>
                <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
                  {currentQuestion.explanation}
                </p>
              </div>
            )}

          {/* Review Mode: Always show explanation */}
          {isReview && currentQuestion.explanation && (
            <div className="glass rounded-xl p-5 mb-6 border border-purple-500/20">
              <h4 className="text-sm font-semibold text-purple-400 mb-2">
                Explanation
              </h4>
              <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
                {currentQuestion.explanation}
              </p>
            </div>
          )}
        </div>
      </main>

      {/* ─── Bottom Bar ──────────────────────────────────────── */}
      <footer className="glass border-t border-blue-500/10 px-6 py-3 flex items-center justify-between shrink-0">
        <Button
          variant="outline"
          onClick={navigateBack}
          disabled={currentIndex === 0}
          className="border-slate-700 hover:bg-slate-800"
        >
          ← Back
        </Button>

        <span className="text-xs text-muted-foreground">
          {answeredCount}/{questions.length} answered
        </span>

        <div className="flex items-center gap-3">
          {currentIndex < questions.length - 1 ? (
            <Button
              onClick={navigateNext}
              className="bg-blue-600 hover:bg-blue-700"
            >
              Next →
            </Button>
          ) : (
            <Button
              onClick={handleSubmit}
              className="bg-green-600 hover:bg-green-700 shadow-lg shadow-green-600/20"
            >
              Submit Exam ✓
            </Button>
          )}
        </div>
      </footer>
    </div>
  );
}
