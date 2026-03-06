"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getQuestionSets, getAllSessions, getAllResponses } from "@/lib/db";
import { QuestionSet, ExamSession, QuestionResponse } from "@/types/gmat";

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
          <div className="flex gap-3">
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

      {/* Question Sets Grid */}
      <div className="mb-4">
        <h2 className="text-xl font-semibold mb-4">Question Sets</h2>
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
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {sets.map((qs, i) => {
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
                      {formatDate(qs.imported_at)}
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
          })}
        </div>
      )}
    </div>
  );
}
