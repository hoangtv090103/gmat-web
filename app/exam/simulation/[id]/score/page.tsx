'use client';

import { useEffect, useState, use } from 'react';
import { useRouter } from 'next/navigation';
import {
  faArrowLeft,
  faArrowRight,
  faArrowTrendDown,
  faArrowTrendUp,
  faArrowUpRightFromSquare,
  faMinus,
} from '@fortawesome/free-solid-svg-icons';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { getSimulationExam, getSimulationSections } from '@/lib/db';
import { SimulationExam, SimulationSection, SectionType } from '@/types/gmat';
import { useSimulationStore, SECTION_LABELS, SectionResult } from '@/store/simulationStore';
import { FaIcon } from '@/components/ui/fa-icon';

const TARGET_SCORE = 680;

// ─── Score Calculation ────────────────────────────────────────

function computeSectionScore(correct: number, total: number): number {
  if (!total) return 60;
  return Math.max(60, Math.min(90, Math.floor((correct / total) * 30 + 60)));
}

function computeTotalScore(sectionScores: number[]): number {
  const sum = sectionScores.reduce((a, b) => a + b, 0);
  if (!sectionScores.length) return 205;
  // 3 sections × 60–90 = 180–270 -> map to 205–805
  return Math.max(205, Math.min(805, Math.floor((sum / 270) * 600 + 205)));
}

// ─── Section Card ─────────────────────────────────────────────

interface SectionCardData {
  sectionType: SectionType;
  scaledScore: number;
  rawCorrect: number;
  rawTotal: number;
  timeUsedSeconds: number;
  questionsSkipped: number;
  sessionId?: string;
}

const SECTION_COLOR: Record<SectionType, { border: string; text: string; bg: string }> = {
  quant:  { border: 'border-blue-500/30',   text: 'text-blue-400',   bg: 'bg-blue-500/5' },
  verbal: { border: 'border-purple-500/30', text: 'text-purple-400', bg: 'bg-purple-500/5' },
  di:     { border: 'border-emerald-500/30', text: 'text-emerald-400', bg: 'bg-emerald-500/5' },
};

function SectionCard({ data, order }: { data: SectionCardData; order: number }) {
  const color = SECTION_COLOR[data.sectionType];
  const accuracy = data.rawTotal > 0 ? Math.round((data.rawCorrect / data.rawTotal) * 100) : 0;
  const timeMins = Math.floor(data.timeUsedSeconds / 60);
  const timeSecs = data.timeUsedSeconds % 60;

  return (
    <div className={`border rounded-xl p-5 ${color.border} ${color.bg}`}>
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Badge variant="outline" className={`text-xs ${color.border} ${color.text}`}>
              Section {order}
            </Badge>
          </div>
          <h3 className="font-semibold text-white">{SECTION_LABELS[data.sectionType]}</h3>
        </div>
        <div className="text-right">
          <div className={`text-3xl font-bold ${color.text}`}>{data.scaledScore}</div>
          <div className="text-xs text-slate-400">out of 90</div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 text-sm">
        <div>
          <div className="text-slate-400 text-xs mb-0.5">Accuracy</div>
          <div className="text-white font-medium">{accuracy}%</div>
          <div className="text-slate-500 text-xs">{data.rawCorrect}/{data.rawTotal}</div>
        </div>
        <div>
          <div className="text-slate-400 text-xs mb-0.5">Time used</div>
          <div className="text-white font-mono font-medium">
            {timeMins}:{timeSecs.toString().padStart(2, '0')}
          </div>
        </div>
        <div>
          <div className="text-slate-400 text-xs mb-0.5">Skipped</div>
          <div className={`font-medium ${data.questionsSkipped > 0 ? 'text-amber-400' : 'text-white'}`}>
            {data.questionsSkipped}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Score Report Page ────────────────────────────────────────

export default function ScoreReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: simulationId } = use(params);
  const router = useRouter();

  const simState = useSimulationStore();
  const { resetSimulation } = simState;

  const [loading, setLoading] = useState(true);
  const [exam, setExam] = useState<SimulationExam | null>(null);
  const [sections, setSections] = useState<SimulationSection[]>([]);
  const [sectionCards, setSectionCards] = useState<SectionCardData[]>([]);
  const [totalScore, setTotalScore] = useState<number>(205);

  useEffect(() => {
    loadScoreData();
  }, [simulationId]);

  const loadScoreData = async () => {
    try {
      // Try to load from DB first
      const [examData, sectionsData] = await Promise.all([
        getSimulationExam(simulationId),
        getSimulationSections(simulationId),
      ]);

      if (examData) {
        setExam(examData);
      }

      if (sectionsData && sectionsData.length > 0) {
        const cards: SectionCardData[] = sectionsData.map((s) => ({
          sectionType: s.section_type as SectionType,
          scaledScore: s.scaled_score || computeSectionScore(s.raw_correct || 0, s.raw_total || 0),
          rawCorrect: s.raw_correct || 0,
          rawTotal: s.raw_total || 0,
          timeUsedSeconds: s.time_used_seconds || 0,
          questionsSkipped: s.questions_skipped || 0,
          sessionId: s.session_id,
        }));
        setSections(sectionsData);
        setSectionCards(cards);

        const total = examData?.total_score ||
          computeTotalScore(cards.map((c) => c.scaledScore));
        setTotalScore(total);
      } else {
        // Fall back to simulationStore results
        const results = simState.sectionResults;
        if (results.length > 0) {
          const cards: SectionCardData[] = results.map((r: SectionResult) => ({
            sectionType: r.sectionType,
            scaledScore: r.scaledScore,
            rawCorrect: r.rawCorrect,
            rawTotal: r.rawTotal,
            timeUsedSeconds: r.timeUsedSeconds,
            questionsSkipped: r.questionsSkipped,
            sessionId: r.sessionId,
          }));
          setSectionCards(cards);
          setTotalScore(computeTotalScore(cards.map((c) => c.scaledScore)));
        }
      }
    } catch (err) {
      console.error('Failed to load score data:', err);
      // Fall back to store
      const results = simState.sectionResults;
      if (results.length > 0) {
        const cards: SectionCardData[] = results.map((r: SectionResult) => ({
          sectionType: r.sectionType,
          scaledScore: r.scaledScore,
          rawCorrect: r.rawCorrect,
          rawTotal: r.rawTotal,
          timeUsedSeconds: r.timeUsedSeconds,
          questionsSkipped: r.questionsSkipped,
          sessionId: r.sessionId,
        }));
        setSectionCards(cards);
        setTotalScore(computeTotalScore(cards.map((c) => c.scaledScore)));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleReturnDashboard = () => {
    resetSimulation();
    router.push('/');
  };

  const handleReview = () => {
    // Navigate to the first section's results page
    const firstSessionId =
      sectionCards[0]?.sessionId ||
      sections[0]?.session_id ||
      simState.sectionResults[0]?.sessionId;
    if (firstSessionId) {
      router.push(`/results/${firstSessionId}`);
    }
  };

  // Score color
  const gap = totalScore - TARGET_SCORE;
  const scoreColorClass =
    gap >= 0 ? 'text-emerald-400' :
    gap >= -30 ? 'text-amber-400' :
    'text-red-400';

  const gapIcon = gap >= 0 ? faArrowTrendUp : gap >= -10 ? faMinus : faArrowTrendDown;
  const gapColorClass = gap >= 0 ? 'text-emerald-400' : gap >= -30 ? 'text-amber-400' : 'text-red-400';

  // Sort section cards by section_order
  const orderedCards = [...sectionCards].sort((a, b) => {
    const orderA = sections.find((s) => s.section_type === a.sectionType)?.section_order ||
      simState.sectionResults.find((r) => r.sectionType === a.sectionType)?.sectionOrder || 0;
    const orderB = sections.find((s) => s.section_type === b.sectionType)?.section_order ||
      simState.sectionResults.find((r) => r.sectionType === b.sectionType)?.sectionOrder || 0;
    return orderA - orderB;
  });

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0A1628] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0A1628] text-white">
      {/* Header */}
      <div className="border-b border-slate-800 px-6 py-4">
        <div className="max-w-2xl mx-auto">
          <p className="text-xs text-slate-500 uppercase tracking-widest mb-1">GMAT Focus Edition</p>
          <h1 className="text-lg font-semibold text-white">Simulated Score Report</h1>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-6 py-8 space-y-8">

        {/* Total score — large centered display */}
        <div className="text-center space-y-3">
          <div className={`text-8xl font-bold tabular-nums ${scoreColorClass}`}>
            {totalScore}
          </div>
          <div className="flex items-center justify-center gap-3 text-sm">
            <span className="text-slate-400">Target: {TARGET_SCORE}</span>
            <span className="text-slate-600">·</span>
            <span className={`flex items-center gap-1 font-medium ${gapColorClass}`}>
              <FaIcon icon={gapIcon} className="w-4 h-4" />
              {gap >= 0 ? `+${gap}` : gap} points
            </span>
          </div>
          <div className="flex items-center justify-center gap-2">
            <div className="w-48 h-1.5 bg-slate-800 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${scoreColorClass.replace('text-', 'bg-')}`}
                style={{ width: `${Math.min(100, ((totalScore - 205) / 600) * 100)}%` }}
              />
            </div>
            <span className="text-xs text-slate-500">205–805</span>
          </div>
        </div>

        {/* Section breakdown */}
        {orderedCards.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-sm font-medium text-slate-400 uppercase tracking-wider">Section Scores</h2>
            {orderedCards.map((card, i) => (
              <SectionCard
                key={card.sectionType}
                data={card}
                order={sections.find((s) => s.section_type === card.sectionType)?.section_order ||
                  simState.sectionResults.find((r) => r.sectionType === card.sectionType)?.sectionOrder ||
                  i + 1}
              />
            ))}
          </div>
        )}

        {/* Disclaimer */}
        <div className="p-4 bg-slate-800/30 border border-slate-700/50 rounded-xl">
          <p className="text-xs text-slate-400 leading-relaxed text-center">
            <span className="text-slate-300 font-medium">Estimated score</span> based on raw accuracy.
            Not equivalent to an official GMAT score. GMAC uses a proprietary adaptive algorithm
            that may produce different results.
          </p>
        </div>

        {/* CTAs */}
        <div className="space-y-3">
          <Button
            className="w-full bg-indigo-600 hover:bg-indigo-500 text-white h-11 font-medium"
            onClick={handleReview}
            disabled={!sectionCards[0]?.sessionId && !simState.sectionResults[0]?.sessionId}
          >
            <FaIcon icon={faArrowUpRightFromSquare} className="w-4 h-4 mr-2" />
            Review this exam <FaIcon icon={faArrowRight} className="ml-2 h-3.5 w-3.5" />
          </Button>
          <Button
            variant="outline"
            className="w-full border-slate-700 text-slate-300 hover:bg-slate-800 h-11"
            onClick={handleReturnDashboard}
          >
            <FaIcon icon={faArrowLeft} className="w-4 h-4 mr-2" />
            Return to Dashboard
          </Button>
        </div>

        {/* Date */}
        {exam?.completed_at && (
          <p className="text-center text-xs text-slate-600">
            Completed {new Date(exam.completed_at).toLocaleDateString('en-US', {
              year: 'numeric', month: 'long', day: 'numeric',
              hour: '2-digit', minute: '2-digit',
            })}
          </p>
        )}
      </div>
    </div>
  );
}
