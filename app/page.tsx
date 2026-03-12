"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { ThemeToggle } from "@/components/theme-toggle";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  faArrowLeft,
  faArrowRight,
  faArrowsUpDown,
  faBookOpen,
  faBullseye,
  faChartLine,
  faClock,
  faEye,
  faMagnifyingGlass,
  faPen,
  faUpload,
  faCircleCheck,
  faFile,
  faEllipsisVertical,
  faPencil,
  faTrash,
  faListUl,
} from "@fortawesome/free-solid-svg-icons";
import { getQuestionSets, getAllSessions, getAllResponses, deleteQuestionSet } from "@/lib/db";
import { QuestionSet, ExamSession, QuestionResponse } from "@/types/gmat";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import { FaIcon } from "@/components/ui/fa-icon";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SetEditModal } from "@/components/question-sets/SetEditModal";
import { QuestionManagerSheet } from "@/components/question-sets/QuestionManagerSheet";
import { DeleteConfirmDialog } from "@/components/question-sets/DeleteConfirmDialog";
import { toast } from "sonner";

type SortOption = "newest" | "oldest" | "name-az" | "name-za" | "questions-desc" | "questions-asc";
type TimeFilter = "all" | "today" | "yesterday" | "3d" | "7d" | "21d";

const SECTION_ORDER = ["Quantitative", "Verbal", "Data Insights"];
const SECTION_COLORS: Record<string, { dot: string; text: string; border: string }> = {
  Quantitative: { dot: "bg-blue-500", text: "text-blue-400", border: "border-blue-500/20" },
  Verbal: { dot: "bg-green-500", text: "text-green-400", border: "border-green-500/20" },
  "Data Insights": { dot: "bg-amber-500", text: "text-amber-400", border: "border-amber-500/20" },
  Other: { dot: "bg-slate-500", text: "text-slate-400", border: "border-slate-600/30" },
};

function getDateKey(qs: QuestionSet): string {
  const raw = qs.study_date ?? qs.created_at;
  if (!raw) return "unscheduled";
  if (raw.includes("T")) {
    const d = new Date(raw);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  return raw.slice(0, 10);
}

function formatDateHeading(key: string): string {
  if (key === "unscheduled") return "Unscheduled";
  const now = new Date();
  const parts = key.split("-").map(Number);
  const d = new Date(parts[0], parts[1] - 1, parts[2]);
  const isSameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
  if (isSameDay(d, now)) return "Today";
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (isSameDay(d, yesterday)) return "Yesterday";
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function formatDateSub(key: string): string {
  if (key === "unscheduled") return "";
  const parts = key.split("-").map(Number);
  const d = new Date(parts[0], parts[1] - 1, parts[2]);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function normalizeSectionKey(section?: string | null): string {
  if (!section) return "Other";
  const s = section.trim().toLowerCase();
  if (s.includes("quant")) return "Quantitative";
  if (s.includes("verbal")) return "Verbal";
  if (s.includes("data") || s.includes("insight") || s.includes("di")) return "Data Insights";
  return "Other";
}

export default function DashboardPage() {
  const [sets, setSets] = useState<QuestionSet[]>([]);
  const [sessions, setSessions] = useState<ExamSession[]>([]);
  const [responses, setResponses] = useState<QuestionResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("newest");
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("today");

  // CRUD state
  const [editingSet, setEditingSet] = useState<QuestionSet | null>(null);
  const [managingSet, setManagingSet] = useState<QuestionSet | null>(null);
  const [deletingSet, setDeletingSet] = useState<QuestionSet | null>(null);
  const [deleteSetLoading, setDeleteSetLoading] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const [s, sess, resp] = await Promise.all([
          getQuestionSets(),
          getAllSessions(),
          getAllResponses(),
        ]);
        setSets(s);
        setSessions(sess);
        setResponses(resp);
      } catch (e) {
        console.error("Failed to load data:", e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const timeFilteredSessions = useMemo(() => {
    if (timeFilter === "all") return sessions;
    const now = new Date();
    return sessions.filter((s) => {
      const d = new Date(s.started_at);
      if (Number.isNaN(d.getTime())) return false;
      switch (timeFilter) {
        case "today": {
          return (
            d.getFullYear() === now.getFullYear() &&
            d.getMonth() === now.getMonth() &&
            d.getDate() === now.getDate()
          );
        }
        case "yesterday": {
          const yesterday = new Date(now);
          yesterday.setDate(now.getDate() - 1);
          return (
            d.getFullYear() === yesterday.getFullYear() &&
            d.getMonth() === yesterday.getMonth() &&
            d.getDate() === yesterday.getDate()
          );
        }
        case "3d": {
          const threeDaysAgo = now.getTime() - 3 * 24 * 60 * 60 * 1000;
          return d.getTime() >= threeDaysAgo;
        }
        case "7d": {
          const sevenDaysAgo = now.getTime() - 7 * 24 * 60 * 60 * 1000;
          return d.getTime() >= sevenDaysAgo;
        }
        case "21d": {
          const twentyOneDaysAgo = now.getTime() - 21 * 24 * 60 * 60 * 1000;
          return d.getTime() >= twentyOneDaysAgo;
        }
        default:
          return true;
      }
    });
  }, [sessions, timeFilter]);

  const timeFilteredSessionIds = useMemo(
    () => new Set(timeFilteredSessions.map((s) => s.id)),
    [timeFilteredSessions],
  );

  const timeFilteredResponses = useMemo(
    () => responses.filter((r) => timeFilteredSessionIds.has(r.session_id)),
    [responses, timeFilteredSessionIds],
  );

  const totalSessions = timeFilteredSessions.length;
  const completedSessions = timeFilteredSessions.filter((s) => s.completed_at);
  const avgAccuracy = completedSessions.length
    ? Math.round(
        completedSessions.reduce(
          (sum, s) =>
            sum + ((s.correct_count || 0) / (s.total_count || 1)) * 100,
          0,
        ) / completedSessions.length,
      )
    : 0;
  const avgTimePerQ = timeFilteredResponses.length
    ? Math.round(
        timeFilteredResponses.reduce(
          (sum, r) => sum + r.time_spent_seconds,
          0,
        ) / timeFilteredResponses.length,
      )
    : 0;
  const totalQuestions = sets.reduce((sum, s) => sum + s.total_questions, 0);

  async function handleDeleteSet() {
    if (!deletingSet) return;
    setDeleteSetLoading(true);
    try {
      await deleteQuestionSet(deletingSet.id);
      setSets((prev) => prev.filter((s) => s.id !== deletingSet.id));
      setDeletingSet(null);
      toast.success("Question set deleted");
    } catch (err) {
      toast.error(`Failed to delete: ${err}`);
    } finally {
      setDeleteSetLoading(false);
    }
  }

  function getLastScore(setId: string) {
    const setSession = timeFilteredSessions
      .filter((s) => s.set_id === setId && s.completed_at)
      .sort(
        (a, b) =>
          new Date(b.started_at).getTime() - new Date(a.started_at).getTime(),
      );
    if (setSession.length === 0) return null;
    const s = setSession[0];
    return {
      correct: s.correct_count || 0,
      total: s.total_count || 0,
    };
  }

  const renderSetCard = (qs: QuestionSet, i: number) => {
    const lastScore = getLastScore(qs.id);
    return (
      <Card
        key={qs.id}
        className="glass-card animate-slide-up"
        style={{ animationDelay: `${i * 60}ms` }}
      >
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <CardTitle className="text-base font-semibold line-clamp-2 flex-1 mr-2">
              {qs.name}
            </CardTitle>
            <div className="flex items-center gap-2 shrink-0">
              {lastScore && (
                <Badge
                  variant={lastScore.correct / lastScore.total >= 0.7 ? "default" : "destructive"}
                >
                  {lastScore.correct}/{lastScore.total}
                </Badge>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-slate-400 hover:text-white"
                    onClick={(e) => e.preventDefault()}
                  >
                    <FaIcon icon={faEllipsisVertical} className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="bg-slate-900 border-slate-700">
                  <DropdownMenuItem
                    onClick={() => setEditingSet(qs)}
                    className="cursor-pointer text-slate-200 hover:bg-slate-800 focus:bg-slate-800"
                  >
                    <FaIcon icon={faPencil} className="mr-2 h-4 w-4 text-blue-400" />
                    Edit Set Info
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => setManagingSet(qs)}
                    className="cursor-pointer text-slate-200 hover:bg-slate-800 focus:bg-slate-800"
                  >
                    <FaIcon icon={faListUl} className="mr-2 h-4 w-4 text-green-400" />
                    Manage Questions
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => setDeletingSet(qs)}
                    className="cursor-pointer text-red-400 hover:bg-slate-800 focus:bg-slate-800"
                  >
                    <FaIcon icon={faTrash} className="mr-2 h-4 w-4" />
                    Delete Set
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
          {qs.difficulty_range && (
            <Badge variant="outline" className="w-fit border-blue-500/30 text-blue-400 text-xs mt-1">
              {qs.difficulty_range}
            </Badge>
          )}
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2 mb-4 text-xs text-muted-foreground items-center">
            <Badge variant="outline" className="border-slate-500/30">
              {qs.total_questions} questions
            </Badge>
          </div>

          <div className="flex gap-2">
            <Link href={`/exam/setup?setId=${qs.id}&mode=timed`} className="flex-1">
              <Button className="w-full bg-blue-600 hover:bg-blue-700 text-xs h-8">
                <FaIcon icon={faClock} className="mr-2 h-3.5 w-3.5" />
                Timed
              </Button>
            </Link>
            <Link href={`/exam/setup?setId=${qs.id}&mode=practice`} className="flex-1">
              <Button
                variant="outline"
                className="w-full border-green-500/30 hover:bg-green-500/10 text-green-400 text-xs h-8"
              >
                <FaIcon icon={faPen} className="mr-2 h-3.5 w-3.5" />
                Practice
              </Button>
            </Link>
            <Link href={`/exam/setup?setId=${qs.id}&mode=review`} className="flex-1">
              <Button
                variant="outline"
                className="w-full border-purple-500/30 hover:bg-purple-500/10 text-purple-400 text-xs h-8"
              >
                <FaIcon icon={faEye} className="mr-2 h-3.5 w-3.5" />
                Review
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    );
  };

  // Filter and sort question sets
  const filteredSets = useMemo(() => {
    let result = [...sets];

    // Filter by study_date via timeFilter
    if (timeFilter !== "all") {
      const now = new Date();
      const isSameDay = (d: Date, ref: Date) =>
        d.getFullYear() === ref.getFullYear() &&
        d.getMonth() === ref.getMonth() &&
        d.getDate() === ref.getDate();
      result = result.filter((s) => {
        if (!s.study_date) return false;
        const parts = s.study_date.split("-").map(Number);
        if (parts.length !== 3) return true;
        const d = new Date(parts[0], parts[1] - 1, parts[2]);
        if (Number.isNaN(d.getTime())) return true;
        switch (timeFilter) {
          case "today":
            return isSameDay(d, now);
          case "yesterday": {
            const yesterday = new Date(now);
            yesterday.setDate(now.getDate() - 1);
            return isSameDay(d, yesterday);
          }
          case "3d":
            return d.getTime() >= now.getTime() - 3 * 24 * 60 * 60 * 1000;
          case "7d":
            return d.getTime() >= now.getTime() - 7 * 24 * 60 * 60 * 1000;
          case "21d":
            return d.getTime() >= now.getTime() - 21 * 24 * 60 * 60 * 1000;
          default:
            return true;
        }
      });
    }

    // Search
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          (s.topics?.toLowerCase().includes(q) ?? false) ||
          (s.section?.toLowerCase().includes(q) ?? false) ||
          (s.difficulty_range?.toLowerCase().includes(q) ?? false) ||
          (s.source_filename?.toLowerCase().includes(q) ?? false) ||
          (s.target?.toLowerCase().includes(q) ?? false)
      );
    }

    // Sort within groups
    result.sort((a, b) => {
      switch (sortBy) {
        case "newest":
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        case "oldest":
          return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        case "name-az":
          return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
        case "name-za":
          return b.name.localeCompare(a.name, undefined, { sensitivity: "base" });
        case "questions-desc":
          return b.total_questions - a.total_questions;
        case "questions-asc":
          return a.total_questions - b.total_questions;
        default:
          return 0;
      }
    });

    return result;
  }, [sets, searchQuery, sortBy, timeFilter]);

  // Group by date → section
  const groupedByDate = useMemo(() => {
    const byDate: Record<string, Record<string, QuestionSet[]>> = {};
    for (const qs of filteredSets) {
      const dateKey = getDateKey(qs);
      const secKey = normalizeSectionKey(qs.section);
      if (!byDate[dateKey]) byDate[dateKey] = {};
      if (!byDate[dateKey][secKey]) byDate[dateKey][secKey] = [];
      byDate[dateKey][secKey].push(qs);
    }
    // Sort date keys newest first; "unscheduled" always last
    const dateKeys = Object.keys(byDate).sort((a, b) => {
      if (a === "unscheduled") return 1;
      if (b === "unscheduled") return -1;
      return b.localeCompare(a);
    });
    return dateKeys.map((dateKey) => ({
      dateKey,
      label: formatDateHeading(dateKey),
      sub: formatDateSub(dateKey),
      total: Object.values(byDate[dateKey]).reduce((s, arr) => s + arr.length, 0),
      sections: [
        ...SECTION_ORDER.filter((k) => byDate[dateKey][k]),
        ...Object.keys(byDate[dateKey]).filter((k) => !SECTION_ORDER.includes(k)),
      ].map((secKey) => ({ secKey, sets: byDate[dateKey][secKey] })),
    }));
  }, [filteredSets]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center animate-pulse">
          <div className="text-2xl font-bold text-blue-400 mb-2">GMAT Focus Edition</div>
          <div className="text-muted-foreground">Loading...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-6 max-w-7xl mx-auto">
      {/* Header */}
      <header className="mb-8 animate-fade-in">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-400 to-blue-600 bg-clip-text text-transparent">
              GMAT Focus Edition
            </h1>
            <p className="text-muted-foreground mt-1">Exam Simulator & Performance Tracker</p>
          </div>
          <div className="flex gap-3 flex-wrap items-center">
            <ThemeToggle />
            <Link href="/exam/simulation/setup">
              <Button
                variant="outline"
                className="border-indigo-500/40 text-indigo-400 hover:bg-indigo-500/10 transition-all"
              >
                <FaIcon icon={faBullseye} className="mr-2 h-4 w-4" />
                Mock Exam
              </Button>
            </Link>
            <Link href="/import">
              <Button className="bg-blue-600 hover:bg-blue-700 transition-all duration-200 shadow-lg shadow-blue-600/20">
                <FaIcon icon={faUpload} className="mr-2 h-4 w-4" />
                Import Questions
              </Button>
            </Link>
            <Link href="/analytics">
              <Button
                variant="outline"
                className="border-blue-500/30 hover:bg-blue-500/10 transition-all"
              >
                <FaIcon icon={faChartLine} className="mr-2 h-4 w-4" />
                Analytics
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8 animate-slide-up">
        {(
          [
            { label: "Question Sets", value: sets.length, icon: faBookOpen, color: "blue" },
            { label: "Total Sessions", value: totalSessions, icon: faBullseye, color: "green" },
            { label: "Avg Accuracy", value: `${avgAccuracy}%`, icon: faChartLine, color: "purple" },
            { label: "Avg Time/Q", value: avgTimePerQ ? `${avgTimePerQ}s` : "—", icon: faClock, color: "amber" },
          ] as { label: string; value: string | number; icon: IconDefinition; color: string }[]
        ).map((stat) => (
          <Card key={stat.label} className="glass-card">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <FaIcon icon={stat.icon} className="h-6 w-6 text-slate-200" />
                <div>
                  <p className="text-2xl font-bold">{stat.value}</p>
                  <p className="text-xs text-muted-foreground">{stat.label}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Additional Stats */}
      <div className="glass-card rounded-lg p-4 mb-8 flex items-center justify-between">
        <div className="flex items-center gap-6 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-2">
            <FaIcon icon={faPen} className="h-4 w-4 text-slate-300" />
            {totalQuestions} total questions imported
          </span>
          <span className="inline-flex items-center gap-2">
            <FaIcon icon={faCircleCheck} className="h-4 w-4 text-emerald-400" />
            {completedSessions.length} completed exams
          </span>
        </div>
      </div>

      {/* Question Sets Section */}
      <div className="mb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h2 className="text-xl font-semibold">Question Sets</h2>

        {sets.length > 0 && (
          <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
            {/* Search */}
            <div className="relative flex-1 sm:w-56">
              <FaIcon
                icon={faMagnifyingGlass}
                className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground"
              />
              <Input
                placeholder="Search by name, topics…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 bg-white dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 h-9 text-sm"
              />
            </div>

            {/* Time range */}
            <Select value={timeFilter} onValueChange={(v) => setTimeFilter(v as TimeFilter)}>
              <SelectTrigger className="w-full sm:w-40 h-9 bg-white dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 text-sm">
                <FaIcon icon={faClock} className="w-4 h-4 mr-2 text-muted-foreground shrink-0" />
                <SelectValue placeholder="Time" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All time</SelectItem>
                <SelectItem value="today">Today</SelectItem>
                <SelectItem value="yesterday">Yesterday</SelectItem>
                <SelectItem value="3d">Last 3 days</SelectItem>
                <SelectItem value="7d">Last 7 days</SelectItem>
                <SelectItem value="21d">Last 21 days</SelectItem>
              </SelectContent>
            </Select>

            {/* Sort */}
            <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortOption)}>
              <SelectTrigger className="w-full sm:w-44 h-9 bg-white dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 text-sm">
                <FaIcon icon={faArrowsUpDown} className="w-4 h-4 mr-2 text-muted-foreground shrink-0" />
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="newest">Newest first</SelectItem>
                <SelectItem value="oldest">Oldest first</SelectItem>
                <SelectItem value="name-az">
                  Name A <FaIcon icon={faArrowRight} className="mx-2 h-3 w-3" /> Z
                </SelectItem>
                <SelectItem value="name-za">
                  Name Z <FaIcon icon={faArrowLeft} className="mx-2 h-3 w-3" /> A
                </SelectItem>
                <SelectItem value="questions-desc">Most questions</SelectItem>
                <SelectItem value="questions-asc">Fewest questions</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {/* Content */}
      {sets.length === 0 ? (
        <Card className="glass-card border-dashed border-2 border-blue-500/20">
          <CardContent className="py-16 text-center">
            <div className="mb-4 flex justify-center">
              <FaIcon icon={faFile} className="h-10 w-10 text-slate-400" />
            </div>
            <h3 className="text-xl font-semibold mb-2">No Question Sets Yet</h3>
            <p className="text-muted-foreground mb-6 max-w-md mx-auto">
              Import your GMAT question files (.docx, .pdf, .txt) to get started with practice sessions.
            </p>
            <Link href="/import">
              <Button className="bg-blue-600 hover:bg-blue-700 shadow-lg shadow-blue-600/20">
                Import Your First Set
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : filteredSets.length === 0 ? (
        <Card className="glass-card border-dashed border-2 border-slate-600/50">
          <CardContent className="py-12 text-center">
            {timeFilter === "today" ? (
              <>
                <p className="text-muted-foreground mb-1">No question sets scheduled for today.</p>
                <p className="text-xs text-muted-foreground/60 mb-4">
                  Sets need a study date of today to appear here.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { setTimeFilter("all"); setSearchQuery(""); }}
                >
                  Show all sets
                </Button>
              </>
            ) : (
              <>
                <p className="text-muted-foreground mb-2">No question sets match your filters.</p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { setSearchQuery(""); setTimeFilter("all"); }}
                >
                  Clear filters
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-8">
          {groupedByDate.map(({ dateKey, label, sub, total, sections }) => (
            <div key={dateKey}>
              {/* Date header */}
              <div className="flex items-center gap-3 mb-5">
                <h3 className="text-base font-semibold whitespace-nowrap">{label}</h3>
                {sub && (
                  <span className="text-xs text-muted-foreground whitespace-nowrap">{sub}</span>
                )}
                <div className="flex-1 h-px bg-slate-700/60" />
                <Badge variant="outline" className="text-xs border-slate-600 shrink-0">
                  {total} {total === 1 ? "set" : "sets"}
                </Badge>
              </div>

              {/* Section sub-groups */}
              <div className="space-y-5 pl-0">
                {sections.map(({ secKey, sets: secSets }, si) => {
                  const colors = SECTION_COLORS[secKey] ?? SECTION_COLORS["Other"];
                  return (
                    <div key={secKey}>
                      {/* Section sub-header */}
                      <div className={`flex items-center gap-2 mb-3 pb-2 border-b ${colors.border}`}>
                        <span className={`w-2 h-2 rounded-full shrink-0 ${colors.dot}`} />
                        <span className={`text-xs font-semibold uppercase tracking-wide ${colors.text}`}>
                          {secKey}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {secSets.length} {secSets.length === 1 ? "set" : "sets"}
                        </span>
                      </div>
                      {/* Cards grid */}
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {secSets.map((qs, i) => renderSetCard(qs, si * 10 + i))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          <div className="text-xs text-muted-foreground pt-2">
            {filteredSets.length === sets.length
              ? `Showing all ${sets.length} question sets`
              : `Showing ${filteredSets.length} of ${sets.length} question sets`}
          </div>
        </div>
      )}

      {/* CRUD modals */}
      <SetEditModal
        open={!!editingSet}
        questionSet={editingSet}
        onClose={() => setEditingSet(null)}
        onSaved={(updated) =>
          setSets((prev) =>
            prev.map((s) => (s.id === editingSet?.id ? { ...s, ...updated } : s))
          )
        }
      />
      <QuestionManagerSheet
        open={!!managingSet}
        questionSet={managingSet}
        onClose={() => setManagingSet(null)}
        onChanged={() => {}}
      />
      <DeleteConfirmDialog
        open={!!deletingSet}
        title="Delete Question Set"
        description={`Delete "${deletingSet?.name}" and all its questions? This cannot be undone.`}
        onConfirm={handleDeleteSet}
        onCancel={() => setDeletingSet(null)}
        loading={deleteSetLoading}
      />
    </div>
  );
}
