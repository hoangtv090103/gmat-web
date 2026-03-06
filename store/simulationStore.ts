import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { SectionType } from '@/types/gmat';

export type { SectionType };

// ─── Types ────────────────────────────────────────────────────

export type SimulationStoreStatus =
  | 'idle'
  | 'countdown'
  | 'in_section'
  | 'section_summary'
  | 'break'
  | 'completed';

export interface SectionConfig {
  sectionType: SectionType;
  questionSetId: string | null;
  sectionRecordId: string | null; // simulation_sections.id
  sessionId: string | null;       // exam_sessions.id
  status: 'pending' | 'in_progress' | 'completed';
}

export interface SectionResult {
  sectionType: SectionType;
  sectionOrder: number; // 1-based
  scaledScore: number;  // 60–90
  rawCorrect: number;
  rawTotal: number;
  timeUsedSeconds: number;
  questionsSkipped: number;
  sessionId: string;
}

export interface SimulationState {
  simulationId: string | null;
  sectionOrder: SectionType[];
  breaksEnabled: boolean;
  sections: SectionConfig[];
  currentSectionIndex: number; // 0-based
  status: SimulationStoreStatus;
  sectionResults: SectionResult[];
  // Section timer: Date-based start time (ISO string) for the active section
  sectionTimerStartedAt: string | null;

  // Actions
  initSimulation: (params: {
    simulationId: string;
    sectionOrder: SectionType[];
    breaksEnabled: boolean;
    sections: SectionConfig[];
  }) => void;
  startSection: (sessionId: string, sectionRecordId: string) => void;
  recordSectionTimerStart: () => void;
  completeSectionWithResult: (result: SectionResult) => void;
  startBreak: () => void;
  endBreak: () => void;
  advanceToNextSection: () => void;
  completeSimulation: () => void;
  resetSimulation: () => void;
}

// ─── Store ────────────────────────────────────────────────────

export const useSimulationStore = create<SimulationState>()(
  persist(
    (set, get) => ({
      simulationId: null,
      sectionOrder: ['quant', 'verbal', 'di'],
      breaksEnabled: true,
      sections: [],
      currentSectionIndex: 0,
      status: 'idle',
      sectionResults: [],
      sectionTimerStartedAt: null,

      initSimulation: ({ simulationId, sectionOrder, breaksEnabled, sections }) => {
        set({
          simulationId,
          sectionOrder,
          breaksEnabled,
          sections,
          currentSectionIndex: 0,
          status: 'countdown',
          sectionResults: [],
          sectionTimerStartedAt: null,
        });
      },

      startSection: (sessionId, sectionRecordId) => {
        const { sections, currentSectionIndex } = get();
        const updated = sections.map((s, i) =>
          i === currentSectionIndex
            ? { ...s, sessionId, sectionRecordId, status: 'in_progress' as const }
            : s
        );
        set({
          sections: updated,
          status: 'in_section',
          sectionTimerStartedAt: new Date().toISOString(),
        });
      },

      recordSectionTimerStart: () => {
        set({ sectionTimerStartedAt: new Date().toISOString() });
      },

      completeSectionWithResult: (result) => {
        const { sections, currentSectionIndex } = get();
        const updated = sections.map((s, i) =>
          i === currentSectionIndex ? { ...s, status: 'completed' as const } : s
        );
        set({
          sections: updated,
          sectionResults: [...get().sectionResults, result],
          status: 'section_summary',
          sectionTimerStartedAt: null,
        });
      },

      startBreak: () => {
        set({ status: 'break' });
      },

      endBreak: () => {
        set({ status: 'in_section', sectionTimerStartedAt: new Date().toISOString() });
      },

      advanceToNextSection: () => {
        const { currentSectionIndex, sections } = get();
        const nextIndex = currentSectionIndex + 1;
        if (nextIndex < sections.length) {
          set({ currentSectionIndex: nextIndex, status: 'countdown' });
        }
      },

      completeSimulation: () => {
        set({ status: 'completed' });
      },

      resetSimulation: () => {
        set({
          simulationId: null,
          sectionOrder: ['quant', 'verbal', 'di'],
          breaksEnabled: true,
          sections: [],
          currentSectionIndex: 0,
          status: 'idle',
          sectionResults: [],
          sectionTimerStartedAt: null,
        });
      },
    }),
    {
      name: 'gmat-simulation-session',
    }
  )
);

// ─── Selectors ────────────────────────────────────────────────

export function selectCurrentSection(state: SimulationState): SectionConfig | null {
  return state.sections[state.currentSectionIndex] ?? null;
}

export function selectIsLastSection(state: SimulationState): boolean {
  return state.currentSectionIndex === state.sections.length - 1;
}

export const SECTION_LABELS: Record<SectionType, string> = {
  quant: 'Quantitative Reasoning',
  verbal: 'Verbal Reasoning',
  di: 'Data Insights',
};

export const SECTION_RECOMMENDED_QUESTIONS: Record<SectionType, number> = {
  quant: 21,
  verbal: 23,
  di: 20,
};

// Section types that map to question set `section` field values
export const SECTION_TYPE_TO_SET_SECTION: Record<SectionType, string[]> = {
  quant: ['Quantitative', 'Quant', 'quantitative', 'quant', 'Problem Solving', 'Data Sufficiency'],
  verbal: ['Verbal', 'verbal', 'Critical Reasoning', 'Reading Comprehension'],
  di: ['Data Insights', 'DI', 'data insights', 'di', 'Multi-Source Reasoning', 'Table Analysis', 'Graphics Interpretation', 'Two-Part Analysis'],
};
