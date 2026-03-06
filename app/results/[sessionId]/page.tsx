"use client";

import React, { useEffect, useState, use } from "react";
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
  getSession,
  getResponsesBySession,
  getQuestionsBySetId,
} from "@/lib/db";
import { ExamSession, QuestionResponse, Question } from "@/types/gmat";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Cell,
  ReferenceLine,
} from "recharts";

function formatTimeShort(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function ResultsPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = use(params);
  const router = useRouter();
  const [session, setSession] = useState<ExamSession | null>(null);
  const [responses, setResponses] = useState<QuestionResponse[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [expandedQ, setExpandedQ] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const sess = await getSession(sessionId);
        if (!sess) return;
        setSession(sess);

        const [resp, qs] = await Promise.all([
          getResponsesBySession(sessionId),
          getQuestionsBySetId(sess.set_id),
        ]);
        setResponses(resp);
        setQuestions(qs);
      } catch (e) {
        console.error("Failed to load results:", e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [sessionId]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">
          Loading results...
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="glass-card">
          <CardContent className="py-8 text-center">
            <p>Session not found</p>
            <Button onClick={() => router.push("/")} className="mt-4">
              Dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const correct = session.correct_count || 0;
  const total = session.total_count || 0;
  const accuracy = total > 0 ? Math.round((correct / total) * 100) : 0;
  const totalTime = session.total_time_seconds || 0;
  const avgTime =
    responses.length > 0
      ? Math.round(
          responses.reduce((s, r) => s + r.time_spent_seconds, 0) /
            responses.length,
        )
      : 0;

  // Build question map for lookup
  const qMap = new Map(questions.map((q) => [q.id, q]));

  // Difficulty band chart data
  const bands: Record<string, { correct: number; total: number }> = {};
  responses.forEach((r) => {
    const q = qMap.get(r.question_id);
    if (!q) return;
    const band = `${Math.floor(q.difficulty / 50) * 50}–${Math.floor(q.difficulty / 50) * 50 + 49}`;
    if (!bands[band]) bands[band] = { correct: 0, total: 0 };
    bands[band].total++;
    if (r.is_correct) bands[band].correct++;
  });
  const bandData = Object.entries(bands)
    .sort(([a], [b]) => parseInt(a) - parseInt(b))
    .map(([band, data]) => ({
      band,
      accuracy: Math.round((data.correct / data.total) * 100),
      correct: data.correct,
      total: data.total,
    }));

  // Time per question chart
  const timeData = responses.map((r, i) => ({
    name: `Q${i + 1}`,
    time: r.time_spent_seconds,
    correct: r.is_correct,
  }));

  // Answer changes analysis
  const changedAnswers = responses.filter(
    (r) => r.answer_changes && r.answer_changes.length > 0,
  );
  const changesHelped = changedAnswers.filter((r) => r.is_correct).length;
  const changesHurt = changedAnswers.length - changesHelped;

  return (
    <div className="min-h-screen p-6 max-w-6xl mx-auto">
      <Button
        variant="ghost"
        onClick={() => router.push("/")}
        className="mb-6 text-muted-foreground"
      >
        ← Dashboard
      </Button>

      {/* ─── Score Summary ─────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8 animate-slide-up">
        <Card className="glass-card md:col-span-2">
          <CardContent className="py-8 text-center">
            <div className="text-6xl font-bold mb-2">
              <span
                className={
                  accuracy >= 70
                    ? "text-green-400"
                    : accuracy >= 50
                      ? "text-yellow-400"
                      : "text-red-400"
                }
              >
                {correct}
              </span>
              <span className="text-2xl text-muted-foreground">/{total}</span>
            </div>
            <div className="text-lg text-muted-foreground mb-3">
              {accuracy}% Accuracy
            </div>
            <Badge
              className={`text-sm px-4 py-1 ${
                accuracy >= 70
                  ? "bg-green-600/20 text-green-400 border-green-500/30"
                  : "bg-red-600/20 text-red-400 border-red-500/30"
              }`}
              variant="outline"
            >
              {accuracy >= 70 ? "✅ TARGET MET" : "❌ NEEDS IMPROVEMENT"}
            </Badge>
          </CardContent>
        </Card>

        <Card className="glass-card">
          <CardContent className="py-6 text-center">
            <p className="text-3xl font-bold">{formatTimeShort(totalTime)}</p>
            <p className="text-xs text-muted-foreground mt-1">Total Time</p>
          </CardContent>
        </Card>

        <Card className="glass-card">
          <CardContent className="py-6 text-center">
            <p className="text-3xl font-bold">{formatTimeShort(avgTime)}</p>
            <p className="text-xs text-muted-foreground mt-1">Avg Time/Q</p>
          </CardContent>
        </Card>
      </div>

      {/* ─── Question-by-Question Review ───────────────────── */}
      <Card className="glass-card mb-8 animate-slide-up">
        <CardHeader>
          <CardTitle className="text-lg">Question Review</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow className="border-slate-700">
                <TableHead className="w-12">Q#</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Difficulty</TableHead>
                <TableHead>Your Answer</TableHead>
                <TableHead>Correct</TableHead>
                <TableHead>Time</TableHead>
                <TableHead className="w-16">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {responses.map((r, i) => {
                const q = qMap.get(r.question_id);
                if (!q) return null;
                const isExpanded = expandedQ === r.id;

                return (
                  <React.Fragment key={r.id}>
                    <TableRow
                      key={r.id}
                      className="border-slate-800 cursor-pointer hover:bg-slate-800/50 transition-colors"
                      onClick={() => setExpandedQ(isExpanded ? null : r.id)}
                    >
                      <TableCell className="font-medium">{i + 1}</TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className="text-xs border-slate-600"
                        >
                          {q.topic || q.question_type}
                        </Badge>
                      </TableCell>
                      <TableCell>{q.difficulty}</TableCell>
                      <TableCell>
                        <span
                          className={
                            r.is_correct ? "text-green-400" : "text-red-400"
                          }
                        >
                          {r.selected_answer || "—"}
                        </span>
                        {r.answer_changes && r.answer_changes.length > 0 && (
                          <span
                            className="text-xs text-yellow-400 ml-1"
                            title="Answer was changed"
                          >
                            🔄
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-green-400 font-medium">
                        {q.correct_answer}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatTimeShort(r.time_spent_seconds)}
                      </TableCell>
                      <TableCell className="text-lg">
                        {r.is_correct ? "✅" : r.selected_answer ? "❌" : "⏭️"}
                      </TableCell>
                    </TableRow>
                    {isExpanded && q.explanation && (
                      <TableRow className="border-slate-800">
                        <TableCell colSpan={7}>
                          <div className="py-3 px-4 bg-slate-900/50 rounded-lg animate-fade-in">
                            <h4 className="text-sm font-semibold text-blue-400 mb-2">
                              Explanation
                            </h4>
                            <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
                              {q.explanation}
                            </p>
                            {r.answer_changes &&
                              r.answer_changes.length > 0 && (
                                <div className="mt-3 pt-3 border-t border-slate-700">
                                  <span className="text-xs text-yellow-400">
                                    Answer Changes:{" "}
                                  </span>
                                  {r.answer_changes.map((c, ci) => (
                                    <span
                                      key={ci}
                                      className="text-xs text-muted-foreground"
                                    >
                                      {c.from} → {c.to}
                                      {ci < r.answer_changes.length - 1
                                        ? ", "
                                        : ""}
                                    </span>
                                  ))}
                                </div>
                              )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </React.Fragment>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* ─── Charts ────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        {/* Accuracy by Difficulty */}
        {bandData.length > 0 && (
          <Card className="glass-card animate-slide-up">
            <CardHeader>
              <CardTitle className="text-sm">
                Accuracy by Difficulty Band
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={bandData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis
                    dataKey="band"
                    tick={{ fill: "#94a3b8", fontSize: 11 }}
                  />
                  <YAxis
                    tick={{ fill: "#94a3b8", fontSize: 11 }}
                    domain={[0, 100]}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "#0f172a",
                      border: "1px solid #1e293b",
                      borderRadius: 8,
                    }}
                    labelStyle={{ color: "#94a3b8" }}
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    formatter={
                      ((value: any, _: any, entry: any) => [
                        `${value}% (${entry?.payload?.correct}/${entry?.payload?.total})`,
                        "Accuracy",
                      ]) as any
                    }
                  />
                  <Bar dataKey="accuracy" radius={[4, 4, 0, 0]}>
                    {bandData.map((entry, index) => (
                      <Cell
                        key={index}
                        fill={
                          entry.accuracy >= 70
                            ? "#10B981"
                            : entry.accuracy >= 50
                              ? "#F59E0B"
                              : "#EF4444"
                        }
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* Time Per Question */}
        {timeData.length > 0 && (
          <Card className="glass-card animate-slide-up">
            <CardHeader>
              <CardTitle className="text-sm">Time per Question</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={timeData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis
                    dataKey="name"
                    tick={{ fill: "#94a3b8", fontSize: 11 }}
                  />
                  <YAxis
                    tick={{ fill: "#94a3b8", fontSize: 11 }}
                    label={{
                      value: "sec",
                      angle: -90,
                      position: "insideLeft",
                      style: { fill: "#94a3b8", fontSize: 11 },
                    }}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "#0f172a",
                      border: "1px solid #1e293b",
                      borderRadius: 8,
                    }}
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    formatter={
                      ((value: any) => [
                        `${formatTimeShort(Number(value))}`,
                        "Time",
                      ]) as any
                    }
                  />
                  <ReferenceLine
                    y={avgTime}
                    stroke="#3B82F6"
                    strokeDasharray="5 5"
                    label={{
                      value: `Avg: ${avgTime}s`,
                      fill: "#3B82F6",
                      fontSize: 11,
                    }}
                  />
                  <Bar dataKey="time" radius={[4, 4, 0, 0]}>
                    {timeData.map((entry, index) => (
                      <Cell
                        key={index}
                        fill={entry.correct ? "#10B981" : "#EF4444"}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}
      </div>

      {/* ─── Answer Change Analysis ────────────────────────── */}
      {changedAnswers.length > 0 && (
        <Card className="glass-card mb-8 animate-slide-up">
          <CardHeader>
            <CardTitle className="text-sm">Answer Change Analysis</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-2xl font-bold text-yellow-400">
                  {changedAnswers.length}
                </p>
                <p className="text-xs text-muted-foreground">Answers Changed</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-green-400">
                  {changesHelped}
                </p>
                <p className="text-xs text-muted-foreground">Changes Helped</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-red-400">{changesHurt}</p>
                <p className="text-xs text-muted-foreground">Changes Hurt</p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground text-center mt-3">
              {changesHelped >= changesHurt
                ? "✅ Changing answers was generally beneficial"
                : "⚠️ Your first instinct was often better — trust it more"}
            </p>
          </CardContent>
        </Card>
      )}

      {/* ─── Error Log ─────────────────────────────────────── */}
      <Card className="glass-card mb-8 animate-slide-up">
        <CardHeader>
          <CardTitle className="text-sm">Error Log</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow className="border-slate-700">
                <TableHead className="w-10">Q#</TableHead>
                <TableHead>My Answer</TableHead>
                <TableHead>Correct</TableHead>
                <TableHead>Topic</TableHead>
                <TableHead>Error Type</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {responses
                .filter((r) => !r.is_correct)
                .map((r, i) => {
                  const q = qMap.get(r.question_id);
                  if (!q) return null;
                  return (
                    <TableRow key={i} className="border-slate-800">
                      <TableCell>{q.question_number}</TableCell>
                      <TableCell className="text-red-400">
                        {r.selected_answer || "Skipped"}
                      </TableCell>
                      <TableCell className="text-green-400">
                        {q.correct_answer}
                      </TableCell>
                      <TableCell>{q.topic || q.question_type}</TableCell>
                      <TableCell className="text-muted-foreground text-xs">
                        {!r.selected_answer ? "Skipped" : "Review needed"}
                      </TableCell>
                    </TableRow>
                  );
                })}
            </TableBody>
          </Table>
          {responses.filter((r) => !r.is_correct).length === 0 && (
            <p className="text-center py-4 text-green-400">
              🎉 Perfect score — no errors!
            </p>
          )}
        </CardContent>
      </Card>

      {/* ─── Actions ───────────────────────────────────────── */}
      <div className="flex justify-center gap-4 pb-12">
        <Button variant="outline" onClick={() => router.push("/")}>
          Back to Dashboard
        </Button>
        <Button
          onClick={() => router.push("/analytics")}
          className="bg-blue-600 hover:bg-blue-700"
        >
          View Analytics →
        </Button>
      </div>
    </div>
  );
}
