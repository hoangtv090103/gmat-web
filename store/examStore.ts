'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  Question,
  ExamMode,
  AnswerChange,
  TrackingEventType,
} from '@/types/gmat';

// ─── Types ───────────────────────────────────────────────────

export interface QuestionState {
  selectedAnswer: string | null;
  firstAnswer: string | null;
  answerChanges: AnswerChange[];
  flagged: boolean;
  timeSpentMs: number;
  confidenceRating?: number;
  questionDisplayedAt: number;
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

  // Timer
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
}

const defaultQuestionState: QuestionState = {
  selectedAnswer: null,
  firstAnswer: null,
  answerChanges: [],
  flagged: false,
  timeSpentMs: 0,
  questionDisplayedAt: 0,
};

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
        questions.forEach((_, i) => {
          initialStates[i] = { ...defaultQuestionState, questionDisplayedAt: i === 0 ? now : 0 };
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
        const qs = state.questionStates[idx] || { ...defaultQuestionState };
        const elapsed = performance.now() - state.sessionStartTime;

        const newChanges = [...qs.answerChanges];
        if (qs.selectedAnswer !== null && qs.selectedAnswer !== answer) {
          newChanges.push({
            from: qs.selectedAnswer,
            to: answer,
            timestamp_offset_ms: Math.round(elapsed),
          });

          // Track answer change
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

      deselectAnswer: () => {
        const state = get();
        if (state.mode === 'timed') return; // Not allowed in timed mode
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
        const qs = state.questionStates[idx] || { ...defaultQuestionState };
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
        const qs = state.questionStates[idx] || { ...defaultQuestionState };

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

        // Record time spent on current question
        state.recordQuestionTime();

        const fromQ = state.currentIndex;
        state.trackEvent('navigated_to_question', {
          from_q: fromQ + 1,
          to_q: index + 1,
        });

        // Mark display time for target question
        const targetQs = state.questionStates[index] || { ...defaultQuestionState };
        set({
          currentIndex: index,
          questionStates: {
            ...state.questionStates,
            [index]: { ...targetQs, questionDisplayedAt: performance.now() },
          },
        });

        state.trackEvent('question_displayed', {
          question_id: state.questions[index]?.id,
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
          set({ remainingTimeMs: elapsedMs }); // count-up for practice
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
        return state.questionStates[state.currentIndex] || { ...defaultQuestionState };
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
