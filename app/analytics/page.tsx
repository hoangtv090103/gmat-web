"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  getAllSessions,
  getAllResponses,
  getQuestionSets,
  getQuestionsBySetId,
} from "@/lib/db";
import {
  ExamSession,
  QuestionResponse,
  QuestionSet,
  Question,
} from "@/types/gmat";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ScatterChart,
  Scatter,
  Cell,
} from "recharts";

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}
function formatTimeShort(s: number) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

export default function AnalyticsPage() {
  const router = useRouter();
  const [sessions, setSessions] = useState<ExamSession[]>([]);
  const [responses, setResponses] = useState<QuestionResponse[]>([]);
  const [sets, setSets] = useState<QuestionSet[]>([]);
  const [allQuestions, setAllQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [sess, resp, qSets] = await Promise.all([
          getAllSessions(),
          getAllResponses(),
          getQuestionSets(),
        ]);
        setSessions(sess);
        setResponses(resp);
        setSets(qSets);

        // Load all questions for topic analysis
        const allQs: Question[] = [];
        for (const s of qSets) {
          const qs = await getQuestionsBySetId(s.id);
          allQs.push(...qs);
        }
        setAllQuestions(allQs);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const qMap = useMemo(
    () => new Map(allQuestions.map((q) => [q.id, q])),
    [allQuestions],
  );
  const setMap = useMemo(() => new Map(sets.map((s) => [s.id, s])), [sets]);
  const completed = useMemo(
    () => sessions.filter((s) => s.completed_at),
    [sessions],
  );

  // ─── Accuracy Over Time ──────────────────────────────────
  const accuracyOverTime = useMemo(
    () =>
      completed
        .sort(
          (a, b) =>
            new Date(a.started_at).getTime() - new Date(b.started_at).getTime(),
        )
        .map((s, i) => ({
          session: i + 1,
          date: formatDate(s.started_at),
          accuracy: s.total_count
            ? Math.round(((s.correct_count || 0) / s.total_count) * 100)
            : 0,
        })),
    [completed],
  );

  // ─── Avg Time Over Time ──────────────────────────────────
  const timeOverTime = useMemo(() => {
    const sessionResponses = new Map<string, QuestionResponse[]>();
    responses.forEach((r) => {
      const arr = sessionResponses.get(r.session_id) || [];
      arr.push(r);
      sessionResponses.set(r.session_id, arr);
    });

    return completed
      .sort(
        (a, b) =>
          new Date(a.started_at).getTime() - new Date(b.started_at).getTime(),
      )
      .map((s, i) => {
        const sResp = sessionResponses.get(s.id) || [];
        const avg = sResp.length
          ? Math.round(
              sResp.reduce((sum, r) => sum + r.time_spent_seconds, 0) /
                sResp.length,
            )
          : 0;
        return { session: i + 1, date: formatDate(s.started_at), avgTime: avg };
      });
  }, [completed, responses]);

  // ─── Accuracy by Question Type (Radar) ───────────────────
  const radarData = useMemo(() => {
    const typeStats: Record<string, { correct: number; total: number }> = {};
    responses.forEach((r) => {
      const q = qMap.get(r.question_id);
      if (!q) return;
      const type = q.topic || q.question_type;
      if (!typeStats[type]) typeStats[type] = { correct: 0, total: 0 };
      typeStats[type].total++;
      if (r.is_correct) typeStats[type].correct++;
    });
    return Object.entries(typeStats).map(([type, data]) => ({
      type: type.length > 15 ? type.substring(0, 15) + "..." : type,
      fullType: type,
      accuracy: data.total ? Math.round((data.correct / data.total) * 100) : 0,
      count: data.total,
    }));
  }, [responses, qMap]);

  // ─── Answer Change Analysis ──────────────────────────────
  const changeAnalysis = useMemo(() => {
    const changed = responses.filter(
      (r) => r.answer_changes && r.answer_changes.length > 0,
    );
    const helped = changed.filter((r) => r.is_correct).length;
    return {
      total: changed.length,
      helped,
      hurt: changed.length - helped,
      rate: responses.length
        ? Math.round((changed.length / responses.length) * 100)
        : 0,
    };
  }, [responses]);

  // ─── Flag Analysis ───────────────────────────────────────
  const flagAnalysis = useMemo(() => {
    const flagged = responses.filter((r) => r.flagged_for_review);
    const flaggedCorrect = flagged.filter((r) => r.is_correct).length;
    const unflagged = responses.filter((r) => !r.flagged_for_review);
    const unflaggedCorrect = unflagged.filter((r) => r.is_correct).length;
    return {
      flaggedCount: flagged.length,
      flaggedAccuracy: flagged.length
        ? Math.round((flaggedCorrect / flagged.length) * 100)
        : 0,
      unflaggedAccuracy: unflagged.length
        ? Math.round((unflaggedCorrect / unflagged.length) * 100)
        : 0,
    };
  }, [responses]);

  // ─── Time vs Accuracy Scatter ────────────────────────────
  const scatterData = useMemo(
    () =>
      responses.map((r) => ({
        time: r.time_spent_seconds,
        correct: r.is_correct ? 1 : 0,
      })),
    [responses],
  );

  // ─── Weakness Areas ──────────────────────────────────────
  const weaknesses = useMemo(() => {
    const typeStats: Record<string, { correct: number; total: number }> = {};
    responses.forEach((r) => {
      const q = qMap.get(r.question_id);
      if (!q) return;
      const type = q.topic || q.question_type;
      if (!typeStats[type]) typeStats[type] = { correct: 0, total: 0 };
      typeStats[type].total++;
      if (r.is_correct) typeStats[type].correct++;
    });
    return Object.entries(typeStats)
      .map(([type, data]) => ({
        type,
        accuracy: data.total
          ? Math.round((data.correct / data.total) * 100)
          : 0,
        total: data.total,
        correct: data.correct,
      }))
      .sort((a, b) => a.accuracy - b.accuracy)
      .slice(0, 3);
  }, [responses, qMap]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">
          Loading analytics...
        </div>
      </div>
    );
  }

  const tooltipStyle = {
    contentStyle: {
      background: "#0f172a",
      border: "1px solid #1e293b",
      borderRadius: 8,
    },
    labelStyle: { color: "#94a3b8" },
  };

  return (
    <div className="min-h-screen p-6 max-w-7xl mx-auto">
      <header className="mb-8 animate-fade-in">
        <Button
          variant="ghost"
          onClick={() => router.push("/")}
          className="mb-4 text-muted-foreground"
        >
          ← Dashboard
        </Button>
        <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
          Performance Analytics
        </h1>
        <p className="text-muted-foreground mt-1">
          {completed.length} sessions · {responses.length} responses analyzed
        </p>
      </header>

      {completed.length === 0 ? (
        <Card className="glass-card border-dashed border-2 border-blue-500/20">
          <CardContent className="py-16 text-center">
            <div className="text-5xl mb-4">📊</div>
            <h3 className="text-xl font-semibold mb-2">No Data Yet</h3>
            <p className="text-muted-foreground mb-6">
              Complete some exam sessions to see analytics
            </p>
            <Button
              onClick={() => router.push("/")}
              className="bg-blue-600 hover:bg-blue-700"
            >
              Start Practicing
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* ─── Performance Trends ────────────────────────── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            {/* Accuracy Over Time */}
            <Card className="glass-card animate-slide-up">
              <CardHeader>
                <CardTitle className="text-sm">Accuracy Over Time</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={250}>
                  <LineChart data={accuracyOverTime}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis
                      dataKey="date"
                      tick={{ fill: "#94a3b8", fontSize: 11 }}
                    />
                    <YAxis
                      domain={[0, 100]}
                      tick={{ fill: "#94a3b8", fontSize: 11 }}
                    />
                    <Tooltip
                      {...tooltipStyle}
                      formatter={(v) => [`${v}%`, "Accuracy"]}
                    />
                    <Line
                      type="monotone"
                      dataKey="accuracy"
                      stroke="#3B82F6"
                      strokeWidth={2}
                      dot={{ fill: "#3B82F6", r: 4 }}
                      activeDot={{ r: 6 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Avg Time Over Time */}
            <Card className="glass-card animate-slide-up">
              <CardHeader>
                <CardTitle className="text-sm">
                  Avg Time/Question Over Time
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={250}>
                  <LineChart data={timeOverTime}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis
                      dataKey="date"
                      tick={{ fill: "#94a3b8", fontSize: 11 }}
                    />
                    <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} />
                    <Tooltip
                      {...tooltipStyle}
                      formatter={(v) => [`${v}s`, "Avg Time"]}
                    />
                    <Line
                      type="monotone"
                      dataKey="avgTime"
                      stroke="#8B5CF6"
                      strokeWidth={2}
                      dot={{ fill: "#8B5CF6", r: 4 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          {/* ─── Radar + Behavioral ────────────────────────── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            {/* Radar Chart by Type */}
            {radarData.length > 0 && (
              <Card className="glass-card animate-slide-up">
                <CardHeader>
                  <CardTitle className="text-sm">Accuracy by Topic</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <RadarChart data={radarData}>
                      <PolarGrid stroke="#1e293b" />
                      <PolarAngleAxis
                        dataKey="type"
                        tick={{ fill: "#94a3b8", fontSize: 10 }}
                      />
                      <PolarRadiusAxis
                        domain={[0, 100]}
                        tick={{ fill: "#64748b", fontSize: 10 }}
                      />
                      <Radar
                        dataKey="accuracy"
                        stroke="#3B82F6"
                        fill="#3B82F6"
                        fillOpacity={0.2}
                        strokeWidth={2}
                      />
                    </RadarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}

            {/* Behavioral Patterns */}
            <Card className="glass-card animate-slide-up">
              <CardHeader>
                <CardTitle className="text-sm">Behavioral Patterns</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Answer Changes */}
                <div className="glass rounded-lg p-4">
                  <h4 className="text-xs font-semibold text-yellow-400 mb-3">
                    🔄 Answer Changes
                  </h4>
                  <div className="grid grid-cols-3 gap-3 text-center">
                    <div>
                      <p className="text-xl font-bold">
                        {changeAnalysis.total}
                      </p>
                      <p className="text-xs text-muted-foreground">Changed</p>
                    </div>
                    <div>
                      <p className="text-xl font-bold text-green-400">
                        {changeAnalysis.helped}
                      </p>
                      <p className="text-xs text-muted-foreground">Helped</p>
                    </div>
                    <div>
                      <p className="text-xl font-bold text-red-400">
                        {changeAnalysis.hurt}
                      </p>
                      <p className="text-xs text-muted-foreground">Hurt</p>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2 text-center">
                    {changeAnalysis.helped >= changeAnalysis.hurt
                      ? "✅ Changing answers tends to help you"
                      : "⚠️ Trust your first instinct more"}
                  </p>
                </div>

                {/* Flag Analysis */}
                <div className="glass rounded-lg p-4">
                  <h4 className="text-xs font-semibold text-blue-400 mb-3">
                    🚩 Flag vs Accuracy
                  </h4>
                  <div className="grid grid-cols-2 gap-4 text-center">
                    <div>
                      <p className="text-xl font-bold">
                        {flagAnalysis.flaggedAccuracy}%
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Flagged ({flagAnalysis.flaggedCount}Q)
                      </p>
                    </div>
                    <div>
                      <p className="text-xl font-bold">
                        {flagAnalysis.unflaggedAccuracy}%
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Not Flagged
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* ─── Time vs Accuracy Scatter ──────────────────── */}
          {scatterData.length > 5 && (
            <Card className="glass-card mb-8 animate-slide-up">
              <CardHeader>
                <CardTitle className="text-sm">
                  Time Spent vs Correctness
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={200}>
                  <ScatterChart>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis
                      dataKey="time"
                      name="Time (s)"
                      tick={{ fill: "#94a3b8", fontSize: 11 }}
                    />
                    <YAxis
                      dataKey="correct"
                      name="Correct"
                      domain={[0, 1]}
                      tick={{ fill: "#94a3b8", fontSize: 11 }}
                      ticks={[0, 1]}
                      tickFormatter={(v) => (v === 1 ? "✓" : "✗")}
                    />
                    <Tooltip {...tooltipStyle} />
                    <Scatter data={scatterData}>
                      {scatterData.map((entry, i) => (
                        <Cell
                          key={i}
                          fill={entry.correct ? "#10B981" : "#EF4444"}
                        />
                      ))}
                    </Scatter>
                  </ScatterChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {/* ─── Weakness Areas ────────────────────────────── */}
          {weaknesses.length > 0 && (
            <Card className="glass-card mb-8 animate-slide-up">
              <CardHeader>
                <CardTitle className="text-sm">
                  ⚠️ Weakness Areas (Bottom 3)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {weaknesses.map((w, i) => (
                    <div key={w.type} className="glass rounded-lg p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-lg">
                          {i === 0 ? "🔴" : i === 1 ? "🟠" : "🟡"}
                        </span>
                        <span className="font-medium text-sm">{w.type}</span>
                      </div>
                      <p className="text-2xl font-bold text-red-400">
                        {w.accuracy}%
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {w.correct}/{w.total} correct
                      </p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* ─── Session History ───────────────────────────── */}
          <Card className="glass-card mb-8 animate-slide-up">
            <CardHeader>
              <CardTitle className="text-sm">Session History</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-700">
                    <TableHead>Date</TableHead>
                    <TableHead>Set</TableHead>
                    <TableHead>Mode</TableHead>
                    <TableHead>Score</TableHead>
                    <TableHead>Accuracy</TableHead>
                    <TableHead>Time</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {completed.map((s) => {
                    const set = setMap.get(s.set_id);
                    const acc = s.total_count
                      ? Math.round(
                          ((s.correct_count || 0) / s.total_count) * 100,
                        )
                      : 0;
                    return (
                      <TableRow key={s.id} className="border-slate-800">
                        <TableCell className="text-muted-foreground">
                          {formatDate(s.started_at)}
                        </TableCell>
                        <TableCell>{set?.name || "—"}</TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className="text-xs border-slate-600"
                          >
                            {s.mode}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {s.correct_count}/{s.total_count}
                        </TableCell>
                        <TableCell>
                          <span
                            className={
                              acc >= 70
                                ? "text-green-400"
                                : acc >= 50
                                  ? "text-yellow-400"
                                  : "text-red-400"
                            }
                          >
                            {acc}%
                          </span>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {s.total_time_seconds
                            ? formatTimeShort(s.total_time_seconds)
                            : "—"}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => router.push(`/results/${s.id}`)}
                            className="text-xs text-blue-400"
                          >
                            View →
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
