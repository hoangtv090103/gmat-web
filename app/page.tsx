"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
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
import { Search, SlidersHorizontal, ArrowUpDown } from "lucide-react";
import { getQuestionSets, getAllSessions, getAllResponses } from "@/lib/db";
import { QuestionSet, ExamSession, QuestionResponse } from "@/types/gmat";

type SectionFilter = "all" | "Quantitative" | "Verbal" | "Data Insights";
type SortOption = "newest" | "oldest" | "name-az" | "name-za" | "questions-desc" | "questions-asc";

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function DashboardPage() {
  const [sets, setSets] = useState<QuestionSet[]>([]);
  const [sessions, setSessions] = useState<ExamSession[]>([]);
  const [responses, setResponses] = useState<QuestionResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [sectionFilter, setSectionFilter] = useState<SectionFilter>("all");
  const [sortBy, setSortBy] = useState<SortOption>("newest");

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

  const totalSessions = sessions.length;
  const completedSessions = sessions.filter((s) => s.completed_at);
  const avgAccuracy = completedSessions.length
    ? Math.round(
        completedSessions.reduce(
          (sum, s) =>
            sum + ((s.correct_count || 0) / (s.total_count || 1)) * 100,
          0,
        ) / completedSessions.length,
      )
    : 0;
  const avgTimePerQ = responses.length
    ? Math.round(
        responses.reduce((sum, r) => sum + r.time_spent_seconds, 0) /
          responses.length,
      )
    : 0;
  const totalQuestions = sets.reduce((sum, s) => sum + s.total_questions, 0);

  function getLastScore(setId: string) {
    const setSession = sessions
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
        style={{ animationDelay: `${i * 80}ms` }}
      >
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <CardTitle className="text-base font-semibold line-clamp-2">
              {qs.name}
            </CardTitle>
            {lastScore && (
              <Badge
                variant={
                  lastScore.correct / lastScore.total >= 0.7
                    ? "default"
                    : "destructive"
                }
                className="ml-2 shrink-0"
              >
                {lastScore.correct}/{lastScore.total}
              </Badge>
            )}
          </div>
          {qs.section && (
            <p className="text-xs text-muted-foreground">
              {qs.section}
            </p>
          )}
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2 mb-4 text-xs text-muted-foreground">
            {qs.difficulty_range && (
              <Badge
                variant="outline"
                className="border-blue-500/30 text-blue-400"
              >
                {qs.difficulty_range}
              </Badge>
            )}
            <Badge variant="outline" className="border-slate-500/30">
              {qs.total_questions} questions
            </Badge>
            <span className="opacity-60">
              {formatDate(qs.created_at)}
            </span>
          </div>

          <div className="flex gap-2">
            <Link
              href={`/exam/setup?setId=${qs.id}&mode=timed`}
              className="flex-1"
            >
              <Button className="w-full bg-blue-600 hover:bg-blue-700 text-xs h-8">
                ⏱ Timed
              </Button>
            </Link>
            <Link
              href={`/exam/setup?setId=${qs.id}&mode=practice`}
              className="flex-1"
            >
              <Button
                variant="outline"
                className="w-full border-green-500/30 hover:bg-green-500/10 text-green-400 text-xs h-8"
              >
                📝 Practice
              </Button>
            </Link>
            <Link
              href={`/exam/setup?setId=${qs.id}&mode=review`}
              className="flex-1"
            >
              <Button
                variant="outline"
                className="w-full border-purple-500/30 hover:bg-purple-500/10 text-purple-400 text-xs h-8"
              >
                👁 Review
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    );
  };

  // Filter and sort question sets
  const filteredAndSortedSets = useMemo(() => {
    let result = [...sets];

    // Search: name, topics, section
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

    // Filter by section
    if (sectionFilter !== "all") {
      result = result.filter(
        (s) =>
          s.section?.toLowerCase().includes(sectionFilter.toLowerCase()) ?? false
      );
    }

    // Sort
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
  }, [sets, searchQuery, sectionFilter, sortBy]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center animate-pulse">
          <div className="text-2xl font-bold text-blue-400 mb-2">
            GMAT Focus Edition
          </div>
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
            <p className="text-muted-foreground mt-1">
              Exam Simulator & Performance Tracker
            </p>
          </div>
          <div className="flex gap-3 flex-wrap">
            <Link href="/exam/simulation/setup">
              <Button
                variant="outline"
                className="border-indigo-500/40 text-indigo-400 hover:bg-indigo-500/10 transition-all"
              >
                🎯 Mock Exam
              </Button>
            </Link>
            <Link href="/import">
              <Button className="bg-blue-600 hover:bg-blue-700 transition-all duration-200 shadow-lg shadow-blue-600/20">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="mr-2"
                >
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
                Import Questions
              </Button>
            </Link>
            <Link href="/analytics">
              <Button
                variant="outline"
                className="border-blue-500/30 hover:bg-blue-500/10 transition-all"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="mr-2"
                >
                  <line x1="18" y1="20" x2="18" y2="10" />
                  <line x1="12" y1="20" x2="12" y2="4" />
                  <line x1="6" y1="20" x2="6" y2="14" />
                </svg>
                Analytics
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8 animate-slide-up">
        {[
          {
            label: "Question Sets",
            value: sets.length,
            icon: "📚",
            color: "blue",
          },
          {
            label: "Total Sessions",
            value: totalSessions,
            icon: "🎯",
            color: "green",
          },
          {
            label: "Avg Accuracy",
            value: `${avgAccuracy}%`,
            icon: "📊",
            color: "purple",
          },
          {
            label: "Avg Time/Q",
            value: avgTimePerQ ? `${avgTimePerQ}s` : "—",
            icon: "⏱️",
            color: "amber",
          },
        ].map((stat) => (
          <Card key={stat.label} className="glass-card">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <span className="text-2xl">{stat.icon}</span>
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
          <span>📝 {totalQuestions} total questions imported</span>
          <span>✅ {completedSessions.length} completed exams</span>
        </div>
      </div>

      {/* Question Sets Section */}
      <div className="mb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h2 className="text-xl font-semibold">Question Sets</h2>

        {sets.length > 0 && (
          <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
            {/* Search */}
            <div className="relative flex-1 sm:w-56">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, topics, section…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 bg-slate-800/50 border-slate-700 h-9 text-sm"
              />
            </div>

            {/* Filter by section */}
            <Select value={sectionFilter} onValueChange={(v) => setSectionFilter(v as SectionFilter)}>
              <SelectTrigger className="w-full sm:w-40 h-9 bg-slate-800/50 border-slate-700 text-sm">
                <SlidersHorizontal className="w-4 h-4 mr-2 text-muted-foreground shrink-0" />
                <SelectValue placeholder="Section" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All sections</SelectItem>
                <SelectItem value="Quantitative">Quantitative</SelectItem>
                <SelectItem value="Verbal">Verbal</SelectItem>
                <SelectItem value="Data Insights">Data Insights</SelectItem>
              </SelectContent>
            </Select>

            {/* Sort */}
            <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortOption)}>
              <SelectTrigger className="w-full sm:w-44 h-9 bg-slate-800/50 border-slate-700 text-sm">
                <ArrowUpDown className="w-4 h-4 mr-2 text-muted-foreground shrink-0" />
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="newest">Newest first</SelectItem>
                <SelectItem value="oldest">Oldest first</SelectItem>
                <SelectItem value="name-az">Name A → Z</SelectItem>
                <SelectItem value="name-za">Name Z → A</SelectItem>
                <SelectItem value="questions-desc">Most questions</SelectItem>
                <SelectItem value="questions-asc">Fewest questions</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {sets.length === 0 ? (
        <Card className="glass-card border-dashed border-2 border-blue-500/20">
          <CardContent className="py-16 text-center">
            <div className="text-5xl mb-4">📄</div>
            <h3 className="text-xl font-semibold mb-2">No Question Sets Yet</h3>
            <p className="text-muted-foreground mb-6 max-w-md mx-auto">
              Import your GMAT question files (.docx, .pdf, .txt) to get started
              with practice sessions.
            </p>
            <Link href="/import">
              <Button className="bg-blue-600 hover:bg-blue-700 shadow-lg shadow-blue-600/20">
                Import Your First Set
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : filteredAndSortedSets.length === 0 ? (
        <Card className="glass-card border-dashed border-2 border-slate-600/50">
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground mb-2">No question sets match your search or filter.</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSearchQuery("");
                setSectionFilter("all");
              }}
            >
              Clear filters
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {/* Group by section when filtered, or show flat list */}
          {sectionFilter !== "all" ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span>Showing</span>
                <Badge variant="outline" className="border-slate-600">
                  {filteredAndSortedSets.length} set{filteredAndSortedSets.length !== 1 ? "s" : ""}
                </Badge>
                <span>in {sectionFilter}</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredAndSortedSets.map((qs, i) => renderSetCard(qs, i))}
              </div>
            </div>
          ) : (
            <>
              {(() => {
                const bySection = filteredAndSortedSets.reduce(
                  (acc, s) => {
                    const key = s.section?.trim() || "Other";
                    if (!acc[key]) acc[key] = [];
                    acc[key].push(s);
                    return acc;
                  },
                  {} as Record<string, QuestionSet[]>
                );
                const sectionOrder = ["Quantitative", "Verbal", "Data Insights", "Other"];
                const orderedSections = [
                  ...sectionOrder.filter((k) => bySection[k]?.length),
                  ...Object.keys(bySection).filter((k) => !sectionOrder.includes(k)),
                ];
                return orderedSections.map((section) => (
                  <div key={section}>
                    <h3 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-slate-500" />
                      {section}
                      <Badge variant="outline" className="text-xs font-normal border-slate-600">
                        {bySection[section].length}
                      </Badge>
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {bySection[section].map((qs, i) => renderSetCard(qs, i))}
                    </div>
                  </div>
                ));
              })()}
            </>
          )}
        </div>
      )}

      {sets.length > 0 && filteredAndSortedSets.length > 0 && (
        <div className="mt-4 text-xs text-muted-foreground">
          {filteredAndSortedSets.length === sets.length
            ? `Showing all ${sets.length} question sets`
            : `Showing ${filteredAndSortedSets.length} of ${sets.length} question sets`}
        </div>
      )}
    </div>
  );
}
