"use client";

import React, { useEffect, useRef, useState, useCallback, use } from "react";
import { useRouter } from "next/navigation";
import { useExamStore } from "@/store/examStore";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  updateResponse,
  saveResponses,
  saveTrackingEvents,
  updateSession,
} from "@/lib/db";
import { toast } from "sonner";

// ─── Per-Question Countdown Ring ─────────────────────────────

interface TimerRingProps {
  startMs: number; // performance.now() when timer started
  totalSecs: number; // 120 for timed, 180 for practice
  onExpire?: () => void;
}

function TimerRing({ startMs, totalSecs, onExpire }: TimerRingProps) {
  const [elapsed, setElapsed] = useState(0);
  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;

  useEffect(() => {
    if (!startMs) return;
    const id = setInterval(() => {
      const secs = Math.floor((performance.now() - startMs) / 1000);
      setElapsed(secs);
      if (secs >= totalSecs) {
        onExpireRef.current?.();
        clearInterval(id);
      }
    }, 250);
    return () => clearInterval(id);
  }, [startMs, totalSecs]);

  const remaining = Math.max(0, totalSecs - elapsed);
  const frac = remaining / totalSecs;
  const radius = 20;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - frac);

  let color = "#3B82F6"; // blue
  let pulse = false;
  if (remaining <= 0) {
    color = "#EF4444";
    pulse = true;
  } else if (elapsed >= 90) {
    color = "#F59E0B";
  } // amber at 90s
  else if (elapsed >= Math.floor(totalSecs * 0.75)) {
    color = "#EF4444";
    pulse = true;
  } // red at 75%+

  return (
    <div
      className={`relative w-12 h-12 flex-shrink-0 ${pulse ? "animate-pulse" : ""}`}
      aria-label={`Question timer: ${remaining} seconds remaining`}
    >
      <svg className="w-full h-full -rotate-90" viewBox="0 0 48 48">
        <circle
          cx="24"
          cy="24"
          r={radius}
          fill="none"
          stroke="#1e293b"
          strokeWidth="4"
        />
        <circle
          cx="24"
          cy="24"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="4"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 0.25s linear, stroke 0.3s" }}
        />
      </svg>
      <span
        className="absolute inset-0 flex items-center justify-center text-xs font-bold"
        style={{ color }}
      >
        {remaining > 0 ? remaining : "!"}
      </span>
    </div>
  );
}

// ─── Triage Banner ───────────────────────────────────────────

interface TriageBannerProps {
  mode: "timed" | "practice" | "simulation";
  onFlagAndNext: () => void;
  onDismiss: () => void;
}

function TriageBanner({ mode, onFlagAndNext, onDismiss }: TriageBannerProps) {
  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 animate-slide-up">
      <div className="mx-auto max-w-4xl mb-4 px-4">
        <div className="bg-amber-950/95 border border-amber-500/40 rounded-xl px-5 py-3 flex items-center gap-4 shadow-2xl shadow-amber-900/50 backdrop-blur">
          <span className="text-xl flex-shrink-0">⏰</span>
          <p className="text-amber-200 text-sm flex-1">
            {mode === "timed" || mode === "simulation"
              ? "2 minutes. Make your best guess and move on — do not spiral."
              : "3 minutes — even in practice, enforce the habit."}
          </p>
          <div className="flex gap-2 flex-shrink-0">
            {mode === "timed" && (
              <Button
                size="sm"
                className="bg-blue-600 hover:bg-blue-700 text-xs px-3 h-8"
                onClick={onFlagAndNext}
              >
                Flag &amp; Next →
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="text-amber-400 hover:text-amber-200 text-xs h-8"
              onClick={onDismiss}
            >
              Dismiss
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── CR Missing Link Gate ─────────────────────────────────────

interface MissingLinkGateProps {
  mode: "timed" | "practice" | "review" | "simulation";
  value: string;
  onChange: (v: string) => void;
  onUnlock: () => void;
  onSkip: () => void;
}

function MissingLinkGate({
  mode,
  value,
  onChange,
  onUnlock,
  onSkip,
}: MissingLinkGateProps) {
  const canUnlock = value.trim().length >= 10;
  return (
    <div className="mb-4 p-4 rounded-xl border border-blue-500/20 bg-blue-500/5">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-blue-400 font-semibold text-sm">
          📝 Missing Link
        </span>
        <span className="text-xs text-muted-foreground">
          Required before answer choices unlock
        </span>
      </div>
      <p className="text-xs text-muted-foreground mb-2">
        What assumption connects the evidence to the conclusion?
      </p>
      <Textarea
        value={value}
        onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
          onChange(e.target.value)
        }
        placeholder="What assumption connects the evidence to the conclusion?"
        className="bg-slate-900 border-slate-700 text-sm resize-none mb-2"
        rows={2}
        maxLength={300}
      />
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          {value.length} / 300
        </span>
        <div className="flex items-center gap-3">
          {mode === "practice" && (
            <button
              onClick={onSkip}
              className="text-xs text-slate-500 hover:text-slate-300 underline underline-offset-2"
            >
              Skip (not recommended)
            </button>
          )}
          <Button
            size="sm"
            disabled={!canUnlock}
            onClick={onUnlock}
            className="bg-blue-600 hover:bg-blue-700 text-xs h-8 disabled:opacity-40"
          >
            Unlock Answer Choices →
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── RC Passage Map ───────────────────────────────────────────

interface PassageMapProps {
  passage: string;
  mode: "timed" | "practice" | "review" | "simulation";
  value: Record<string, string>;
  onChange: (v: Record<string, string>) => void;
  onComplete: () => void;
  onSkip: () => void;
  isComplete: boolean;
}

function PassageMapInput({
  passage,
  mode,
  value,
  onChange,
  onComplete,
  onSkip,
  isComplete,
}: PassageMapProps) {
  const paragraphs = passage.split(/\n\n+/).filter((p) => p.trim().length > 10);
  const allFilled =
    paragraphs.every((_, i) => (value[`p${i + 1}`] || "").trim().length >= 5) &&
    (value.mainIdea || "").trim().length >= 5;

  if (isComplete && mode !== "review") {
    return (
      <div className="mt-4 p-3 rounded-lg border border-slate-700 bg-slate-900/50 text-xs text-muted-foreground">
        <span className="text-green-400 font-medium">
          ✅ Passage Map complete
        </span>
        <div className="mt-1 space-y-1">
          {paragraphs.map((_, i) => (
            <div key={i}>
              <span className="text-slate-500">P{i + 1}:</span>{" "}
              {value[`p${i + 1}`]}
            </div>
          ))}
          <div>
            <span className="text-slate-500">Main Idea:</span> {value.mainIdea}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-4 p-4 rounded-xl border border-purple-500/20 bg-purple-500/5">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-purple-400 font-semibold text-sm">
          🗺️ Passage Map
        </span>
        <span className="text-xs text-muted-foreground">
          Required before questions unlock
        </span>
      </div>
      <div className="space-y-2">
        {paragraphs.map((_, i) => {
          const key = `p${i + 1}`;
          const filled = (value[key] || "").trim().length >= 5;
          return (
            <div key={i}>
              <label className="text-xs font-medium text-slate-400 mb-1 block">
                P{i + 1}:
              </label>
              <Textarea
                value={value[key] || ""}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                  onChange({ ...value, [key]: e.target.value })
                }
                placeholder="Main point of this paragraph (1 sentence max)."
                className={`bg-slate-900 border-slate-700 text-xs resize-none ${!filled && Object.keys(value).length > 0 ? "border-amber-500/50" : ""}`}
                rows={1}
                maxLength={150}
                readOnly={mode === "review"}
              />
            </div>
          );
        })}
        <div>
          <label className="text-xs font-medium text-slate-400 mb-1 block">
            Main Idea:
          </label>
          <Textarea
            value={value.mainIdea || ""}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
              onChange({ ...value, mainIdea: e.target.value })
            }
            placeholder="Overall argument of the passage."
            className="bg-slate-900 border-slate-700 text-xs resize-none"
            rows={1}
            maxLength={200}
            readOnly={mode === "review"}
          />
        </div>
      </div>
      {mode !== "review" && (
        <div className="flex items-center justify-between mt-3">
          <div className="flex gap-2">
            {mode === "practice" && (
              <button
                onClick={onSkip}
                className="text-xs text-slate-500 hover:text-slate-300 underline underline-offset-2"
              >
                Skip Map (not recommended)
              </button>
            )}
          </div>
          <Button
            size="sm"
            disabled={!allFilled}
            onClick={onComplete}
            className="bg-purple-600 hover:bg-purple-700 text-xs h-8 disabled:opacity-40"
          >
            Proceed to Questions →
          </Button>
        </div>
      )}
    </div>
  );
}

// ─── Main Exam Page ───────────────────────────────────────────

export default function ExamPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = use(params);
  const router = useRouter();
  const store = useExamStore();
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Triage state (local - whether banner is visible) ──────
  const [showTriageBanner, setShowTriageBanner] = useState(false);
  const triageFiredRef = useRef(false);
  const triageDismissedRef = useRef(false);

  // ── Missing link local state (for controlled input) ───────
  const [mlDraft, setMlDraft] = useState("");

  // ── Passage map local state ───────────────────────────────
  const [passageMapDraft, setPassageMapDraft] = useState<
    Record<string, string>
  >({});

  const {
    mode,
    questions,
    currentIndex,
    questionStates,
    isActive,
    isSubmitted,
    sessionStartTime,
    totalTimeMs,
    remainingTimeMs,
    selectAnswer,
    toggleFlag,
    setConfidence,
    navigateTo,
    navigateNext,
    navigateBack,
    updateTimer,
    addTimerWarning,
    trackEvent,
    submitExam,
    triggerTriage,
    dismissTriage,
    setMissingLink,
    unlockChoices,
    setPassageMap,
    completePassageMap,
  } = store;

  const currentQ = questions[currentIndex];
  const qs = questionStates[currentIndex];
  const isCR = currentQ?.question_type === "Critical Reasoning";
  const isRC = currentQ?.question_type === "Reading Comprehension";
  const isSimulation = mode === "simulation";

  // ── Redirect if no active session ────────────────────────
  useEffect(() => {
    if (!isActive && !isSubmitted) {
      router.replace("/");
    }
    if (isSubmitted) {
      router.replace(`/results/${sessionId}`);
    }
  }, [isActive, isSubmitted, sessionId, router]);

  // ── Sync draft states from question state changes ─────────
  useEffect(() => {
    setMlDraft(qs?.missingLink || "");
    setPassageMapDraft(qs?.passageMap || {});
    setShowTriageBanner(false);
    triageFiredRef.current = qs?.triageTriggered || false;
    triageDismissedRef.current = qs?.triageDismissed || false;
  }, [currentIndex]);

  // ── Global session timer ──────────────────────────────────
  useEffect(() => {
    if (!isActive) return;
    timerRef.current = setInterval(() => {
      const elapsed = performance.now() - sessionStartTime;
      updateTimer(elapsed);

      if (mode === "timed") {
        const remaining = totalTimeMs - elapsed;
        const total = totalTimeMs;
        if (remaining <= total * 0.5 && remaining > total * 0.5 - 1000) {
          addTimerWarning("50pct");
          trackEvent("time_warning_50pct");
        }
        if (remaining <= total * 0.25 && remaining > total * 0.25 - 1000) {
          addTimerWarning("25pct");
          trackEvent("time_warning_25pct");
        }
        if (remaining <= 30000 && remaining > 29000) {
          addTimerWarning("30sec");
          trackEvent("time_warning_30sec");
        }
        if (remaining <= 0) {
          handleSubmit();
        }
      }
    }, 500);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isActive, sessionStartTime, mode, totalTimeMs]);

  // ── Triage fire logic ─────────────────────────────────────
  const handleTriageExpire = useCallback(() => {
    if (triageFiredRef.current || triageDismissedRef.current) return;
    if (qs?.selectedAnswer) return; // already answered
    triggerTriage();
    setShowTriageBanner(true);
    triageFiredRef.current = true;
  }, [qs?.selectedAnswer, triggerTriage]);

  // ── Keyboard shortcuts ────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!isActive) return;
      if (
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLInputElement
      )
        return;
      if (e.key === "ArrowRight" || e.key === "n") navigateNext();
      if (!isSimulation && (e.key === "ArrowLeft" || e.key === "b")) navigateBack();
      if (!isSimulation && e.key === "f") toggleFlag();
      if (["a", "b", "c", "d", "e"].includes(e.key.toLowerCase())) {
        const letter = e.key.toUpperCase();
        if (qs?.choicesUnlocked && qs?.passageMapComplete) selectAnswer(letter);
      }
      if (e.key === "Enter" && e.metaKey) handleSubmit();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isActive, isSimulation, qs, navigateNext, navigateBack, toggleFlag, selectAnswer]);

  const handleSubmit = async () => {
    submitExam();
    // Persist data
    try {
      // Use getState() to read fresh state after submitExam()/recordQuestionTime() ran
      const {
        sessionId: sid,
        questions: qs2,
        questionStates: qss,
        pendingEvents,
        mode: m,
      } = useExamStore.getState();
      if (!sid) return;
      const responses = qs2.map((q, i) => {
        const s = qss[i];
        return {
          session_id: sid,
          question_id: q.id,
          question_order: i + 1,
          selected_answer: s?.selectedAnswer || null,
          is_correct: s?.selectedAnswer
            ? s.selectedAnswer === q.correct_answer
            : null,
          time_spent_seconds: Math.round((s?.timeSpentMs || 0) / 1000),
          flagged_for_review: s?.flagged || false,
          answer_changes: s?.answerChanges || [],
          first_answer: s?.firstAnswer || null,
          confidence_rating: s?.confidenceRating,
          error_category: s?.errorCategory,
          note: s?.note,
          triage_triggered: s?.triageTriggered || false,
          missing_link: s?.missingLink,
          passage_map: s?.passageMap,
        };
      });
      const correctCount = responses.filter((r) => r.is_correct).length;
      const totalTime = Math.round(
        (performance.now() - sessionStartTime) / 1000,
      );

      await saveResponses(responses);
      await updateSession(sid, {
        completed_at: new Date().toISOString(),
        total_time_seconds: totalTime,
        correct_count: correctCount,
        total_count: qs2.length,
        score: Math.round((correctCount / qs2.length) * 100),
      });
      if (pendingEvents.length > 0) {
        await saveTrackingEvents(
          pendingEvents.map((e) => ({
            session_id: sid,
            question_id: e.question_id,
            event_type: e.event_type,
            event_data: e.event_data,
            timestamp_offset_ms: e.timestamp_offset_ms,
          })),
        );
      }
    } catch (err) {
      console.error("Failed to save session:", err);
    }
  };

  const handleFlagAndNext = () => {
    if (!qs?.flagged) toggleFlag();
    trackEvent("triage_flag_and_next", { question_number: currentIndex + 1 });
    setShowTriageBanner(false);
    navigateNext();
  };

  const handleDismissTriage = () => {
    dismissTriage();
    setShowTriageBanner(false);
    triageDismissedRef.current = true;
  };

  const handleUnlockChoices = () => {
    setMissingLink(mlDraft);
    unlockChoices();
  };

  const handleSkipMissingLink = () => {
    trackEvent("missing_link_skipped", { question_id: currentQ?.id });
    unlockChoices();
  };

  const handleCompletePassageMap = () => {
    setPassageMap(passageMapDraft);
    completePassageMap();
  };

  const handleSkipPassageMap = () => {
    trackEvent("passage_map_skipped", { question_id: currentQ?.id });
    setPassageMap(passageMapDraft);
    completePassageMap();
  };

  // Timer display
  const formatTime = (ms: number) => {
    const totalSec = Math.max(0, Math.floor(ms / 1000));
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const warningLevel = (() => {
    if (mode !== "timed") return "none";
    const frac = remainingTimeMs / totalTimeMs;
    if (remainingTimeMs <= 30000) return "danger";
    if (frac <= 0.25) return "warning";
    if (frac <= 0.5) return "caution";
    return "none";
  })();

  const timerColors = {
    none: "text-slate-300",
    caution: "text-yellow-400",
    warning: "text-orange-400",
    danger: "text-red-400 animate-pulse",
  };

  if (!currentQ || !isActive) return null;

  const choices = ["A", "B", "C", "D", "E"]
    .map((letter) => ({
      letter,
      text: currentQ[
        `choice_${letter.toLowerCase()}` as keyof typeof currentQ
      ] as string,
    }))
    .filter((c) => c.text);

  const showTimerRing =
    mode !== "review" &&
    qs?.questionTimerStartMs > 0 &&
    (isSimulation || (qs?.choicesUnlocked && qs?.passageMapComplete));
  const triageSecs = mode === "practice" ? 180 : 120;
  const choicesLocked = !isSimulation && !qs?.choicesUnlocked;
  const mapLocked = !isSimulation && !qs?.passageMapComplete;

  return (
    <div className="min-h-screen flex flex-col bg-[#0A1628]">
      {/* ── Top Bar ── */}
      <header className="border-b border-slate-800 bg-[#0A1628]/95 backdrop-blur sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-4 py-2 flex items-center gap-4">
          {/* Progress dots */}
          <div className="flex gap-1 flex-1 overflow-x-auto">
            {questions.map((q, i) => {
              const s = questionStates[i];
              const isCorrect = s?.selectedAnswer === q.correct_answer;
              return (
                <button
                  key={i}
                  onClick={() => navigateTo(i)}
                  className={`w-6 h-6 rounded text-xs font-bold flex-shrink-0 transition-all ${
                    i === currentIndex
                      ? "bg-blue-500 text-white scale-110 ring-2 ring-blue-400/50"
                      : s?.selectedAnswer
                        ? mode === "review"
                          ? isCorrect
                            ? "bg-green-600/80 text-white"
                            : "bg-red-600/80 text-white"
                          : "bg-slate-600 text-white"
                        : "bg-slate-800 text-slate-400 hover:bg-slate-700"
                  } ${s?.flagged ? "ring-1 ring-yellow-400" : ""}`}
                >
                  {i + 1}
                </button>
              );
            })}
          </div>

          {/* Global timer */}
          <div
            className={`font-mono text-xl font-bold tabular-nums ${timerColors[warningLevel]}`}
          >
            {mode === "timed"
              ? formatTime(remainingTimeMs)
              : `+${formatTime(remainingTimeMs)}`}
          </div>

          <Button
            size="sm"
            variant="outline"
            className="border-red-500/40 text-red-400 hover:bg-red-500/10 text-xs"
            onClick={handleSubmit}
          >
            Submit
          </Button>
        </div>
      </header>

      {/* ── Main content ── */}
      <main className="flex-1 max-w-6xl mx-auto w-full px-4 py-6">
        {isRC ? (
          /* RC: Two-column layout */
          <div className="grid grid-cols-[55%_45%] gap-6 h-[calc(100vh-120px)]">
            {/* Left: passage + map (map gate disabled in simulation) */}
            <div className="flex flex-col overflow-hidden">
              <div className="flex-1 overflow-y-auto pr-2">
                <div className="space-y-4">
                  {(currentQ.passage_text || currentQ.stem)
                    .split(/\n\n+/)
                    .filter((p) => p.trim())
                    .map((para, i) => (
                      <div key={i} className="flex gap-3">
                        <span className="text-blue-400 font-bold text-sm flex-shrink-0 mt-0.5">
                          P{i + 1}
                        </span>
                        <p className="text-sm leading-relaxed text-slate-200">
                          {para}
                        </p>
                      </div>
                    ))}
                </div>
              </div>
              {!isSimulation && (
                <PassageMapInput
                  passage={currentQ.passage_text || currentQ.stem}
                  mode={mode}
                  value={passageMapDraft}
                  onChange={setPassageMapDraft}
                  onComplete={handleCompletePassageMap}
                  onSkip={handleSkipPassageMap}
                  isComplete={qs?.passageMapComplete || false}
                />
              )}
            </div>

            {/* Right: question + choices */}
            <div
              className={`overflow-y-auto transition-all duration-300 ${!isSimulation && mapLocked ? "blur-sm pointer-events-none select-none" : ""}`}
            >
              {!isSimulation && mapLocked && (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center text-muted-foreground">
                    <p className="text-4xl mb-3">🗺️</p>
                    <p className="font-medium">
                      Complete the Passage Map to unlock questions.
                    </p>
                  </div>
                </div>
              )}
              {(isSimulation || !mapLocked) && (
                <QuestionPanel
                  q={currentQ}
                  qs={qs}
                  choices={choices}
                  mode={mode}
                  showTimerRing={showTimerRing}
                  triageSecs={triageSecs}
                  isCR={isCR}
                  choicesLocked={false}
                  mlDraft={mlDraft}
                  setMlDraft={setMlDraft}
                  onUnlock={handleUnlockChoices}
                  onSkipML={handleSkipMissingLink}
                  onSelect={selectAnswer}
                  onToggleFlag={toggleFlag}
                  onConfidence={setConfidence}
                  onTriageExpire={handleTriageExpire}
                  currentIndex={currentIndex}
                  totalQuestions={questions.length}
                />
              )}
            </div>
          </div>
        ) : (
          /* Non-RC: single column */
          <QuestionPanel
            q={currentQ}
            qs={qs}
            choices={choices}
            mode={mode}
            showTimerRing={showTimerRing}
            triageSecs={triageSecs}
            isCR={isCR}
            choicesLocked={choicesLocked}
            mlDraft={mlDraft}
            setMlDraft={setMlDraft}
            onUnlock={handleUnlockChoices}
            onSkipML={handleSkipMissingLink}
            onSelect={selectAnswer}
            onToggleFlag={toggleFlag}
            onConfidence={setConfidence}
            onTriageExpire={handleTriageExpire}
            currentIndex={currentIndex}
            totalQuestions={questions.length}
          />
        )}
      </main>

      {/* ── Bottom navigation ── */}
      <footer className="border-t border-slate-800 bg-[#0A1628]/95 backdrop-blur sticky bottom-0">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          {isSimulation ? (
            <div />
          ) : (
            <Button
              variant="ghost"
              onClick={navigateBack}
              disabled={currentIndex === 0}
              className="text-muted-foreground"
            >
              ← Back
            </Button>
          )}
          <span className="text-muted-foreground text-sm">
            {currentIndex + 1} / {questions.length}
          </span>
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
              className="bg-green-600 hover:bg-green-700"
            >
              Submit Exam ✓
            </Button>
          )}
        </div>
      </footer>

      {/* ── Triage Banner ── */}
      {showTriageBanner && !qs?.triageDismissed && (
        <TriageBanner
          mode={mode === "review" ? "timed" : mode}
          onFlagAndNext={handleFlagAndNext}
          onDismiss={handleDismissTriage}
        />
      )}
    </div>
  );
}

// ─── Question Panel (reusable for both RC and non-RC) ────────

interface QuestionPanelProps {
  q: ReturnType<typeof useExamStore.getState>["questions"][0];
  qs: ReturnType<typeof useExamStore.getState>["questionStates"][0];
  choices: { letter: string; text: string }[];
  mode: "timed" | "practice" | "review" | "simulation";
  showTimerRing: boolean;
  triageSecs: number;
  isCR: boolean;
  choicesLocked: boolean;
  mlDraft: string;
  setMlDraft: (v: string) => void;
  onUnlock: () => void;
  onSkipML: () => void;
  onSelect: (a: string) => void;
  onToggleFlag: () => void;
  onConfidence: (r: number) => void;
  onTriageExpire: () => void;
  currentIndex: number;
  totalQuestions: number;
}

function QuestionPanel({
  q,
  qs,
  choices,
  mode,
  showTimerRing,
  triageSecs,
  isCR,
  choicesLocked,
  mlDraft,
  setMlDraft,
  onUnlock,
  onSkipML,
  onSelect,
  onToggleFlag,
  onConfidence,
  onTriageExpire,
  currentIndex,
  totalQuestions,
}: QuestionPanelProps) {
  const isDS = q.question_type === "Data Sufficiency";
  const isReview = mode === "review";
  const isSimulation = mode === "simulation";

  return (
    <div className="space-y-4 max-w-3xl mx-auto">
      {/* Question header */}
      <div className="flex items-start gap-3 justify-between">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge
            variant="outline"
            className="border-blue-500/30 text-blue-400 text-xs"
          >
            Q{currentIndex + 1}
          </Badge>
          <Badge
            variant="outline"
            className="border-slate-600 text-slate-400 text-xs"
          >
            {q.difficulty}
          </Badge>
          <Badge
            variant="outline"
            className="border-purple-500/30 text-purple-400 text-xs"
          >
            {q.topic || q.question_type}
          </Badge>
          {!isSimulation && qs?.flagged && (
            <Badge className="bg-yellow-500/20 text-yellow-400 text-xs">
              🚩 Flagged
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {showTimerRing && (
            <TimerRing
              startMs={qs?.questionTimerStartMs || 0}
              totalSecs={triageSecs}
              onExpire={onTriageExpire}
            />
          )}
          {!isSimulation && (
            <button
              onClick={onToggleFlag}
              className={`text-xl transition-all hover:scale-110 ${qs?.flagged ? "opacity-100" : "opacity-40 hover:opacity-80"}`}
              title="Flag for review (F)"
            >
              🚩
            </button>
          )}
        </div>
      </div>

      {/* Question stem */}
      <div className="bg-slate-800/40 rounded-xl p-5 border border-slate-700/50">
        {isDS && (q.statement1 || q.statement2) ? (
          <div className="space-y-4">
            <p className="text-base leading-relaxed">{q.stem}</p>
            {q.statement1 && (
              <div className="pl-4 border-l-2 border-blue-500/40">
                <span className="text-blue-400 font-semibold text-sm">
                  (1){" "}
                </span>
                <span className="text-sm leading-relaxed">{q.statement1}</span>
              </div>
            )}
            {q.statement2 && (
              <div className="pl-4 border-l-2 border-blue-500/40">
                <span className="text-blue-400 font-semibold text-sm">
                  (2){" "}
                </span>
                <span className="text-sm leading-relaxed">{q.statement2}</span>
              </div>
            )}
          </div>
        ) : (
          <p className="text-base leading-relaxed whitespace-pre-wrap">
            {q.stem}
          </p>
        )}
      </div>

      {/* CR: Missing Link gate — disabled in simulation mode */}
      {isCR && !isReview && !isSimulation && !qs?.choicesUnlocked && (
        <MissingLinkGate
          mode={mode}
          value={mlDraft}
          onChange={setMlDraft}
          onUnlock={onUnlock}
          onSkip={onSkipML}
        />
      )}

      {/* CR: read-only missing link on revisit */}
      {isCR && qs?.choicesUnlocked && qs?.missingLink && (
        <details className="text-xs">
          <summary className="text-blue-400 cursor-pointer hover:text-blue-300 mb-1">
            📝 My Missing Link (click to expand)
          </summary>
          <div className="p-3 bg-blue-500/5 rounded-lg border border-blue-500/20 text-slate-300 leading-relaxed">
            {qs.missingLink}
          </div>
        </details>
      )}

      {/* Answer choices */}
      <div
        className={`space-y-2 transition-all duration-300 ${choicesLocked ? "blur-[4px] pointer-events-none select-none" : ""}`}
      >
        {choicesLocked && (
          <div className="text-center text-muted-foreground py-8">
            <p>Missing Link required.</p>
          </div>
        )}
        {!choicesLocked &&
          choices.map(({ letter, text }) => {
            const isSelected = qs?.selectedAnswer === letter;
            const isCorrectAns = q.correct_answer === letter;
            const showResult = isReview;
            return (
              <button
                key={letter}
                onClick={() => onSelect(letter)}
                disabled={mode === "review"}
                className={`w-full text-left p-4 rounded-xl border transition-all duration-150 flex items-start gap-3 group ${
                  showResult && isCorrectAns
                    ? "border-green-500/60 bg-green-500/10"
                    : showResult && isSelected && !isCorrectAns
                      ? "border-red-500/60 bg-red-500/10"
                      : isSelected
                        ? "border-blue-500 bg-blue-500/15 shadow-lg shadow-blue-500/10"
                        : "border-slate-700/50 bg-slate-800/30 hover:border-slate-600 hover:bg-slate-800/50"
                }`}
              >
                <span
                  className={`w-7 h-7 rounded-lg flex items-center justify-center text-sm font-bold flex-shrink-0 mt-0.5 transition-colors ${
                    showResult && isCorrectAns
                      ? "bg-green-600 text-white"
                      : showResult && isSelected && !isCorrectAns
                        ? "bg-red-600 text-white"
                        : isSelected
                          ? "bg-blue-500 text-white"
                          : "bg-slate-700 text-slate-400 group-hover:bg-slate-600"
                  }`}
                >
                  {letter}
                </span>
                <span className="text-sm leading-relaxed pt-0.5">{text}</span>
                {showResult && isCorrectAns && (
                  <span className="ml-auto text-green-400 text-sm flex-shrink-0">
                    ✓
                  </span>
                )}
              </button>
            );
          })}
      </div>

      {/* Confidence rating (all modes except simulation) */}
      {!isSimulation && qs?.selectedAnswer && (
        <div className="flex items-center gap-3 pt-2">
          <span className="text-sm text-muted-foreground">Confidence:</span>
          {[1, 2, 3, 4, 5].map((r) => (
            <button
              key={r}
              onClick={() => onConfidence(r)}
              className={`text-lg transition-all hover:scale-110 ${(qs?.confidenceRating || 0) >= r ? "opacity-100" : "opacity-30"}`}
            >
              ⭐
            </button>
          ))}
        </div>
      )}

      {/* Review mode explanation */}
      {isReview && q.explanation && (
        <div className="mt-4 p-4 bg-slate-900/60 rounded-xl border border-slate-700/50">
          <h4 className="text-sm font-semibold text-blue-400 mb-2">
            Explanation
          </h4>
          <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
            {q.explanation}
          </p>
        </div>
      )}
    </div>
  );
}
