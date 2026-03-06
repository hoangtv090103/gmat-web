'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import {
  faArrowRight,
  faBookOpen,
  faChartBar,
  faChevronDown,
  faChevronUp,
  faCalculator,
  faCircleCheck,
  faClock,
  faFont,
  faGripVertical,
  faTriangleExclamation,
} from '@fortawesome/free-solid-svg-icons';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { FaIcon } from '@/components/ui/fa-icon';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { getQuestionSets, createSimulationExam, createSimulationSection } from '@/lib/db';
import { QuestionSet, SectionType } from '@/types/gmat';
import {
  useSimulationStore,
  SECTION_LABELS,
  SECTION_RECOMMENDED_QUESTIONS,
  SECTION_TYPE_TO_SET_SECTION,
  SectionConfig,
} from '@/store/simulationStore';

// ─── Constants ────────────────────────────────────────────────

const SECTION_COLORS: Record<SectionType, string> = {
  quant: 'border-blue-500/40 bg-blue-500/5',
  verbal: 'border-purple-500/40 bg-purple-500/5',
  di: 'border-emerald-500/40 bg-emerald-500/5',
};

const SECTION_BADGE_COLORS: Record<SectionType, string> = {
  quant: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  verbal: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
  di: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
};

const SECTION_ICONS: Record<SectionType, IconDefinition> = {
  quant: faCalculator,
  verbal: faFont,
  di: faChartBar,
};

// ─── Setup Wizard ─────────────────────────────────────────────

export default function SimulationSetupPage() {
  const router = useRouter();
  const { initSimulation } = useSimulationStore();

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [sectionOrder, setSectionOrder] = useState<SectionType[]>(['quant', 'verbal', 'di']);
  const [questionSets, setQuestionSets] = useState<QuestionSet[]>([]);
  const [selectedSets, setSelectedSets] = useState<Record<SectionType, string>>({
    quant: '',
    verbal: '',
    di: '',
  });
  const [breaksEnabled, setBreaksEnabled] = useState(true);
  const [loading, setLoading] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  useEffect(() => {
    getQuestionSets().then(setQuestionSets).catch(console.error);
  }, []);

  // Section sets filtered by type
  const getSetsForSection = useCallback(
    (type: SectionType): QuestionSet[] => {
      const validSections = SECTION_TYPE_TO_SET_SECTION[type];
      const filtered = questionSets.filter(
        (s) => s.section && validSections.some((v) => s.section!.toLowerCase().includes(v.toLowerCase()))
      );
      // If no section-filtered sets, return all sets as fallback
      return filtered.length > 0 ? filtered : questionSets;
    },
    [questionSets]
  );

  const getSelectedSet = (type: SectionType): QuestionSet | undefined =>
    questionSets.find((s) => s.id === selectedSets[type]);

  const hasWarning = (type: SectionType): boolean => {
    const set = getSelectedSet(type);
    if (!set) return false;
    return set.total_questions < SECTION_RECOMMENDED_QUESTIONS[type];
  };

  const allSectionsAssigned = sectionOrder.every((s) => selectedSets[s] !== '');

  // ─── Drag and Drop ────────────────────────────────────────

  const handleDragStart = (index: number) => setDraggedIndex(index);
  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    setDragOverIndex(index);
  };
  const handleDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === dropIndex) {
      setDraggedIndex(null);
      setDragOverIndex(null);
      return;
    }
    const newOrder = [...sectionOrder];
    const [moved] = newOrder.splice(draggedIndex, 1);
    newOrder.splice(dropIndex, 0, moved);
    setSectionOrder(newOrder);
    setDraggedIndex(null);
    setDragOverIndex(null);
  };
  const handleDragEnd = () => {
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const moveSection = (index: number, direction: 'up' | 'down') => {
    const newOrder = [...sectionOrder];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= newOrder.length) return;
    [newOrder[index], newOrder[targetIndex]] = [newOrder[targetIndex], newOrder[index]];
    setSectionOrder(newOrder);
  };

  // ─── Begin Exam ────────────────────────────────────────────

  const handleBeginExam = async () => {
    if (!allSectionsAssigned) return;
    setLoading(true);

    try {
      // Create simulation exam record
      const simulationId = await createSimulationExam({
        section_order: sectionOrder,
        status: 'in_progress',
        breaks_enabled: breaksEnabled,
      });

      // Create simulation section records
      const sectionConfigs: SectionConfig[] = [];
      for (let i = 0; i < sectionOrder.length; i++) {
        const type = sectionOrder[i];
        const sectionRecordId = await createSimulationSection({
          simulation_exam_id: simulationId,
          section_type: type,
          section_order: i + 1,
          question_set_id: selectedSets[type] || undefined,
        });
        sectionConfigs.push({
          sectionType: type,
          questionSetId: selectedSets[type] || null,
          sectionRecordId,
          sessionId: null,
          status: 'pending',
        });
      }

      // Init simulation store
      initSimulation({
        simulationId,
        sectionOrder,
        breaksEnabled,
        sections: sectionConfigs,
      });

      // Start 5-second countdown
      setCountdown(5);
      let count = 5;
      const interval = setInterval(() => {
        count -= 1;
        setCountdown(count);
        if (count <= 0) {
          clearInterval(interval);
          router.push(`/exam/simulation/${simulationId}`);
        }
      }, 1000);
    } catch (err) {
      console.error('Failed to create simulation exam:', err);
      setLoading(false);
    }
  };

  // ─── Render ────────────────────────────────────────────────

  if (countdown !== null) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-center space-y-6">
          <div className="text-8xl font-bold text-white tabular-nums animate-pulse">
            {countdown}
          </div>
          <p className="text-gray-400 text-xl">Preparing your exam…</p>
          <p className="text-gray-500 text-sm">GMAT Focus Edition — Exam Simulation</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Header */}
      <div className="border-b border-gray-800 px-6 py-4">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-white">Exam Simulation Setup</h1>
            <p className="text-sm text-gray-400">GMAT Focus Edition · Full Mock Exam</p>
          </div>
          <div className="flex items-center gap-2 text-sm text-gray-400">
            {[1, 2, 3].map((n) => (
              <div key={n} className="flex items-center gap-1.5">
                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium transition-colors ${
                    step === n
                      ? 'bg-indigo-600 text-white'
                      : step > n
                      ? 'bg-green-600/80 text-white'
                      : 'bg-gray-700 text-gray-400'
                  }`}
                >
                  {step > n ? (
                    <FaIcon icon={faCircleCheck} className="w-3.5 h-3.5" />
                  ) : (
                    n
                  )}
                </div>
                {n < 3 && <div className={`w-8 h-px ${step > n ? 'bg-green-600/80' : 'bg-gray-700'}`} />}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-6 py-8 space-y-6">

        {/* ─── Step 1: Section Order ─────────────────────────────── */}
        {step === 1 && (
          <>
            <div>
              <h2 className="text-xl font-semibold text-white mb-1">Step 1 — Section Order</h2>
              <p className="text-sm text-gray-400">
                Drag the sections to choose your preferred order. Default: Quant{' '}
                <FaIcon icon={faArrowRight} className="mx-1 inline-block h-3 w-3 text-slate-400" /> Verbal{' '}
                <FaIcon icon={faArrowRight} className="mx-1 inline-block h-3 w-3 text-slate-400" /> DI.
              </p>
            </div>

            <div className="space-y-3">
              {sectionOrder.map((type, index) => (
                <div
                  key={type}
                  draggable
                  onDragStart={() => handleDragStart(index)}
                  onDragOver={(e) => handleDragOver(e, index)}
                  onDrop={(e) => handleDrop(e, index)}
                  onDragEnd={handleDragEnd}
                  className={`border rounded-xl p-4 transition-all cursor-grab active:cursor-grabbing select-none ${SECTION_COLORS[type]} ${
                    dragOverIndex === index ? 'scale-[1.02] shadow-lg shadow-black/30' : ''
                  } ${draggedIndex === index ? 'opacity-50' : 'opacity-100'}`}
                >
                  <div className="flex items-center gap-3">
                    <FaIcon icon={faGripVertical} className="w-4 h-4 text-gray-500 flex-shrink-0" />
                    <div
                      className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-medium border ${SECTION_BADGE_COLORS[type]}`}
                    >
                      <FaIcon icon={SECTION_ICONS[type]} className="text-slate-100" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-white">{SECTION_LABELS[type]}</span>
                        <Badge variant="outline" className="text-xs text-gray-400 border-gray-600">
                          Section {index + 1}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-400">
                        <span className="flex items-center gap-1">
                          <FaIcon icon={faBookOpen} className="w-3 h-3" />
                          {SECTION_RECOMMENDED_QUESTIONS[type]} questions
                        </span>
                        <span className="flex items-center gap-1">
                          <FaIcon icon={faClock} className="w-3 h-3" />
                          45 min
                        </span>
                      </div>
                    </div>
                    <div className="flex flex-col gap-1">
                      <button
                        onClick={() => moveSection(index, 'up')}
                        disabled={index === 0}
                        className="p-1 rounded hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                      >
                        <FaIcon icon={faChevronUp} className="w-4 h-4 text-gray-300" />
                      </button>
                      <button
                        onClick={() => moveSection(index, 'down')}
                        disabled={index === sectionOrder.length - 1}
                        className="p-1 rounded hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                      >
                        <FaIcon icon={faChevronDown} className="w-4 h-4 text-gray-300" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="bg-gray-800/50 rounded-lg p-3 text-sm text-gray-400 border border-gray-700/50">
              <span className="text-gray-300 font-medium">Order preview: </span>
              {sectionOrder.map((t, i) => (
                <span key={t}>
                  <span className="text-white">{SECTION_LABELS[t]}</span>
                  {i < sectionOrder.length - 1 && (
                    <FaIcon icon={faArrowRight} className="mx-1 h-3 w-3 text-gray-600" />
                  )}
                </span>
              ))}
            </div>

            <Button
              className="w-full bg-indigo-600 hover:bg-indigo-500 text-white h-11"
              onClick={() => setStep(2)}
            >
              Continue to Question Bank
              <FaIcon icon={faArrowRight} className="w-4 h-4 ml-2" />
            </Button>
          </>
        )}

        {/* ─── Step 2: Question Bank ──────────────────────────────── */}
        {step === 2 && (
          <>
            <div>
              <h2 className="text-xl font-semibold text-white mb-1">Step 2 — Question Bank</h2>
              <p className="text-sm text-gray-400">
                Assign a question set to each section. Sets are filtered by section type.
              </p>
            </div>

            <div className="space-y-4">
              {sectionOrder.map((type, index) => {
                const setsForSection = getSetsForSection(type);
                const selectedSet = getSelectedSet(type);
                const warning = hasWarning(type);

                return (
                  <Card key={type} className={`border ${SECTION_COLORS[type]} bg-transparent`}>
                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-center gap-2">
                        <div
                          className={`w-6 h-6 rounded-md flex items-center justify-center text-xs font-bold border ${SECTION_BADGE_COLORS[type]}`}
                        >
                          {index + 1}
                        </div>
                        <span className="font-medium text-white">{SECTION_LABELS[type]}</span>
                        <span className="text-xs text-gray-500 ml-auto">
                          Recommended: {SECTION_RECOMMENDED_QUESTIONS[type]} questions
                        </span>
                      </div>

                      {setsForSection.length === 0 ? (
                        <div className="flex items-center gap-2 p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                          <FaIcon icon={faTriangleExclamation} className="w-4 h-4 text-amber-400 flex-shrink-0" />
                          <span className="text-sm text-amber-300">
                            No question sets found.{' '}
                            <button
                              className="underline hover:text-amber-200"
                              onClick={() => router.push('/import')}
                            >
                              Import one
                            </button>{' '}
                            first.
                          </span>
                        </div>
                      ) : (
                        <Select
                          value={selectedSets[type] || ''}
                          onValueChange={(val) =>
                            setSelectedSets((prev) => ({ ...prev, [type]: val }))
                          }
                        >
                          <SelectTrigger className="bg-gray-800/60 border-gray-700 text-white">
                            <SelectValue placeholder="Select a question set…" />
                          </SelectTrigger>
                          <SelectContent className="bg-gray-900 border-gray-700">
                            {setsForSection.map((set) => (
                              <SelectItem
                                key={set.id}
                                value={set.id}
                                className="text-white focus:bg-gray-700"
                              >
                                <div className="flex items-center gap-2">
                                  <span>{set.name}</span>
                                  <span className="text-gray-400 text-xs">
                                    ({set.total_questions}q)
                                  </span>
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}

                      {warning && selectedSet && (
                        <div className="flex items-center gap-2 p-2.5 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                          <FaIcon icon={faTriangleExclamation} className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                          <span className="text-xs text-amber-300">
                            This set has only {selectedSet.total_questions} questions — section will end early.
                          </span>
                        </div>
                      )}

                      {selectedSet && !warning && (
                        <div className="flex items-center gap-1.5 text-xs text-emerald-400">
                          <FaIcon icon={faCircleCheck} className="w-3.5 h-3.5" />
                          <span>
                            {selectedSet.total_questions} questions ready
                          </span>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            <div className="flex gap-3">
              <Button
                variant="outline"
                className="flex-1 border-gray-700 text-gray-300 hover:bg-gray-800"
                onClick={() => setStep(1)}
              >
                Back
              </Button>
              <Button
                className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white"
                disabled={!allSectionsAssigned}
                onClick={() => setStep(3)}
              >
                Review &amp; Confirm
                <FaIcon icon={faArrowRight} className="w-4 h-4 ml-2" />
              </Button>
            </div>
          </>
        )}

        {/* ─── Step 3: Confirmation ───────────────────────────────── */}
        {step === 3 && (
          <>
            <div>
              <h2 className="text-xl font-semibold text-white mb-1">Step 3 — Confirm &amp; Begin</h2>
              <p className="text-sm text-gray-400">
                Review your exam configuration before starting.
              </p>
            </div>

            {/* Summary table */}
            <Card className="border border-gray-700/60 bg-gray-900/40">
              <CardContent className="p-0">
                <div className="divide-y divide-gray-700/50">
                  {sectionOrder.map((type, index) => {
                    const set = getSelectedSet(type);
                    return (
                      <div key={type} className="flex items-center justify-between px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium text-gray-500 w-5">{index + 1}.</span>
                          <span className={`w-2 h-2 rounded-full ${
                            type === 'quant' ? 'bg-blue-400' :
                            type === 'verbal' ? 'bg-purple-400' : 'bg-emerald-400'
                          }`} />
                          <span className="text-white text-sm">{SECTION_LABELS[type]}</span>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-gray-400">
                          <span>{set?.total_questions ?? 0} questions</span>
                          <span className="text-gray-600">·</span>
                          <span>45 min</span>
                        </div>
                      </div>
                    );
                  })}
                  <div className="flex items-center justify-between px-4 py-3 bg-gray-800/30">
                    <span className="text-sm font-medium text-gray-300">Total</span>
                    <div className="flex items-center gap-3 text-xs">
                      <span className="text-white font-medium">
                        {sectionOrder.reduce((acc, t) => acc + (getSelectedSet(t)?.total_questions ?? 0), 0)} questions
                      </span>
                      <span className="text-gray-600">·</span>
                      <span className="text-gray-300">~2h 15m</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Breaks toggle */}
            <div className="flex items-center justify-between p-4 border border-gray-700/60 bg-gray-900/40 rounded-xl">
              <div>
                <Label htmlFor="breaks-toggle" className="text-white font-medium cursor-pointer">
                  Optional 10-minute breaks
                </Label>
                <p className="text-xs text-gray-400 mt-0.5">
                  Offered between sections 1<FaIcon icon={faArrowRight} className="mx-1 h-3 w-3 text-slate-400" />2 and 2<FaIcon icon={faArrowRight} className="mx-1 h-3 w-3 text-slate-400" />3
                </p>
              </div>
              <Switch
                id="breaks-toggle"
                checked={breaksEnabled}
                onCheckedChange={setBreaksEnabled}
                className="data-[state=checked]:bg-indigo-600"
              />
            </div>

            {/* Warnings */}
            {sectionOrder.some(hasWarning) && (
              <div className="flex items-start gap-2 p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                <FaIcon icon={faTriangleExclamation} className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-amber-300">
                  One or more sections have fewer questions than recommended. Those sections will end when questions run out.
                </p>
              </div>
            )}

            {/* Disclaimer */}
            <p className="text-xs text-gray-500 text-center">
              This is a simulated exam. Scores are estimated based on raw accuracy and are not equivalent to official GMAT scores.
            </p>

            <div className="flex gap-3">
              <Button
                variant="outline"
                className="flex-1 border-gray-700 text-gray-300 hover:bg-gray-800"
                onClick={() => setStep(2)}
                disabled={loading}
              >
                Back
              </Button>
              <Button
                className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white h-11 font-semibold"
                onClick={handleBeginExam}
                disabled={loading || !allSectionsAssigned}
              >
                {loading ? 'Preparing…' : 'Begin Exam'}
                {!loading && <FaIcon icon={faArrowRight} className="w-4 h-4 ml-2" />}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
