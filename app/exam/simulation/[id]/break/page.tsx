'use client';

import { useEffect, useRef, useState, use } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useSimulationStore, SECTION_LABELS } from '@/store/simulationStore';

const BREAK_TOTAL_SECS = 10 * 60; // 10 minutes

// ─── Large Circular Break Timer ──────────────────────────────

interface BreakRingProps {
  startedAt: string; // ISO string when break began
  onExpire: () => void;
}

function BreakRing({ startedAt, onExpire }: BreakRingProps) {
  const [remaining, setRemaining] = useState(BREAK_TOTAL_SECS);
  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;
  const expiredRef = useRef(false);

  useEffect(() => {
    const startMs = new Date(startedAt).getTime();
    const id = setInterval(() => {
      const elapsed = (Date.now() - startMs) / 1000;
      const rem = Math.max(0, BREAK_TOTAL_SECS - elapsed);
      setRemaining(rem);
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
  const formatted = `${mins}:${secs.toString().padStart(2, '0')}`;

  const frac = remaining / BREAK_TOTAL_SECS;
  const radius = 100;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - frac);

  const strokeColor = remaining <= 60 ? '#EF4444' : remaining <= 120 ? '#F59E0B' : '#6366F1';

  return (
    <div className="relative w-64 h-64">
      <svg className="w-full h-full -rotate-90" viewBox="0 0 240 240">
        <circle cx="120" cy="120" r={radius} fill="none" stroke="#1e293b" strokeWidth="12" />
        <circle
          cx="120" cy="120" r={radius} fill="none" stroke={strokeColor} strokeWidth="12"
          strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 0.5s linear, stroke 0.5s ease' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-4xl font-bold font-mono tabular-nums text-white">{formatted}</span>
        <span className="text-sm text-slate-400 mt-1">remaining</span>
      </div>
    </div>
  );
}

// ─── Countdown Overlay Before Next Section ───────────────────

function ResumeCountdown({ label, sectionNumber, onDone }: { label: string; sectionNumber: number; onDone: () => void }) {
  const [count, setCount] = useState(3);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    if (count <= 0) { onDoneRef.current(); return; }
    const t = setTimeout(() => setCount((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [count]);

  return (
    <div className="min-h-screen bg-[#0A1628] flex items-center justify-center">
      <div className="text-center space-y-4">
        <p className="text-slate-400 text-sm uppercase tracking-widest">Section {sectionNumber}</p>
        <h2 className="text-2xl font-semibold text-white">{label}</h2>
        <div className="text-7xl font-bold text-indigo-400 tabular-nums my-6">{count || '→'}</div>
        <p className="text-slate-500 text-sm">Starting now…</p>
      </div>
    </div>
  );
}

// ─── Break Page ───────────────────────────────────────────────

export default function BreakPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: simulationId } = use(params);
  const router = useRouter();

  const simState = useSimulationStore();
  const { status, currentSectionIndex, sections, advanceToNextSection, endBreak } = simState;

  const [breakStartedAt] = useState(() => new Date().toISOString());
  const [showConfirm, setShowConfirm] = useState(false);
  const [resumeCountdown, setResumeCountdown] = useState(false);

  // The next section (after break)
  const nextSectionIndex = currentSectionIndex + 1;
  const nextSection = sections[nextSectionIndex];
  const nextLabel = nextSection ? SECTION_LABELS[nextSection.sectionType] : '';

  useEffect(() => {
    // Guard: if not in break state, redirect back to exam
    if (status !== 'break') {
      router.replace(`/exam/simulation/${simulationId}`);
    }
  }, [status, simulationId, router]);

  const handleBreakExpire = () => {
    setResumeCountdown(true);
  };

  const handleEndBreakConfirmed = () => {
    setShowConfirm(false);
    setResumeCountdown(true);
  };

  const handleResumeCountdownDone = () => {
    advanceToNextSection();
    endBreak();
    router.replace(`/exam/simulation/${simulationId}`);
  };

  if (resumeCountdown) {
    return (
      <ResumeCountdown
        label={nextLabel}
        sectionNumber={nextSectionIndex + 1}
        onDone={handleResumeCountdownDone}
      />
    );
  }

  return (
    <div className="min-h-screen bg-[#0A1628] flex flex-col items-center justify-center gap-8 px-4">
      {/* Header */}
      <div className="text-center space-y-1">
        <p className="text-sm text-indigo-400 font-medium uppercase tracking-widest">Optional Break</p>
        <h1 className="text-2xl font-semibold text-white">You are on break.</h1>
      </div>

      {/* Ring */}
      <BreakRing startedAt={breakStartedAt} onExpire={handleBreakExpire} />

      {/* Info */}
      <div className="max-w-sm text-center space-y-2">
        <p className="text-slate-300 text-sm leading-relaxed">
          Section {nextSectionIndex + 1} &mdash; <span className="text-white font-medium">{nextLabel}</span> &mdash; begins
          automatically when the timer ends.
        </p>
        <p className="text-slate-500 text-xs">
          Your 45-minute section timer starts fresh after the break ends.
        </p>
      </div>

      {/* End break early */}
      <Button
        variant="outline"
        className="border-slate-600 text-slate-300 hover:bg-slate-800"
        onClick={() => setShowConfirm(true)}
      >
        End Break Early
      </Button>

      {/* Confirmation dialog */}
      <Dialog open={showConfirm} onOpenChange={setShowConfirm}>
        <DialogContent className="bg-gray-900 border-gray-700 text-white">
          <DialogHeader>
            <DialogTitle>End break early?</DialogTitle>
            <DialogDescription className="text-slate-400">
              Are you sure? Remaining break time will be lost. Section {nextSectionIndex + 1} will begin immediately.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" className="border-gray-600 text-gray-300" onClick={() => setShowConfirm(false)}>
              Stay on break
            </Button>
            <Button className="bg-indigo-600 hover:bg-indigo-500" onClick={handleEndBreakConfirmed}>
              Yes, start Section {nextSectionIndex + 1}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
