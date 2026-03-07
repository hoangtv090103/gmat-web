'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  Question,
  ExamMode,
  AnswerChange,
  TrackingEventType,
  ErrorCategory,
} from '@/types/gmat';

// ─── Types ───────────────────────────────────────────────────

export interface QuestionState {
  selectedAnswer: string | null;
  // DI Two-Part Analysis: Part 2 selection (Part 1 uses selectedAnswer)
  selectedAnswer2: string | null;
  firstAnswer: string | null;
  answerChanges: AnswerChange[];
  flagged: boolean;
  timeSpentMs: number;
  confidenceRating?: number;
  questionDisplayedAt: number;
  // Feature 1: Error categorization
  errorCategory?: ErrorCategory;
  note?: string;
  // Feature 2: Triage
  triageTriggered: boolean;
  triageDismissed: boolean;
  // Feature 3: CR Missing Link
  missingLink?: string;
  choicesUnlocked: boolean;
  // Feature 4: RC Passage Map
  passageMap?: Record<string, string>;
  passageMapComplete: boolean;
  // Per-question timer (starts when choices unlock / question displayed)
  questionTimerStartMs: number;
}

interface PendingEvent {
  event_type: TrackingEventType;
  question_id?: string;
  event_data?: Record<string, unknown>;
  timestamp_offset_ms: number;
}

interface ExamState {
  // Session
  sessionId: string | null;
  setId: string | null;
  mode: ExamMode;
  questions: Question[];
  isActive: boolean;
  isSubmitted: boolean;

  // Navigation
  currentIndex: number;
  questionStates: Record<number, QuestionState>;

  // Timer (global session)
  sessionStartTime: number;
  totalTimeMs: number;
  remainingTimeMs: number;
  timerWarnings: Set<string>;

  // Tracking
  pendingEvents: PendingEvent[];

  // Actions
  initSession: (params: {
    sessionId: string;
    setId: string;
    mode: ExamMode;
    questions: Question[];
    totalTimeMs: number;
  }) => void;
  selectAnswer: (answer: string) => void;
  selectAnswer2: (answer: string) => void;
  deselectAnswer: () => void;
  toggleFlag: () => void;
  setConfidence: (rating: number) => void;
  navigateTo: (index: number) => void;
  navigateNext: () => void;
  navigateBack: () => void;
  updateTimer: (elapsedMs: number) => void;
  addTimerWarning: (warning: string) => void;
  trackEvent: (type: TrackingEventType, data?: Record<string, unknown>) => void;
  submitExam: () => void;
  resetSession: () => void;
  getElapsedMs: () => number;
  getCurrentQuestionState: () => QuestionState;
  recordQuestionTime: () => void;
  // Feature 1
  setErrorCategory: (category: ErrorCategory) => void;
  setNote: (note: string) => void;
  // Feature 2
  triggerTriage: () => void;
  dismissTriage: () => void;
  // Feature 3
  setMissingLink: (text: string) => void;
  unlockChoices: () => void;
  // Feature 4
  setPassageMap: (map: Record<string, string>) => void;
  completePassageMap: () => void;
}

function makeInitialQState(
  questionType: string,
  mode: ExamMode,
  isFirst: boolean,
  now: number
): QuestionState {
  const isCR = questionType === 'Critical Reasoning';
  const isRC = questionType === 'Reading Comprehension';
  const choicesUnlocked = mode === 'review' || (!isCR && !isRC);
  const passageMapComplete = mode === 'review' || !isRC;

  return {
    selectedAnswer: null,
    selectedAnswer2: null,
    firstAnswer: null,
    answerChanges: [],
    flagged: false,
    timeSpentMs: 0,
    confidenceRating: undefined,
    questionDisplayedAt: isFirst ? now : 0,
    errorCategory: undefined,
    note: undefined,
    triageTriggered: false,
    triageDismissed: false,
    missingLink: undefined,
    choicesUnlocked,
    passageMap: undefined,
    passageMapComplete,
    questionTimerStartMs: isFirst && choicesUnlocked && passageMapComplete ? now : 0,
  };
}

export const useExamStore = create<ExamState>()(
  persist(
    (set, get) => ({
      // Initial state
      sessionId: null,
      setId: null,
      mode: 'timed',
      questions: [],
      isActive: false,
      isSubmitted: false,
      currentIndex: 0,
      questionStates: {},
      sessionStartTime: 0,
      totalTimeMs: 0,
      remainingTimeMs: 0,
      timerWarnings: new Set(),
      pendingEvents: [],

      // ─── Actions ─────────────────────────────────────────

      initSession: ({ sessionId, setId, mode, questions, totalTimeMs }) => {
        const now = performance.now();
        const initialStates: Record<number, QuestionState> = {};
        questions.forEach((q, i) => {
          initialStates[i] = makeInitialQState(q.question_type, mode, i === 0, now);
        });

        set({
          sessionId,
          setId,
          mode,
          questions,
          isActive: true,
          isSubmitted: false,
          currentIndex: 0,
          questionStates: initialStates,
          sessionStartTime: now,
          totalTimeMs,
          remainingTimeMs: totalTimeMs,
          timerWarnings: new Set(),
          pendingEvents: [],
        });
      },

      selectAnswer: (answer: string) => {
        const state = get();
        const idx = state.currentIndex;
        const qs = state.questionStates[idx] || makeInitialQState('', state.mode, false, 0);
        const elapsed = performance.now() - state.sessionStartTime;

        const newChanges = [...qs.answerChanges];
        if (qs.selectedAnswer !== null && qs.selectedAnswer !== answer) {
          newChanges.push({
            from: qs.selectedAnswer,
            to: answer,
            timestamp_offset_ms: Math.round(elapsed),
          });
          state.trackEvent('answer_changed', {
            from: qs.selectedAnswer,
            to: answer,
            question_id: state.questions[idx]?.id,
          });
        } else {
          state.trackEvent('answer_selected', {
            answer,
            question_id: state.questions[idx]?.id,
          });
        }

        set({
          questionStates: {
            ...state.questionStates,
            [idx]: {
              ...qs,
              selectedAnswer: answer,
              firstAnswer: qs.firstAnswer || answer,
              answerChanges: newChanges,
            },
          },
        });
      },

      selectAnswer2: (answer: string) => {
        const state = get();
        const idx = state.currentIndex;
        const qs = state.questionStates[idx] || makeInitialQState('', state.mode, false, 0);
        set({
          questionStates: {
            ...state.questionStates,
            [idx]: { ...qs, selectedAnswer2: answer },
          },
        });
      },

      deselectAnswer: () => {
        const state = get();
        if (state.mode === 'timed') return;
        const idx = state.currentIndex;
        const qs = state.questionStates[idx];
        if (!qs) return;
        set({
          questionStates: {
            ...state.questionStates,
            [idx]: { ...qs, selectedAnswer: null },
          },
        });
      },

      toggleFlag: () => {
        const state = get();
        const idx = state.currentIndex;
        const qs = state.questionStates[idx] || makeInitialQState('', state.mode, false, 0);
        const newFlagged = !qs.flagged;
        state.trackEvent(newFlagged ? 'question_flagged' : 'question_unflagged', {
          question_id: state.questions[idx]?.id,
        });
        set({
          questionStates: {
            ...state.questionStates,
            [idx]: { ...qs, flagged: newFlagged },
          },
        });
      },

      setConfidence: (rating: number) => {
        const state = get();
        const idx = state.currentIndex;
        const qs = state.questionStates[idx] || makeInitialQState('', state.mode, false, 0);
        state.trackEvent('confidence_rated', {
          rating,
          question_id: state.questions[idx]?.id,
        });
        set({
          questionStates: {
            ...state.questionStates,
            [idx]: { ...qs, confidenceRating: rating },
          },
        });
      },

      recordQuestionTime: () => {
        const state = get();
        const idx = state.currentIndex;
        const qs = state.questionStates[idx];
        if (!qs || !qs.questionDisplayedAt) return;
        const timeSpent = performance.now() - qs.questionDisplayedAt;
        set({
          questionStates: {
            ...state.questionStates,
            [idx]: { ...qs, timeSpentMs: qs.timeSpentMs + timeSpent },
          },
        });
      },

      navigateTo: (index: number) => {
        const state = get();
        if (index < 0 || index >= state.questions.length) return;
        state.recordQuestionTime();
        const fromQ = state.currentIndex;
        state.trackEvent('navigated_to_question', {
          from_q: fromQ + 1,
          to_q: index + 1,
        });
        const targetQ = state.questions[index];
        const existingQs = state.questionStates[index];
        const now = performance.now();

        // Start question timer only if choices already unlocked and map complete
        const choicesUnlocked = existingQs?.choicesUnlocked ?? (state.mode === 'review' || (targetQ?.question_type !== 'Critical Reasoning' && targetQ?.question_type !== 'Reading Comprehension'));
        const passageMapComplete = existingQs?.passageMapComplete ?? (state.mode === 'review' || targetQ?.question_type !== 'Reading Comprehension');

        const updated: QuestionState = existingQs
          ? {
              ...existingQs,
              questionDisplayedAt: now,
              // Reset triage for this visit if not already triggered
              questionTimerStartMs: choicesUnlocked && passageMapComplete ? now : existingQs.questionTimerStartMs,
            }
          : makeInitialQState(targetQ?.question_type || '', state.mode, true, now);

        // Re-read questionStates after recordQuestionTime() has updated them
        const freshQuestionStates = get().questionStates;
        set({
          currentIndex: index,
          questionStates: {
            ...freshQuestionStates,
            [index]: updated,
          },
        });

        state.trackEvent('question_displayed', {
          question_id: targetQ?.id,
          question_number: index + 1,
        });
      },

      navigateNext: () => {
        const state = get();
        if (state.currentIndex < state.questions.length - 1) {
          state.navigateTo(state.currentIndex + 1);
        }
      },

      navigateBack: () => {
        const state = get();
        if (state.currentIndex > 0) {
          state.navigateTo(state.currentIndex - 1);
        }
      },

      updateTimer: (elapsedMs: number) => {
        const state = get();
        if (state.mode === 'timed') {
          set({ remainingTimeMs: Math.max(0, state.totalTimeMs - elapsedMs) });
        } else {
          set({ remainingTimeMs: elapsedMs });
        }
      },

      addTimerWarning: (warning: string) => {
        const state = get();
        const newWarnings = new Set(state.timerWarnings);
        newWarnings.add(warning);
        set({ timerWarnings: newWarnings });
      },

      trackEvent: (type, data) => {
        const state = get();
        const elapsed = performance.now() - state.sessionStartTime;
        const event: PendingEvent = {
          event_type: type,
          question_id: state.questions[state.currentIndex]?.id,
          event_data: data,
          timestamp_offset_ms: Math.round(elapsed),
        };
        set({ pendingEvents: [...state.pendingEvents, event] });
      },

      submitExam: () => {
        const state = get();
        state.recordQuestionTime();
        state.trackEvent('exam_submitted');
        set({ isActive: false, isSubmitted: true });
      },

      resetSession: () => {
        set({
          sessionId: null,
          setId: null,
          mode: 'timed',
          questions: [],
          isActive: false,
          isSubmitted: false,
          currentIndex: 0,
          questionStates: {},
          sessionStartTime: 0,
          totalTimeMs: 0,
          remainingTimeMs: 0,
          timerWarnings: new Set(),
          pendingEvents: [],
        });
      },

      getElapsedMs: () => {
        const state = get();
        return performance.now() - state.sessionStartTime;
      },

      getCurrentQuestionState: () => {
        const state = get();
        return state.questionStates[state.currentIndex] || makeInitialQState('', state.mode, false, 0);
      },

      // ─── Feature 1: Error Categorization ─────────────────

      setErrorCategory: (category: ErrorCategory) => {
        const state = get();
        const idx = state.currentIndex;
        const qs = state.questionStates[idx];
        if (!qs) return;
        set({
          questionStates: {
            ...state.questionStates,
            [idx]: { ...qs, errorCategory: category },
          },
        });
      },

      setNote: (note: string) => {
        const state = get();
        const idx = state.currentIndex;
        const qs = state.questionStates[idx];
        if (!qs) return;
        set({
          questionStates: {
            ...state.questionStates,
            [idx]: { ...qs, note },
          },
        });
      },

      // ─── Feature 2: Triage ────────────────────────────────

      triggerTriage: () => {
        const state = get();
        const idx = state.currentIndex;
        const qs = state.questionStates[idx];
        if (!qs || qs.triageTriggered) return;
        state.trackEvent('triage_triggered', {
          question_id: state.questions[idx]?.id,
          question_number: idx + 1,
          time_on_question_ms: qs.questionTimerStartMs > 0
            ? Math.round(performance.now() - qs.questionTimerStartMs)
            : 0,
        });
        set({
          questionStates: {
            ...state.questionStates,
            [idx]: { ...qs, triageTriggered: true },
          },
        });
      },

      dismissTriage: () => {
        const state = get();
        const idx = state.currentIndex;
        const qs = state.questionStates[idx];
        if (!qs) return;
        state.trackEvent('triage_dismissed', {
          question_id: state.questions[idx]?.id,
          question_number: idx + 1,
        });
        set({
          questionStates: {
            ...state.questionStates,
            [idx]: { ...qs, triageDismissed: true },
          },
        });
      },

      // ─── Feature 3: CR Missing Link ───────────────────────

      setMissingLink: (text: string) => {
        const state = get();
        const idx = state.currentIndex;
        const qs = state.questionStates[idx];
        if (!qs) return;
        set({
          questionStates: {
            ...state.questionStates,
            [idx]: { ...qs, missingLink: text },
          },
        });
      },

      unlockChoices: () => {
        const state = get();
        const idx = state.currentIndex;
        const qs = state.questionStates[idx];
        if (!qs) return;
        const now = performance.now();
        const unlockedAtMs = Math.round(now - state.sessionStartTime);
        state.trackEvent('choices_unlocked', {
          question_id: state.questions[idx]?.id,
          method: qs.missingLink ? 'written' : 'skipped',
        });
        set({
          questionStates: {
            ...state.questionStates,
            [idx]: {
              ...qs,
              choicesUnlocked: true,
              questionTimerStartMs: now, // timer starts on unlock
            },
          },
        });
        // Save unlock time offset
        void (async () => {
          const { updateResponse } = await import('@/lib/db');
          if (state.sessionId && state.questions[idx]) {
            try {
              await updateResponse(state.sessionId, state.questions[idx].id, {
                choices_unlocked_at_ms: unlockedAtMs,
                missing_link: qs.missingLink,
              });
            } catch { /* best effort */ }
          }
        })();
      },

      // ─── Feature 4: RC Passage Map ────────────────────────

      setPassageMap: (map: Record<string, string>) => {
        const state = get();
        const idx = state.currentIndex;
        const qs = state.questionStates[idx];
        if (!qs) return;
        set({
          questionStates: {
            ...state.questionStates,
            [idx]: { ...qs, passageMap: map },
          },
        });
      },

      completePassageMap: () => {
        const state = get();
        const idx = state.currentIndex;
        const qs = state.questionStates[idx];
        if (!qs) return;
        const now = performance.now();
        state.trackEvent('passage_map_completed', {
          question_id: state.questions[idx]?.id,
          passage_id: state.questions[idx]?.passage_id,
        });
        set({
          questionStates: {
            ...state.questionStates,
            [idx]: {
              ...qs,
              passageMapComplete: true,
              questionTimerStartMs: now,
            },
          },
        });
      },
    }),
    {
      name: 'gmat-exam-session',
      partialize: (state) => ({
        sessionId: state.sessionId,
        setId: state.setId,
        mode: state.mode,
        questions: state.questions,
        isActive: state.isActive,
        isSubmitted: state.isSubmitted,
        currentIndex: state.currentIndex,
        questionStates: state.questionStates,
        totalTimeMs: state.totalTimeMs,
        remainingTimeMs: state.remainingTimeMs,
        pendingEvents: state.pendingEvents,
      }),
    }
  )
);
