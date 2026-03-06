"use client";

import React, { useEffect, useRef, useState, useCallback, use } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  faArrowRight,
  faCircleCheck,
  faClock,
  faTriangleExclamation,
} from "@fortawesome/free-solid-svg-icons";
import { FaIcon } from "@/components/ui/fa-icon";
import {
  getQuestionsBySetId,
  createSession,
  saveResponses,
  saveTrackingEvents,
  updateSession,
  updateSimulationSection,
  updateSimulationExam,
  getPassagesBySetId,
} from "@/lib/db";
import {
  useSimulationStore,
  selectCurrentSection,
  selectIsLastSection,
  SECTION_LABELS,
  SectionResult,
} from "@/store/simulationStore";
import {
  Question,
  AnswerChange,
  TrackingEventType,
  Passage,
} from "@/types/gmat";

// ─── Constants ────────────────────────────────────────────────

const SECTION_TIMER_SECS = 45 * 60; // 45 minutes
const TRIAGE_SECS = 120; // 2 minutes per-question ring

// ─── Per-Question Timer Ring (Feature 2) ─────────────────────

interface TimerRingProps {
  startMs: number;
  totalSecs: number;
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

  let color = "#3B82F6";
  let pulse = false;
  if (remaining <= 0) {
    color = "#EF4444";
    pulse = true;
  } else if (elapsed >= 90) {
    color = "#F59E0B";
  } else if (elapsed >= Math.floor(totalSecs * 0.75)) {
    color = "#EF4444";
    pulse = true;
  }

  return (
    <div
      className={`relative w-12 h-12 flex-shrink-0 ${pulse ? "animate-pulse" : ""}`}
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

// ─── Triage Banner ────────────────────────────────────────────

function TriageBanner({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div className="fixed bottom-0 left-0 right-0 z-50">
      <div className="mx-auto max-w-4xl mb-4 px-4">
        <div className="bg-amber-950/95 border border-amber-500/40 rounded-xl px-5 py-3 flex items-center gap-4 shadow-2xl shadow-amber-900/50 backdrop-blur">
          <FaIcon icon={faClock} className="text-xl flex-shrink-0 text-amber-300" />
          <p className="text-amber-200 text-sm flex-1">
            2 minutes. Make your best guess and move on — do not spiral.
          </p>
          <Button
            variant="ghost"
            size="sm"
            className="text-amber-400 hover:text-amber-200 text-xs h-8 flex-shrink-0"
            onClick={onDismiss}
          >
            Dismiss
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Section Timer Display ────────────────────────────────────

interface SectionTimerProps {
  startedAt: string; // ISO string
  onExpire: () => void;
  sectionLabel: string;
}

function SectionTimer({
  startedAt,
  onExpire,
  sectionLabel,
}: SectionTimerProps) {
  const [remaining, setRemaining] = useState(SECTION_TIMER_SECS);
  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;
  const expiredRef = useRef(false);
  const warned10Ref = useRef(false);
  const warned5Ref = useRef(false);
  const warned1Ref = useRef(false);

  useEffect(() => {
    const startMs = new Date(startedAt).getTime();
    const id = setInterval(() => {
      const elapsed = (Date.now() - startMs) / 1000;
      const rem = Math.max(0, SECTION_TIMER_SECS - elapsed);
      setRemaining(rem);

      // Warning toasts
      if (rem <= 60 && !warned1Ref.current) {
        warned1Ref.current = true;
        toast.warning("1 minute remaining", { duration: 4000 });
      } else if (rem <= 300 && !warned5Ref.current) {
        warned5Ref.current = true;
      } else if (rem <= 600 && !warned10Ref.current) {
        warned10Ref.current = true;
      }

      if (rem <= 0 && !expiredRef.current) {
        expiredRef.current = true;
        clearInterval(id);
        onExpireRef.current();
      }
    }, 500);

    return () => clearInterval(id);
  }, [startedAt]);

  const mins = Math.floor(remaining / 60);
  const secs = Math.floor(remaining % 60);
  const formatted = `${mins}:${secs.toString().padStart(2, "0")}`;

  const colorClass =
    remaining <= 60
      ? "text-red-400 animate-pulse"
      : remaining <= 300
        ? "text-red-400"
        : remaining <= 600
          ? "text-amber-400"
          : "text-slate-200";

  return (
    <div className="flex flex-col items-center">
      <span
        className={`font-mono text-2xl font-bold tabular-nums ${colorClass}`}
      >
        {formatted}
      </span>
      <span className="text-xs text-slate-500 mt-0.5">{sectionLabel}</span>
    </div>
  );
}

// ─── Section Summary Screen ───────────────────────────────────

interface SectionSummaryProps {
  sectionResult: SectionResult;
  sectionIndex: number;
  totalSections: number;
  isLastSection: boolean;
  breaksEnabled: boolean;
  onTakeBreak: () => void;
  onSkipBreak: () => void;
  onBeginNextSection: () => void;
  onViewScore: () => void;
}

function SectionSummary({
  sectionResult,
  sectionIndex,
  totalSections,
  isLastSection,
  breaksEnabled,
  onTakeBreak,
  onSkipBreak,
  onBeginNextSection,
  onViewScore,
}: SectionSummaryProps) {
  const timeMins = Math.floor(sectionResult.timeUsedSeconds / 60);
  const timeSecs = sectionResult.timeUsedSeconds % 60;
  const timeRemaining = SECTION_TIMER_SECS - sectionResult.timeUsedSeconds;
  const remMins = Math.floor(Math.max(0, timeRemaining) / 60);
  const remSecs = Math.floor(Math.max(0, timeRemaining) % 60);

  return (
    <div className="min-h-screen bg-[#0A1628] flex items-center justify-center px-4">
      <div className="max-w-md w-full space-y-6">
        <div className="text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-full mb-4">
            <span className="text-emerald-400 text-sm font-medium">
              Section {sectionIndex + 1} of {totalSections} — Complete
            </span>
          </div>
          <h1 className="text-2xl font-bold text-white">
            {SECTION_LABELS[sectionResult.sectionType]}
          </h1>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4 text-center">
            <div className="text-2xl font-bold text-white">
              {sectionResult.rawCorrect}
              <span className="text-lg text-slate-400">
                /{sectionResult.rawTotal}
              </span>
            </div>
            <div className="text-xs text-slate-400 mt-1">
              Questions answered
            </div>
          </div>
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4 text-center">
            <div className="text-2xl font-bold text-amber-400">
              {sectionResult.questionsSkipped}
            </div>
            <div className="text-xs text-slate-400 mt-1">Skipped</div>
          </div>
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4 text-center">
            <div className="text-lg font-bold text-white font-mono">
              {timeMins}:{timeSecs.toString().padStart(2, "0")}
            </div>
            <div className="text-xs text-slate-400 mt-1">Time used</div>
          </div>
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4 text-center">
            <div className="text-lg font-bold text-emerald-400 font-mono">
              {remMins}:{remSecs.toString().padStart(2, "0")}
            </div>
            <div className="text-xs text-slate-400 mt-1">Time remaining</div>
          </div>
        </div>

        <p className="text-xs text-center text-slate-500">
          No per-question review available here — access full review after the
          exam.
        </p>

        {/* Actions */}
        {isLastSection ? (
          <Button
            className="w-full bg-indigo-600 hover:bg-indigo-500 text-white h-11 font-semibold"
            onClick={onViewScore}
          >
            <span className="inline-flex items-center gap-2">
              View Score Report <FaIcon icon={faArrowRight} className="h-4 w-4" />
            </span>
          </Button>
        ) : (
          <div className="space-y-3">
            {breaksEnabled ? (
              <>
                <Button
                  className="w-full bg-indigo-600 hover:bg-indigo-500 text-white h-11"
                  onClick={onTakeBreak}
                >
                  Take a 10-minute break
                </Button>
                <button
                  className="w-full text-sm text-slate-400 hover:text-slate-200 transition-colors"
                  onClick={onSkipBreak}
                >
                  <span className="inline-flex items-center gap-2 justify-center">
                    Skip break, continue to Section {sectionIndex + 2}{" "}
                    <FaIcon icon={faArrowRight} className="h-3.5 w-3.5" />
                  </span>
                </button>
              </>
            ) : (
              <Button
                className="w-full bg-indigo-600 hover:bg-indigo-500 text-white h-11"
                onClick={onBeginNextSection}
              >
                <span className="inline-flex items-center gap-2">
                  Begin Section {sectionIndex + 2}{" "}
                  <FaIcon icon={faArrowRight} className="h-4 w-4" />
                </span>
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Section Countdown Overlay ────────────────────────────────

function SectionCountdown({
  sectionNumber,
  label,
  onDone,
}: {
  sectionNumber: number;
  label: string;
  onDone: () => void;
}) {
  const [count, setCount] = useState(3);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    if (count <= 0) {
      onDoneRef.current();
      return;
    }
    const t = setTimeout(() => setCount((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [count]);

  return (
    <div className="min-h-screen bg-[#0A1628] flex items-center justify-center">
      <div className="text-center space-y-4">
        <p className="text-slate-400 text-sm uppercase tracking-widest">
          Section {sectionNumber}
        </p>
        <h2 className="text-2xl font-semibold text-white">{label}</h2>
        <div className="text-7xl font-bold text-indigo-400 tabular-nums my-6">
          {count > 0 ? count : <FaIcon icon={faArrowRight} className="h-12 w-12" />}
        </div>
        <p className="text-slate-500 text-sm">Starting now…</p>
      </div>
    </div>
  );
}

// ─── Local State Types ────────────────────────────────────────

interface LocalQuestionState {
  selectedAnswer: string | null;
  answerChanges: AnswerChange[];
  triageTriggered: boolean;
  triageDismissed: boolean;
  questionDisplayedAt: number; // performance.now()
  questionTimerStartMs: number; // performance.now()
  timeSpentMs: number;
}

type PendingTrackingEvent = {
  event_type: TrackingEventType;
  question_id?: string;
  event_data?: Record<string, unknown>;
  timestamp_offset_ms: number;
};

// ─── Main Simulation Exam Page ────────────────────────────────

export default function SimulationExamPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: simulationId } = use(params);
  const router = useRouter();

  const simState = useSimulationStore();
  const {
    status,
    currentSectionIndex,
    sections,
    breaksEnabled,
    sectionTimerStartedAt,
    startSection,
    completeSectionWithResult,
    startBreak,
    advanceToNextSection,
    completeSimulation,
    recordSectionTimerStart,
  } = simState;

  const currentSection = selectCurrentSection(simState);
  const isLastSection = selectIsLastSection(simState);

  // ── Local state ───────────────────────────────────────────
  const [questions, setQuestions] = useState<Question[]>([]);
  const [passages, setPassages] = useState<Passage[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [questionStates, setQuestionStates] = useState<
    Record<number, LocalQuestionState>
  >({});
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [pendingEvents, setPendingEvents] = useState<PendingTrackingEvent[]>(
    [],
  );
  const [sessionStartMs, setSessionStartMs] = useState(0);
  const [loading, setLoading] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);
  const [showCountdown, setShowCountdown] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sectionResult, setSectionResult] = useState<SectionResult | null>(
    null,
  );

  // Triage
  const [showTriage, setShowTriage] = useState(false);
  const triageFiredRef = useRef(false);
  const triageDismissedRef = useRef(false);

  // Unanswered confirmation
  const [showUnansweredWarning, setShowUnansweredWarning] = useState(false);

  // ── Guard: redirect if simulationId doesn't match ─────────
  useEffect(() => {
    if (!simState.simulationId && status === "idle") {
      router.replace("/");
    }
    if (status === "completed") {
      router.replace(`/exam/simulation/${simulationId}/score`);
    }
  }, [simState.simulationId, status, simulationId, router]);

  // ── Initialize section when status is 'countdown' ─────────
  useEffect(() => {
    if (status !== "countdown") return;
    if (!currentSection || !currentSection.questionSetId) return;

    const isFirstSection = currentSectionIndex === 0;
    if (isFirstSection) {
      // No countdown for section 1 (setup wizard already showed one)
      initializeSection();
    } else {
      // Show countdown for sections 2/3
      setShowCountdown(true);
    }
  }, [status, currentSectionIndex]);

  const initializeSection = useCallback(async () => {
    if (!currentSection?.questionSetId) return;
    setLoading(true);
    setInitError(null);
    setShowCountdown(false);
    setShowUnansweredWarning(false);
    setShowTriage(false);
    setPendingEvents([]);

    try {
      const qs = await getQuestionsBySetId(currentSection.questionSetId);
      if (!qs || qs.length === 0) {
        throw new Error(
          "No questions found for this section. Please check the question set.",
        );
      }
      setQuestions(qs);

      const ps = await getPassagesBySetId(currentSection.questionSetId);
      setPassages(ps);

      setCurrentIndex(0);

      const now = performance.now();
      const initStates: Record<number, LocalQuestionState> = {};
      qs.forEach((_, i) => {
        initStates[i] = {
          selectedAnswer: null,
          answerChanges: [],
          triageTriggered: false,
          triageDismissed: false,
          questionDisplayedAt: i === 0 ? now : 0,
          questionTimerStartMs: i === 0 ? now : 0,
          timeSpentMs: 0,
        };
      });
      setQuestionStates(initStates);
      setSessionStartMs(now);

      // Create exam_session record — try with simulation fields first, fall back without them
      let sid: string;
      try {
        sid = await createSession({
          set_id: currentSection.questionSetId,
          mode: "simulation",
          total_count: qs.length,
          simulation_exam_id: simulationId,
          simulation_section_order: currentSectionIndex + 1,
        });
      } catch {
        // Column may not exist in this deployment — retry without simulation metadata
        sid = await createSession({
          set_id: currentSection.questionSetId,
          mode: "simulation",
          total_count: qs.length,
        });
      }
      setSessionId(sid);

      // Update simulation store: session started -> status becomes 'in_section'
      startSection(sid, currentSection.sectionRecordId ?? sid);

      triageFiredRef.current = false;
      triageDismissedRef.current = false;
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : "Failed to load section. Please try again.";
      console.error("Failed to initialize section:", err);
      setInitError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [currentSection, simulationId, currentSectionIndex, startSection]);

  // ── Question time tracking ─────────────────────────────────
  const recordCurrentQuestionTime = useCallback(() => {
    const now = performance.now();
    setQuestionStates((prev) => {
      const qs = prev[currentIndex];
      if (!qs || !qs.questionDisplayedAt) return prev;
      const spent = now - qs.questionDisplayedAt;
      return {
        ...prev,
        [currentIndex]: {
          ...qs,
          timeSpentMs: qs.timeSpentMs + spent,
          questionDisplayedAt: 0,
        },
      };
    });
  }, [currentIndex]);

  // ── Tracking event helper ──────────────────────────────────
  const trackEvent = useCallback(
    (type: TrackingEventType, data?: Record<string, unknown>) => {
      const offset = sessionStartMs
        ? Math.round(performance.now() - sessionStartMs)
        : 0;
      setPendingEvents((prev) => [
        ...prev,
        { event_type: type, event_data: data, timestamp_offset_ms: offset },
      ]);
    },
    [sessionStartMs],
  );

  // ── Navigate to next question ──────────────────────────────
  const goToNext = useCallback(() => {
    if (currentIndex >= questions.length - 1) return;
    recordCurrentQuestionTime();
    const now = performance.now();
    const nextIdx = currentIndex + 1;
    setCurrentIndex(nextIdx);
    setShowTriage(false);
    triageFiredRef.current = false;
    triageDismissedRef.current = false;
    setShowUnansweredWarning(false);
    setQuestionStates((prev) => {
      const existing = prev[nextIdx];
      return {
        ...prev,
        [nextIdx]: existing
          ? {
              ...existing,
              questionDisplayedAt: now,
              questionTimerStartMs: existing.questionTimerStartMs || now,
            }
          : {
              selectedAnswer: null,
              answerChanges: [],
              triageTriggered: false,
              triageDismissed: false,
              questionDisplayedAt: now,
              questionTimerStartMs: now,
              timeSpentMs: 0,
            },
      };
    });
    trackEvent("navigated_to_question", { to_q: nextIdx + 1 });
  }, [currentIndex, questions.length, recordCurrentQuestionTime, trackEvent]);

  // ── Handle "Next" button click ─────────────────────────────
  const handleNextClick = useCallback(() => {
    const qs = questionStates[currentIndex];
    const isLastQ = currentIndex >= questions.length - 1;

    if (!qs?.selectedAnswer) {
      if (showUnansweredWarning) {
        // Confirmed skip
        setShowUnansweredWarning(false);
        if (isLastQ) {
          handleSectionComplete();
        } else {
          goToNext();
        }
      } else {
        setShowUnansweredWarning(true);
      }
      return;
    }

    setShowUnansweredWarning(false);
    if (isLastQ) {
      handleSectionComplete();
    } else {
      goToNext();
    }
  }, [
    questionStates,
    currentIndex,
    questions.length,
    showUnansweredWarning,
    goToNext,
  ]);

  // ── Section auto-submit (timer expires) ───────────────────
  const handleSectionTimerExpire = useCallback(() => {
    toast.info("Time's up! Section ended.");
    handleSectionComplete();
  }, []);

  // ── Section complete: save + show summary ─────────────────
  const handleSectionComplete = useCallback(async () => {
    if (saving) return;
    setSaving(true);
    recordCurrentQuestionTime();

    try {
      // Build responses from local state
      const qsCopy = { ...questionStates };
      const responsesData = questions.map((q, i) => {
        const s = qsCopy[i];
        return {
          session_id: sessionId!,
          question_id: q.id,
          question_order: i + 1,
          selected_answer: s?.selectedAnswer || null,
          is_correct: s?.selectedAnswer
            ? s.selectedAnswer === q.correct_answer
            : null,
          time_spent_seconds: Math.round((s?.timeSpentMs || 0) / 1000),
          flagged_for_review: false,
          answer_changes: s?.answerChanges || [],
          first_answer: s?.answerChanges?.[0]?.to || s?.selectedAnswer || null,
          triage_triggered: s?.triageTriggered || false,
        };
      });

      const correctCount = responsesData.filter((r) => r.is_correct).length;
      const skippedCount = responsesData.filter(
        (r) => !r.selected_answer,
      ).length;
      const timeUsedSeconds = sectionTimerStartedAt
        ? Math.min(
            SECTION_TIMER_SECS,
            Math.round(
              (Date.now() - new Date(sectionTimerStartedAt).getTime()) / 1000,
            ),
          )
        : 0;

      await saveResponses(responsesData);
      await updateSession(sessionId!, {
        completed_at: new Date().toISOString(),
        total_time_seconds: timeUsedSeconds,
        correct_count: correctCount,
        total_count: questions.length,
        score:
          questions.length > 0
            ? Math.round((correctCount / questions.length) * 100)
            : 0,
      });

      if (pendingEvents.length > 0) {
        await saveTrackingEvents(
          pendingEvents.map((e) => ({
            session_id: sessionId!,
            question_id: e.question_id,
            event_type: e.event_type,
            event_data: e.event_data,
            timestamp_offset_ms: e.timestamp_offset_ms,
          })),
        );
      }

      // Compute scaled score: floor((correct/total) * 30 + 60), range 60–90
      const scaledScore =
        questions.length > 0
          ? Math.max(
              60,
              Math.min(
                90,
                Math.floor((correctCount / questions.length) * 30 + 60),
              ),
            )
          : 60;

      // Update simulation section record
      if (currentSection?.sectionRecordId) {
        await updateSimulationSection(currentSection.sectionRecordId, {
          scaled_score: scaledScore,
          raw_correct: correctCount,
          raw_total: questions.length,
          time_used_seconds: timeUsedSeconds,
          questions_skipped: skippedCount,
          completed_at: new Date().toISOString(),
          session_id: sessionId!,
        });
      }

      const result: SectionResult = {
        sectionType: currentSection!.sectionType,
        sectionOrder: currentSectionIndex + 1,
        scaledScore,
        rawCorrect: correctCount,
        rawTotal: questions.length,
        timeUsedSeconds,
        questionsSkipped: skippedCount,
        sessionId: sessionId!,
      };

      setSectionResult(result);
      completeSectionWithResult(result);
    } catch (err) {
      console.error("Failed to save section:", err);
      toast.error("Failed to save section. Please check your connection.");
    } finally {
      setSaving(false);
    }
  }, [
    saving,
    recordCurrentQuestionTime,
    questionStates,
    questions,
    sessionId,
    sectionTimerStartedAt,
    pendingEvents,
    currentSection,
    currentSectionIndex,
    completeSectionWithResult,
  ]);

  // ── Triage expire ──────────────────────────────────────────
  const handleTriageExpire = useCallback(() => {
    if (triageFiredRef.current || triageDismissedRef.current) return;
    const qs = questionStates[currentIndex];
    if (qs?.selectedAnswer) return;
    triageFiredRef.current = true;
    setShowTriage(true);
    setQuestionStates((prev) => ({
      ...prev,
      [currentIndex]: { ...prev[currentIndex], triageTriggered: true },
    }));
    trackEvent("triage_triggered", { question_number: currentIndex + 1 });
  }, [questionStates, currentIndex, trackEvent]);

  // ── Select answer ──────────────────────────────────────────
  const selectAnswer = useCallback(
    (letter: string) => {
      const now = performance.now();
      const elapsed = sessionStartMs ? Math.round(now - sessionStartMs) : 0;
      setQuestionStates((prev) => {
        const existing = prev[currentIndex];
        const changes = [...(existing?.answerChanges || [])];
        if (existing?.selectedAnswer && existing.selectedAnswer !== letter) {
          changes.push({
            from: existing.selectedAnswer,
            to: letter,
            timestamp_offset_ms: elapsed,
          });
        }
        return {
          ...prev,
          [currentIndex]: {
            ...existing,
            selectedAnswer: letter,
            answerChanges: changes,
          },
        };
      });
    },
    [currentIndex, sessionStartMs],
  );

  // ── Keyboard shortcuts ─────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (status !== "in_section") return;
      if (
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLInputElement
      )
        return;
      if (e.key === "ArrowRight" || e.key === "n") handleNextClick();
      if (["a", "b", "c", "d", "e"].includes(e.key.toLowerCase())) {
        selectAnswer(e.key.toUpperCase());
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [status, handleNextClick, selectAnswer]);

  // ── After section summary actions ─────────────────────────
  const handleTakeBreak = () => {
    startBreak();
    router.push(`/exam/simulation/${simulationId}/break`);
  };

  const handleSkipBreak = () => {
    advanceToNextSection();
    // Status becomes 'countdown', which triggers initializeSection flow via useEffect
  };

  const handleBeginNextSection = () => {
    advanceToNextSection();
  };

  const handleViewScore = async () => {
    // Update simulation_exams record
    const results = [...simState.sectionResults, sectionResult].filter(
      Boolean,
    ) as SectionResult[];
    const totalScore = computeTotalScore(results);
    try {
      await updateSimulationExam(simulationId, {
        status: "completed",
        completed_at: new Date().toISOString(),
        total_score: totalScore,
      });
    } catch (err) {
      console.error("Failed to update simulation exam:", err);
    }
    completeSimulation();
    router.push(`/exam/simulation/${simulationId}/score`);
  };

  // ── Render states ──────────────────────────────────────────

  if (!simState.simulationId || status === "idle") {
    return null;
  }

  if (status === "completed") {
    return null;
  }

  // Section Summary Screen
  if (status === "section_summary" && sectionResult) {
    return (
      <SectionSummary
        sectionResult={sectionResult}
        sectionIndex={currentSectionIndex}
        totalSections={sections.length}
        isLastSection={isLastSection}
        breaksEnabled={breaksEnabled}
        onTakeBreak={handleTakeBreak}
        onSkipBreak={handleSkipBreak}
        onBeginNextSection={handleBeginNextSection}
        onViewScore={handleViewScore}
      />
    );
  }

  // Section countdown (for sections 2 and 3)
  if (showCountdown && currentSection) {
    return (
      <SectionCountdown
        sectionNumber={currentSectionIndex + 1}
        label={SECTION_LABELS[currentSection.sectionType]}
        onDone={initializeSection}
      />
    );
  }

  // Show error state with retry if initialization failed
  if (initError && !loading) {
    return (
      <div className="min-h-screen bg-[#0A1628] flex items-center justify-center px-4">
        <div className="text-center space-y-4 max-w-sm">
          <div className="flex justify-center">
            <FaIcon icon={faTriangleExclamation} className="h-10 w-10 text-amber-400" />
          </div>
          <h2 className="text-white font-semibold text-lg">
            Failed to load section
          </h2>
          <p className="text-slate-400 text-sm">{initError}</p>
          <Button
            onClick={() => {
              setInitError(null);
              initializeSection();
            }}
            className="bg-indigo-600 hover:bg-indigo-500"
          >
            Retry
          </Button>
        </div>
      </div>
    );
  }

  if (loading || (status === "countdown" && questions.length === 0)) {
    return (
      <div className="min-h-screen bg-[#0A1628] flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-slate-400 text-sm">Loading section…</p>
        </div>
      </div>
    );
  }

  if (status !== "in_section") return null;

  // ── Exam UI ────────────────────────────────────────────────

  const currentQ = questions[currentIndex];
  const qs = questionStates[currentIndex];
  if (!currentQ) return null;

  const choices = ["A", "B", "C", "D", "E"]
    .map((l) => ({
      letter: l,
      text: currentQ[`choice_${l.toLowerCase()}` as keyof Question] as string,
    }))
    .filter((c) => c.text);

  const isDS = currentQ.question_type === "Data Sufficiency";
  const isRC =
    currentQ.question_type === "Reading Comprehension" || !!currentQ.passage_id;
  // Resolve passage text from the passages table (loaded during initialization)
  const passageText = (() => {
    if (!currentQ?.passage_id) return "";
    return (
      passages.find((p) => p.id === currentQ.passage_id)?.passage_text || ""
    );
  })();
  const showTimerRing = qs?.questionTimerStartMs > 0;

  return (
    <div className="min-h-screen flex flex-col bg-[#0A1628]">
      {/* ── Top Bar ── */}
      <header className="border-b border-slate-800 bg-[#0A1628]/95 backdrop-blur sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-4 py-2 flex items-center gap-4">
          {/* Progress dots — display only, not interactive for past questions */}
          <div className="flex gap-1 flex-1 overflow-x-auto">
            {questions.map((_, i) => {
              const s = questionStates[i];
              return (
                <div
                  key={i}
                  className={`w-6 h-6 rounded text-xs font-bold flex-shrink-0 flex items-center justify-center ${
                    i === currentIndex
                      ? "bg-blue-500 text-white scale-110 ring-2 ring-blue-400/50"
                      : s?.selectedAnswer
                        ? "bg-slate-600 text-white"
                        : "bg-slate-800 text-slate-400"
                  }`}
                >
                  {i + 1}
                </div>
              );
            })}
          </div>

          {/* Section timer — center, prominent */}
          {sectionTimerStartedAt && (
            <SectionTimer
              startedAt={sectionTimerStartedAt}
              onExpire={handleSectionTimerExpire}
              sectionLabel={`${SECTION_LABELS[currentSection!.sectionType].split(" ")[0]}`}
            />
          )}

          {/* Simulation badge */}
          <Badge
            variant="outline"
            className="border-indigo-500/30 text-indigo-400 text-xs flex-shrink-0"
          >
            SIM · {currentSectionIndex + 1}/{sections.length}
          </Badge>
        </div>
      </header>

      {/* ── Main Content ── */}
      <main className="flex-1 max-w-6xl mx-auto w-full px-4 py-6">
        {isRC ? (
          /* RC: Two-column — no passage map gate */
          <div className="grid grid-cols-[55%_45%] gap-6 h-[calc(100vh-120px)]">
            <div className="overflow-y-auto pr-2">
              {(passageText || currentQ.stem)
                .split(/\n\n+/)
                .filter((p) => p.trim())
                .map((para, i) => (
                  <div key={i} className="flex gap-3 mb-4">
                    <span className="text-blue-400 font-bold text-sm flex-shrink-0 mt-0.5">
                      P{i + 1}
                    </span>
                    <p className="text-sm leading-relaxed text-slate-200">
                      {para}
                    </p>
                  </div>
                ))}
            </div>
            <div className="overflow-y-auto">
              <SimQuestionPanel
                q={currentQ}
                qs={qs}
                choices={choices}
                isDS={isDS}
                showTimerRing={showTimerRing}
                onSelect={selectAnswer}
                onTriageExpire={handleTriageExpire}
                currentIndex={currentIndex}
                totalQuestions={questions.length}
              />
            </div>
          </div>
        ) : (
          <SimQuestionPanel
            q={currentQ}
            qs={qs}
            choices={choices}
            isDS={isDS}
            showTimerRing={showTimerRing}
            onSelect={selectAnswer}
            onTriageExpire={handleTriageExpire}
            currentIndex={currentIndex}
            totalQuestions={questions.length}
          />
        )}
      </main>

      {/* ── Bottom Navigation ── */}
      <footer className="border-t border-slate-800 bg-[#0A1628]/95 backdrop-blur sticky bottom-0">
        <div className="max-w-6xl mx-auto px-4 py-3 space-y-2">
          {/* Unanswered warning */}
          {showUnansweredWarning && (
            <div className="flex items-center justify-between bg-amber-950/60 border border-amber-500/30 rounded-lg px-4 py-2">
              <span className="text-amber-300 text-sm">
                You haven&apos;t selected an answer. Proceed anyway?
              </span>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-amber-400 hover:text-amber-200 text-xs h-7"
                  onClick={() => setShowUnansweredWarning(false)}
                >
                  Go back
                </Button>
                <Button
                  size="sm"
                  className="bg-amber-600 hover:bg-amber-700 text-xs h-7"
                  onClick={() => {
                    setShowUnansweredWarning(false);
                    if (currentIndex >= questions.length - 1)
                      handleSectionComplete();
                    else goToNext();
                  }}
                >
                  Yes, skip
                </Button>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between">
            {/* No back button in simulation mode */}
            <div />
            <span className="text-slate-500 text-sm">
              {currentIndex + 1} / {questions.length}
            </span>
            <Button
              onClick={handleNextClick}
              disabled={saving}
              className={
                currentIndex >= questions.length - 1
                  ? "bg-green-600 hover:bg-green-700 text-white"
                  : "bg-blue-600 hover:bg-blue-700 text-white"
              }
            >
              {saving
                ? "Saving…"
                : currentIndex >= questions.length - 1
                  ? (
                      <span className="inline-flex items-center gap-2">
                        End Section <FaIcon icon={faCircleCheck} className="h-4 w-4" />
                      </span>
                    )
                  : (
                      <span className="inline-flex items-center gap-2">
                        Next <FaIcon icon={faArrowRight} className="h-4 w-4" />
                      </span>
                    )}
            </Button>
          </div>
        </div>
      </footer>

      {/* ── Triage Banner (no flag button in simulation) ── */}
      {showTriage && !qs?.triageDismissed && (
        <TriageBanner
          onDismiss={() => {
            setShowTriage(false);
            triageDismissedRef.current = true;
            setQuestionStates((prev) => ({
              ...prev,
              [currentIndex]: { ...prev[currentIndex], triageDismissed: true },
            }));
            trackEvent("triage_dismissed");
          }}
        />
      )}
    </div>
  );
}

// ─── Simulation Question Panel ────────────────────────────────

interface SimQuestionPanelProps {
  q: Question;
  qs: LocalQuestionState;
  choices: { letter: string; text: string }[];
  isDS: boolean;
  showTimerRing: boolean;
  onSelect: (l: string) => void;
  onTriageExpire: () => void;
  currentIndex: number;
  totalQuestions: number;
}

function SimQuestionPanel({
  q,
  qs,
  choices,
  isDS,
  showTimerRing,
  onSelect,
  onTriageExpire,
  currentIndex,
}: SimQuestionPanelProps) {
  return (
    <div className="space-y-4 max-w-3xl mx-auto">
      {/* Question header — no flag button */}
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
        </div>
        {showTimerRing && (
          <TimerRing
            startMs={qs?.questionTimerStartMs || 0}
            totalSecs={TRIAGE_SECS}
            onExpire={onTriageExpire}
          />
        )}
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

      {/* Answer choices */}
      <div className="space-y-2">
        {choices.map(({ letter, text }) => {
          const isSelected = qs?.selectedAnswer === letter;
          return (
            <button
              key={letter}
              onClick={() => onSelect(letter)}
              className={`w-full text-left p-4 rounded-xl border transition-all duration-150 flex items-start gap-3 group ${
                isSelected
                  ? "border-blue-500 bg-blue-500/15 shadow-lg shadow-blue-500/10"
                  : "border-slate-700/50 bg-slate-800/30 hover:border-slate-600 hover:bg-slate-800/50"
              }`}
            >
              <span
                className={`w-7 h-7 rounded-lg flex items-center justify-center text-sm font-bold flex-shrink-0 mt-0.5 transition-colors ${
                  isSelected
                    ? "bg-blue-500 text-white"
                    : "bg-slate-700 text-slate-400 group-hover:bg-slate-600"
                }`}
              >
                {letter}
              </span>
              <span className="text-sm leading-relaxed pt-0.5">{text}</span>
            </button>
          );
        })}
      </div>
      {/* No confidence rating in simulation mode */}
    </div>
  );
}

// ─── Score Calculation Helper ─────────────────────────────────

function computeTotalScore(results: SectionResult[]): number {
  if (!results.length) return 205;
  const sum = results.reduce((acc, r) => acc + r.scaledScore, 0);
  // 3 sections × 60–90 = 180–270 -> map to 205–805
  return Math.floor((sum / 270) * 600 + 205);
}
