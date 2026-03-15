"use client";

import React, { useEffect, useRef, useState, useCallback, use, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useExamStore, requiresMissingLink } from "@/store/examStore";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  updateResponse,
  saveResponses,
  saveTrackingEvents,
  updateSession,
  getPassagesBySetId,
  getPassagesByGroupId,
} from "@/lib/db";
import {
  TwoPartRenderer,
  TableAnalysisRenderer,
  MultiSourceRenderer,
  MultiSourceTabs,
  GraphicsRenderer,
  PassageContent,
  renderTextWithTable,
} from "@/components/exam/DIRenderers";
import type { Passage } from "@/types/gmat";
import { toast } from "sonner";
import {
  faArrowLeft,
  faArrowRight,
  faCircleCheck,
  faClock,
  faFlag,
  faLink,
  faMap,
  faStar,
  faUnlock,
} from "@fortawesome/free-solid-svg-icons";
import { FaIcon } from "@/components/ui/fa-icon";

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
          <FaIcon icon={faClock} className="text-xl flex-shrink-0 text-amber-300" />
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
                <span className="inline-flex items-center gap-2">
                  <FaIcon icon={faFlag} className="h-3.5 w-3.5" />
                  Flag &amp; Next <FaIcon icon={faArrowRight} className="h-3.5 w-3.5" />
                </span>
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
          <span className="inline-flex items-center gap-2">
            <FaIcon icon={faLink} className="h-3.5 w-3.5" />
            Missing Link
          </span>
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
        className="bg-slate-900 border-slate-700 text-slate-100 placeholder:text-slate-500 text-sm resize-none mb-2"
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
            <span className="inline-flex items-center gap-2">
              <FaIcon icon={faUnlock} className="h-3.5 w-3.5" />
              Unlock Answer Choices <FaIcon icon={faArrowRight} className="h-3.5 w-3.5" />
            </span>
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
        <span className="text-green-400 font-medium inline-flex items-center gap-2">
          <FaIcon icon={faCircleCheck} className="h-3.5 w-3.5" />
          Passage Map complete
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
          <span className="inline-flex items-center gap-2">
            <FaIcon icon={faMap} className="h-3.5 w-3.5" />
            Passage Map
          </span>
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
                className={`bg-slate-900 border-slate-700 text-slate-100 placeholder:text-slate-500 text-xs resize-none ${!filled && Object.keys(value).length > 0 ? "border-amber-500/50" : ""}`}
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
            className="bg-slate-900 border-slate-700 text-slate-100 placeholder:text-slate-500 text-xs resize-none"
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
            <span className="inline-flex items-center gap-2">
              Proceed to Questions <FaIcon icon={faArrowRight} className="h-3.5 w-3.5" />
            </span>
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

  // ── Passages (loaded once when questions are available) ───
  const [passages, setPassages] = useState<Passage[]>([]);
  const [groupPassages, setGroupPassages] = useState<Passage[]>([]);

  // ── Review & Edit state ──────────────────────────────────────
  const [isInReviewEdit, setIsInReviewEdit] = useState(false);
  const [reviewEditCount, setReviewEditCount] = useState(0);
  const [reviewEditQuestion, setReviewEditQuestion] = useState<number | null>(null);
  const [reviewEditOriginalAnswer, setReviewEditOriginalAnswer] = useState<string | null>(null);
  const [showEditConfirm, setShowEditConfirm] = useState(false);
  const [reviewEditedSet, setReviewEditedSet] = useState<Set<number>>(new Set());

  // ── Timer Ring preference ────────────────────────────────────
  const [timerRingEnabled, setTimerRingEnabled] = useState(true);

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
    selectAnswer2,
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
  const needsMissingLink = requiresMissingLink(currentQ?.question_type ?? '', currentQ?.topic);
  const isRC =
    currentQ?.question_type === "Reading Comprehension" ||
    (!!currentQ?.passage_id &&
      currentQ?.question_type !== "Table Analysis" &&
      currentQ?.question_type !== "Graphics Interpretation");
  const isMSR =
    currentQ?.question_type === "Multi-Source Reasoning" &&
    groupPassages.length > 0;
  const isTableAnalysis = currentQ?.question_type === "Table Analysis";
  const isGraphics = currentQ?.question_type === "Graphics Interpretation";
  const isGraphicsSplit = isGraphics && !!currentQ?.passage_id;
  const isSimulation = mode === "simulation";

  // Resolve passage text from the passages table (loaded by set_id below)
  const passageText = useMemo(() => {
    if (!currentQ?.passage_id) return "";
    return passages.find((p) => p.id === currentQ.passage_id)?.passage_text ?? "";
  }, [currentQ, passages]);

  // Single passage for Table Analysis / Graphics Interpretation
  const currentPassage = useMemo(() => {
    if (!currentQ?.passage_id) return null;
    return passages.find((p) => p.id === currentQ.passage_id) ?? null;
  }, [currentQ, passages]);

  // ── Load passages when questions are available ────────────
  useEffect(() => {
    const setId = questions[0]?.set_id;
    if (!setId) return;
    getPassagesBySetId(setId).then(setPassages).catch(() => {});
  }, [questions]);

  // ── Load grouped passages for Multi-Source Reasoning ─────
  useEffect(() => {
    if (!currentQ?.passage_group_id) {
      setGroupPassages([]);
      return;
    }
    getPassagesByGroupId(currentQ.passage_group_id).then(setGroupPassages).catch(() => {});
  }, [currentQ?.passage_group_id]);

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

  // ── Read Timer Ring preference ────────────────────────────
  useEffect(() => {
    setTimerRingEnabled(localStorage.getItem("gmat-show-timer-ring") !== "false");
  }, []);

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
          setIsInReviewEdit(false);
          handleSubmit();
        }
      }
    }, 500);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isActive, sessionStartTime, mode, totalTimeMs]);

  // ── Bell sound for triage expire ─────────────────────────
  const playBell = useCallback(() => {
    try {
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "sine";
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.6);
      gain.gain.setValueAtTime(0.5, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.2);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 1.2);
      osc.onended = () => ctx.close();
    } catch {}
  }, []);

  // ── Triage fire logic ─────────────────────────────────────
  const handleTriageExpire = useCallback(() => {
    if (triageFiredRef.current || triageDismissedRef.current) return;
    if (qs?.selectedAnswer) return; // already answered
    playBell();
    triggerTriage();
    setShowTriageBanner(true);
    triageFiredRef.current = true;
  }, [qs?.selectedAnswer, triggerTriage, playBell]);

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
      if (mode !== "review" && ["a", "b", "c", "d", "e"].includes(e.key.toLowerCase())) {
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
    // Skip saving data in review mode — session is already persisted
    if (mode === "review") return;
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
          selected_answer:
            q.question_type === "Two-Part Analysis" && s?.selectedAnswer2
              ? `${s.selectedAnswer || ""},${s.selectedAnswer2}`
              : s?.selectedAnswer || null,
          is_correct:
            q.question_type === "Two-Part Analysis"
              ? s?.selectedAnswer === q.correct_answer &&
                s?.selectedAnswer2 === q.correct_answer2
              : s?.selectedAnswer
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

  // ── Review & Edit handlers ────────────────────────────────
  const handleSubmitClick = () => {
    if ((mode === "timed" || mode === "simulation") && remainingTimeMs > 0) {
      setIsInReviewEdit(true);
      setReviewEditCount(0);
      setReviewEditedSet(new Set());
    } else {
      handleSubmit();
    }
  };

  const startEditQuestion = (i: number) => {
    if (reviewEditCount >= 3) {
      toast.info("No edits remaining (max 3)");
      return;
    }
    setReviewEditOriginalAnswer(questionStates[i]?.selectedAnswer ?? null);
    setReviewEditQuestion(i);
    navigateTo(i);
  };

  const confirmEdit = () => {
    setReviewEditedSet((s) => new Set(s).add(reviewEditQuestion!));
    setReviewEditCount((c) => c + 1);
    setReviewEditQuestion(null);
    setReviewEditOriginalAnswer(null);
    setShowEditConfirm(false);
  };

  const cancelEdit = () => {
    if (reviewEditOriginalAnswer !== null) {
      selectAnswer(reviewEditOriginalAnswer);
    }
    setReviewEditQuestion(null);
    setReviewEditOriginalAnswer(null);
    setShowEditConfirm(false);
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
    none: "text-slate-600 dark:text-slate-300",
    caution: "text-yellow-600 dark:text-yellow-400",
    warning: "text-orange-500 dark:text-orange-400",
    danger: "text-red-500 dark:text-red-400 animate-pulse",
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

  const isGmatMode = mode === "timed" || mode === "simulation";
  const showTimerRing =
    timerRingEnabled &&
    mode !== "review" &&
    qs?.questionTimerStartMs > 0 &&
    (isSimulation || (qs?.choicesUnlocked && qs?.passageMapComplete));
  const triageSecs = mode === "practice" ? 180 : 120;
  const choicesLocked = !isSimulation && !qs?.choicesUnlocked;

  return (
    <div className="min-h-screen flex flex-col bg-[var(--exam-bg)]">
      {/* ── Top Bar ── */}
      <header className={`border-b sticky top-0 z-30 backdrop-blur ${
        isGmatMode
          ? "border-[#1e3a8a] bg-[#1e3a8a]"
          : "border-zinc-200 dark:border-[#1e293b] bg-white/95 dark:bg-[#0A1628]/95"
      }`}>
        <div className="max-w-6xl mx-auto px-4 py-2 flex items-center justify-between">
          {isGmatMode ? (
            <>
              <span className="text-white/60 text-xs">Question {currentIndex + 1} of {questions.length}</span>
              <span className={`font-mono text-lg font-bold tabular-nums ${
                remainingTimeMs <= 30000
                  ? "text-red-400 animate-pulse"
                  : remainingTimeMs <= 300000
                  ? "text-amber-400"
                  : "text-white"
              }`}>{formatTime(remainingTimeMs)}</span>
              <Button
                size="sm"
                variant="outline"
                className="border-white/40 text-white hover:bg-white/10 text-xs"
                onClick={handleSubmitClick}
              >
                Submit
              </Button>
            </>
          ) : (
            <>
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
                            : "bg-zinc-200 text-zinc-600 hover:bg-zinc-300 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700"
                      } ${s?.flagged ? "ring-1 ring-yellow-400" : ""}`}
                    >
                      {i + 1}
                    </button>
                  );
                })}
              </div>

              {/* Global timer */}
              <div className={`font-mono text-xl font-bold tabular-nums ${timerColors[warningLevel]}`}>
                {`+${formatTime(remainingTimeMs)}`}
              </div>

              {mode === "review" ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="border-slate-300 dark:border-slate-500/40 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-500/10 text-xs"
                  onClick={() => router.push("/")}
                >
                  <span className="inline-flex items-center gap-2">
                    <FaIcon icon={faArrowLeft} className="h-3 w-3" /> Dashboard
                  </span>
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  className="border-red-500/40 text-red-400 hover:bg-red-500/10 text-xs"
                  onClick={handleSubmitClick}
                >
                  Submit
                </Button>
              )}
            </>
          )}
        </div>
      </header>

      {/* ── Review Center screen (replaces main+footer when in review overview) ── */}
      {isInReviewEdit && reviewEditQuestion === null && (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Dark top bar */}
          <div className="bg-[#1a2942] px-6 py-2.5 flex items-center justify-between text-xs shrink-0">
            <span className="text-white/60">Review Center</span>
            <div className="flex items-center gap-4">
              <span className={`font-mono font-bold ${
                remainingTimeMs <= 30000 ? "text-red-400 animate-pulse" : remainingTimeMs <= 300000 ? "text-amber-400" : "text-amber-300"
              }`}>⏱ {formatTime(remainingTimeMs)}</span>
              <span className="text-green-400 font-semibold">Remaining Edits: {3 - reviewEditCount}</span>
            </div>
          </div>
          {/* Blue sub-header */}
          <div className="bg-[#2563eb] px-6 py-2 shrink-0">
            <span className="text-white text-xs font-semibold uppercase tracking-wide">
              Review Center
            </span>
          </div>
          {/* Body */}
          <div className="flex-1 overflow-y-auto bg-white px-6 py-5">
            <h3 className="text-base font-bold text-zinc-900 mb-1">Click on Question to Review &amp; Edit</h3>
            <p className="text-xs text-zinc-500 mb-4">
              You can review any question and edit up to 3 answers before time expires.
            </p>
            <table className="w-full border-collapse text-sm max-w-sm">
              <thead>
                <tr>
                  <th className="text-left px-3 py-2 bg-zinc-50 border border-zinc-200 font-semibold text-zinc-600">Question</th>
                  <th className="text-center px-3 py-2 bg-zinc-50 border border-zinc-200 font-semibold text-zinc-600">Bookmarked</th>
                </tr>
              </thead>
              <tbody>
                {questions.map((_, i) => {
                  const qsi = questionStates[i];
                  const edited = reviewEditedSet.has(i);
                  return (
                    <tr key={i} className="border-b border-zinc-100 hover:bg-zinc-50">
                      <td className="px-3 py-2 border border-zinc-200">
                        <button
                          className="text-blue-600 underline font-medium text-sm"
                          onClick={() => startEditQuestion(i)}
                        >
                          {i + 1}{edited ? " ✏" : ""}
                        </button>
                      </td>
                      <td className="px-3 py-2 border border-zinc-200 text-center">
                        {qsi?.flagged && <FaIcon icon={faFlag} className="h-3.5 w-3.5 text-yellow-500 inline" />}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {/* Blue footer */}
          <div className="bg-[#2563eb] px-6 py-2.5 flex items-center justify-between shrink-0">
            <span className="text-white/70 text-xs cursor-default">? Help</span>
            <Button
              size="sm"
              className="bg-white text-blue-800 font-bold text-xs hover:bg-white/90"
              onClick={() => { setIsInReviewEdit(false); handleSubmit(); }}
            >
              End Section Review →
            </Button>
          </div>
        </div>
      )}

      {/* ── Main content ── */}
      <main className={`flex-1 max-w-6xl mx-auto w-full px-4${(isRC || isMSR || isTableAnalysis || isGraphicsSplit) ? " overflow-hidden" : " py-6"}${isInReviewEdit && reviewEditQuestion === null ? " hidden" : ""}`}>
        {(isRC || isMSR || isTableAnalysis || isGraphicsSplit) ? (
          /* GMAT-style split layout — passage/sources left, question right */
          <div className="-mx-4 flex h-[calc(100vh-116px)] overflow-hidden">

            {/* ── Left: Passage / Source pane (57%) ── */}
            <div className="flex flex-col border-r border-[var(--exam-border)]" style={{ width: "57%" }}>
              {/* Header bar */}
              <div className={`px-6 py-2.5 border-b border-[var(--exam-border)] shrink-0 flex items-center justify-between ${
                (isMSR || isTableAnalysis || isGraphicsSplit)
                  ? "bg-[#2d6bbd] dark:bg-[#1a4a8a]"
                  : "bg-[var(--exam-section-header-bg)]"
              }`}>
                <span className={`text-[10.5px] font-semibold uppercase tracking-[0.18em] ${
                  (isMSR || isTableAnalysis || isGraphicsSplit)
                    ? "text-white/90"
                    : "text-[var(--exam-text-muted)]"
                }`}>
                  {isMSR
                    ? "Data Insights — Multi-Source Reasoning"
                    : currentQ?.question_type === "Table Analysis"
                    ? "Data Insights — Table Analysis"
                    : currentQ?.question_type === "Graphics Interpretation"
                    ? "Data Insights — Graphics Interpretation"
                    : "Reading Comprehension"}
                </span>
                {!isSimulation && qs?.passageMapComplete && isRC && !isMSR && (
                  <span className="text-[10.5px] text-green-500/70 font-medium inline-flex items-center gap-2">
                    <FaIcon icon={faCircleCheck} className="h-3 w-3" />
                    Passage Map complete
                  </span>
                )}
              </div>

              {/* MSR: Tabs with source passages */}
              {isMSR ? (
                <MultiSourceTabs passages={groupPassages} />
              ) : (
                <>
                  {/* Scrollable passage text (RC / Table Analysis / Graphics) */}
                  <div className="flex-1 overflow-y-auto bg-[var(--exam-pane-bg)]">
                    <div className="px-8 py-7">
                      {passageText ? (
                        currentPassage?.passage_type === "table_markdown" ||
                        currentPassage?.passage_type === "image_url" ? (
                          <PassageContent passage={currentPassage} />
                        ) : (
                          <div className="space-y-[1.1em] text-[13.5px] leading-[1.9] text-[var(--exam-text)] max-w-[600px]">
                            {passageText
                              .split(/\n\n+/)
                              .filter((p) => p.trim())
                              .map((para, i) => (
                                <p key={i}>{para}</p>
                              ))}
                          </div>
                        )
                      ) : (
                        <p className="text-slate-500 italic text-sm">
                          Passage text is not available for this question.
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Passage Map — practice mode only, RC only */}
                  {!isSimulation && mode === "practice" && isRC && (
                    <div className="border-t border-[var(--exam-border)] shrink-0 overflow-y-auto max-h-[38%] bg-[var(--exam-section-header-bg)]">
                      <PassageMapInput
                        passage={passageText || currentQ.stem}
                        mode={mode}
                        value={passageMapDraft}
                        onChange={setPassageMapDraft}
                        onComplete={handleCompletePassageMap}
                        onSkip={handleSkipPassageMap}
                        isComplete={qs?.passageMapComplete || false}
                      />
                    </div>
                  )}
                </>
              )}
            </div>

            {/* ── Right: Question pane (43%) ── */}
            <div
              className="flex flex-col overflow-y-auto bg-[var(--exam-panel-bg)]"
              style={{ width: "43%" }}
            >
              <div className="px-7 py-6">
                <QuestionPanel
                  q={currentQ}
                  qs={qs}
                  choices={choices}
                  mode={mode}
                  showTimerRing={showTimerRing}
                  triageSecs={triageSecs}
                  isCR={needsMissingLink}
                  choicesLocked={false}
                  mlDraft={mlDraft}
                  setMlDraft={setMlDraft}
                  onUnlock={handleUnlockChoices}
                  onSkipML={handleSkipMissingLink}
                  onSelect={selectAnswer}
                  onSelect2={selectAnswer2}
                  onToggleFlag={toggleFlag}
                  onConfidence={setConfidence}
                  onTriageExpire={handleTriageExpire}
                  currentIndex={currentIndex}
                  totalQuestions={questions.length}
                  currentPassage={currentPassage}
                  groupPassages={groupPassages}
                  isMSRSplit={isMSR}
                  reviewBanner={isInReviewEdit && reviewEditQuestion !== null ? (
                    <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-2.5 flex items-center justify-between">
                      <span className="text-amber-800 text-xs font-medium">
                        ⚠ Review Mode — Editing Q{reviewEditQuestion + 1} · {3 - reviewEditCount} edits remaining · Select your answer then click Confirm
                      </span>
                      <Button size="sm" variant="outline" className="border-amber-400 text-amber-700 text-xs h-7 ml-3 flex-shrink-0" onClick={() => setShowEditConfirm(true)}>Confirm</Button>
                    </div>
                  ) : undefined}
                />
              </div>
            </div>
          </div>
        ) : (
          /* Non-split: single column */
          <QuestionPanel
            q={currentQ}
            qs={qs}
            choices={choices}
            mode={mode}
            showTimerRing={showTimerRing}
            triageSecs={triageSecs}
            isCR={needsMissingLink}
            choicesLocked={choicesLocked}
            mlDraft={mlDraft}
            setMlDraft={setMlDraft}
            onUnlock={handleUnlockChoices}
            onSkipML={handleSkipMissingLink}
            onSelect={selectAnswer}
            onSelect2={selectAnswer2}
            onToggleFlag={toggleFlag}
            onConfidence={setConfidence}
            onTriageExpire={handleTriageExpire}
            currentIndex={currentIndex}
            totalQuestions={questions.length}
            currentPassage={currentPassage}
            groupPassages={groupPassages}
            reviewBanner={isInReviewEdit && reviewEditQuestion !== null ? (
              <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-2.5 flex items-center justify-between">
                <span className="text-amber-800 text-xs font-medium">
                  ⚠ Review Mode — Editing Q{reviewEditQuestion + 1} · {3 - reviewEditCount} edits remaining · Select your answer then click Confirm
                </span>
                <Button size="sm" variant="outline" className="border-amber-400 text-amber-700 text-xs h-7 ml-3 flex-shrink-0" onClick={() => setShowEditConfirm(true)}>Confirm</Button>
              </div>
            ) : undefined}
          />
        )}
      </main>

      {/* ── Bottom navigation ── */}
      {!(isInReviewEdit && reviewEditQuestion === null) && (
        <footer className={`border-t sticky bottom-0 backdrop-blur ${
          isGmatMode
            ? "border-[#1e3a8a] bg-[#1e3a8a]"
            : "border-zinc-200 dark:border-[#1e293b] bg-white/95 dark:bg-[#0A1628]/95"
        }`}>
          <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
            {isGmatMode ? (
              <>
                {/* Left: Pause | Save for Later */}
                <div className="flex gap-4">
                  <span className="text-white/70 text-xs cursor-default">⏸ Pause</span>
                  <span className="text-white/70 text-xs cursor-pointer hover:text-white" onClick={() => router.push("/")}>⬇ Save for Later</span>
                </div>
                {/* Right: Back | counter | Next */}
                <div className="flex items-center gap-3">
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-white/30 text-white/80 hover:bg-white/10 text-xs"
                    onClick={navigateBack}
                    disabled={currentIndex === 0 || isInReviewEdit}
                  >
                    <FaIcon icon={faArrowLeft} className="h-3 w-3 mr-1" /> Back
                  </Button>
                  <span className="text-white/60 text-xs">{currentIndex + 1} / {questions.length}</span>
                  {currentIndex < questions.length - 1 ? (
                    <Button
                      size="sm"
                      className="bg-white text-blue-800 hover:bg-white/90 text-xs font-bold"
                      onClick={navigateNext}
                    >
                      Next <FaIcon icon={faArrowRight} className="h-3 w-3 ml-1" />
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      className="bg-white text-blue-800 hover:bg-white/90 text-xs font-bold"
                      onClick={isInReviewEdit ? () => setShowEditConfirm(true) : handleSubmitClick}
                    >
                      {isInReviewEdit ? "Confirm ›" : "Submit ›"}
                    </Button>
                  )}
                </div>
              </>
            ) : (
              <>
                {isSimulation ? (
                  <div />
                ) : (
                  <Button
                    variant="ghost"
                    onClick={navigateBack}
                    disabled={currentIndex === 0}
                    className="text-muted-foreground"
                  >
                    <span className="inline-flex items-center gap-2">
                      <FaIcon icon={faArrowLeft} className="h-3.5 w-3.5" />
                      Back
                    </span>
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
                    <span className="inline-flex items-center gap-2">
                      Next <FaIcon icon={faArrowRight} className="h-3.5 w-3.5" />
                    </span>
                  </Button>
                ) : mode === "review" ? (
                  <Button
                    onClick={() => router.push("/")}
                    className="bg-slate-600 hover:bg-slate-700"
                  >
                    <span className="inline-flex items-center gap-2">
                      <FaIcon icon={faArrowLeft} className="h-3.5 w-3.5" /> Back to Dashboard
                    </span>
                  </Button>
                ) : (
                  <Button
                    onClick={handleSubmitClick}
                    className="bg-green-600 hover:bg-green-700"
                  >
                    <span className="inline-flex items-center gap-2">
                      Submit Exam <FaIcon icon={faCircleCheck} className="h-4 w-4" />
                    </span>
                  </Button>
                )}
              </>
            )}
          </div>
        </footer>
      )}

      {/* ── Edit Confirmation Dialog ── */}
      {showEditConfirm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
          <div className="bg-white rounded-xl overflow-hidden w-80 shadow-2xl">
            <div className="bg-[#1e3a8a] px-4 py-3 flex items-center justify-between">
              <span className="text-white text-sm font-bold">Answer Edit Confirmation</span>
              <button onClick={() => setShowEditConfirm(false)} className="text-white/60 hover:text-white text-lg leading-none">✕</button>
            </div>
            <div className="p-4">
              <p className="text-sm text-zinc-800 mb-4 flex gap-2 items-start">
                <span className="text-amber-500 text-base flex-shrink-0">⚠</span>
                Do you want to change your answer to this question?
              </p>
              <button
                onClick={confirmEdit}
                className="w-full mb-2 py-2 text-sm font-semibold rounded border border-blue-200 bg-blue-50 text-blue-800 hover:bg-blue-100"
              >
                Yes, Change Answer
              </button>
              <button
                onClick={cancelEdit}
                className="w-full py-2 text-sm font-semibold rounded border border-zinc-200 bg-zinc-50 text-zinc-700 hover:bg-zinc-100"
              >
                No, Keep Original Answer and Return to Question
              </button>
            </div>
            <div className="px-4 py-2 bg-zinc-50 border-t border-zinc-100 text-xs text-zinc-500 font-medium">
              Remaining Answer Edits: {3 - reviewEditCount}
            </div>
          </div>
        </div>
      )}

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
  onSelect2: (a: string) => void;
  onToggleFlag: () => void;
  onConfidence: (r: number) => void;
  onTriageExpire: () => void;
  currentIndex: number;
  totalQuestions: number;
  currentPassage: import("@/types/gmat").Passage | null;
  groupPassages: import("@/types/gmat").Passage[];
  isMSRSplit?: boolean;
  reviewBanner?: React.ReactNode;
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
  onSelect2,
  onToggleFlag,
  onConfidence,
  onTriageExpire,
  currentIndex,
  totalQuestions,
  currentPassage,
  groupPassages,
  isMSRSplit,
  reviewBanner,
}: QuestionPanelProps) {
  const isDS = q.question_type === "Data Sufficiency";
  const isReview = mode === "review";
  const isSimulation = mode === "simulation";

  return (
    <div className="space-y-4 max-w-3xl mx-auto">
      {/* Review banner (shown when editing a question in Review & Edit mode) */}
      {reviewBanner}
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
            className="border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-400 text-xs"
          >
            {q.difficulty}
          </Badge>
          <Badge
            variant="outline"
            className="border-purple-500/30 text-purple-400 text-xs"
          >
            {q.topic || q.question_type}
            {q.topic_note && <span className="text-purple-300/60 font-normal ml-1">({q.topic_note})</span>}
          </Badge>
          {!isSimulation && qs?.flagged && (
            <Badge className="bg-yellow-500/20 text-yellow-400 text-xs">
              <span className="inline-flex items-center gap-2">
                <FaIcon icon={faFlag} className="h-3.5 w-3.5" />
                Flagged
              </span>
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
              <FaIcon icon={faFlag} className="h-5 w-5" />
            </button>
          )}
        </div>
      </div>

      {/* Question stem */}
      <div className="bg-white dark:bg-slate-800/40 rounded-xl p-5 border border-slate-200 dark:border-slate-700/50">
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
          renderTextWithTable(q.stem)
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
            <span className="inline-flex items-center gap-2">
              <FaIcon icon={faLink} className="h-3.5 w-3.5" />
              My Missing Link (click to expand)
            </span>
          </summary>
          <div className="p-3 bg-blue-50 dark:bg-blue-500/5 rounded-lg border border-blue-200 dark:border-blue-500/20 text-slate-600 dark:text-slate-300 leading-relaxed">
            {qs.missingLink}
          </div>
        </details>
      )}

      {/* Answer choices — DI type-specific rendering */}
      {q.question_type === "Two-Part Analysis" ? (
        <TwoPartRenderer
          question={q}
          selectedAnswer={qs?.selectedAnswer ?? null}
          selectedAnswer2={qs?.selectedAnswer2 ?? null}
          onSelect={onSelect}
          onSelect2={onSelect2}
          locked={isSimulation}
          showCorrect={isReview}
        />
      ) : q.question_type === "Table Analysis" && currentPassage ? (
        <TableAnalysisRenderer
          passage={currentPassage}
          question={q}
          selectedAnswer={qs?.selectedAnswer ?? null}
          onSelect={onSelect}
          locked={isSimulation}
          showCorrect={isReview}
          hideSources
        />
      ) : q.question_type === "Multi-Source Reasoning" && groupPassages.length > 0 ? (
        <MultiSourceRenderer
          passages={groupPassages}
          question={q}
          selectedAnswer={qs?.selectedAnswer ?? null}
          onSelect={onSelect}
          locked={isSimulation}
          showCorrect={isReview}
          hideSources={isMSRSplit}
        />
      ) : q.question_type === "Graphics Interpretation" && currentPassage ? (
        <GraphicsRenderer
          passage={currentPassage}
          question={q}
          selectedAnswer={qs?.selectedAnswer ?? null}
          onSelect={onSelect}
          locked={isSimulation}
          showCorrect={isReview}
          hideSources
        />
      ) : (
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
                          : "border-slate-200 bg-white hover:border-blue-300 hover:bg-blue-50 dark:border-slate-700/50 dark:bg-slate-800/30 dark:hover:border-slate-600 dark:hover:bg-slate-800/50"
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
                            : "bg-slate-200 text-slate-600 group-hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-400 dark:group-hover:bg-slate-600"
                    }`}
                  >
                    {letter}
                  </span>
                  <span className="text-sm leading-relaxed pt-0.5">{text}</span>
                  {showResult && isCorrectAns && (
                    <span className="ml-auto text-green-400 text-sm flex-shrink-0">
                      <FaIcon icon={faCircleCheck} className="h-4 w-4" />
                    </span>
                  )}
                </button>
              );
            })}
        </div>
      )}

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
              <FaIcon icon={faStar} className="h-4 w-4 text-amber-400" />
            </button>
          ))}
        </div>
      )}

      {/* Review mode explanation */}
      {isReview && q.explanation && (
        <div className="mt-4 p-4 bg-slate-800/60 rounded-xl border border-slate-600/60">
          <h4 className="text-sm font-semibold text-blue-300 mb-2">
            Explanation
          </h4>
          <p className="text-sm text-slate-200 leading-relaxed whitespace-pre-wrap">
            {q.explanation}
          </p>
        </div>
      )}
    </div>
  );
}
