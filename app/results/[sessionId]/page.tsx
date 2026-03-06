"use client";

import React, { useEffect, useState, use, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
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
  updateResponse,
} from "@/lib/db";
import {
  ExamSession,
  QuestionResponse,
  Question,
  ErrorCategory,
} from "@/types/gmat";
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
import { toast } from "sonner";

function formatTimeShort(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

const CAT_COLORS = {
  Content: "text-red-400 bg-red-400/10 border-red-500/30",
  Process: "text-yellow-400 bg-yellow-400/10 border-yellow-500/30",
  Habit: "text-blue-400 bg-blue-400/10 border-blue-500/30",
};

const CAT_EMOJIS = { Content: "🔴", Process: "🟡", Habit: "🔵" };

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

  // Error Log State
  const [filterCat, setFilterCat] = useState<ErrorCategory | "All">("All");
  const [draftNotes, setDraftNotes] = useState<Record<string, string>>({});
  const [savingNotes, setSavingNotes] = useState<Record<string, boolean>>({});

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

        const initialNotes: Record<string, string> = {};
        resp.forEach((r) => {
          if (r.note) initialNotes[r.id] = r.note;
        });
        setDraftNotes(initialNotes);
      } catch (e) {
        console.error("Failed to load results:", e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [sessionId]);

  const handleUpdateCategory = async (
    responseId: string,
    qId: string,
    category: ErrorCategory,
  ) => {
    try {
      setResponses((prev) =>
        prev.map((r) =>
          r.id === responseId ? { ...r, error_category: category } : r,
        ),
      );
      await updateResponse(sessionId, qId, { error_category: category });
      toast.success(`Marked as ${category} error`);
    } catch (e) {
      toast.error("Failed to save category");
      console.error(e);
    }
  };

  const handleNoteChange = (responseId: string, qId: string, val: string) => {
    setDraftNotes((prev) => ({ ...prev, [responseId]: val }));
    setSavingNotes((prev) => ({ ...prev, [responseId]: true }));

    // Simple debounce
    const timeoutId = setTimeout(async () => {
      try {
        await updateResponse(sessionId, qId, { note: val });
      } catch (e) {
        console.error("Save failed", e);
      } finally {
        setSavingNotes((prev) => ({ ...prev, [responseId]: false }));
      }
    }, 800);
    return () => clearTimeout(timeoutId);
  };

  const exportErrorLogCSV = () => {
    const wrongResponses = responses.filter((r) => !r.is_correct);
    if (wrongResponses.length === 0) return toast.info("No errors to export");

    const headers = [
      "Q#",
      "Type",
      "Topic",
      "Difficulty",
      "My Answer",
      "Correct Answer",
      "Time(s)",
      "Category",
      "Note",
    ];
    const rows = wrongResponses.map((r) => {
      const q = questions.find((question) => question.id === r.question_id);
      return [
        q?.question_number || "-",
        q?.question_type || "-",
        q?.topic || "-",
        q?.difficulty || "-",
        r.selected_answer || "Skipped",
        q?.correct_answer || "-",
        r.time_spent_seconds,
        r.error_category || "Uncategorized",
        `"${(r.note || "").replace(/"/g, '""')}"`,
      ].join(",");
    });

    const csvContext = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csvContext], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute(
      "download",
      `gmat_error_log_${session?.id.slice(0, 8)}.csv`,
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (loading)
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground animate-pulse">
        Loading results...
      </div>
    );
  if (!session)
    return (
      <div className="min-h-screen flex items-center justify-center">
        Session not found
      </div>
    );

  const correct = session.correct_count || 0;
  const total = session.total_count || 0;
  const accuracy = total > 0 ? Math.round((correct / total) * 100) : 0;
  const totalTime = session.total_time_seconds || 0;
  const avgTime = Math.round(
    responses.reduce((s, r) => s + r.time_spent_seconds, 0) /
      (responses.length || 1),
  );

  const qMap = new Map(questions.map((q) => [q.id, q]));

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

  const timeData = responses.map((r, i) => ({
    name: `Q${i + 1}`,
    time: r.time_spent_seconds,
    correct: r.is_correct,
  }));

  const wrongResponses = responses.filter((r) => !r.is_correct);
  const filteredWrongResponses = wrongResponses.filter(
    (r) => filterCat === "All" || r.error_category === filterCat,
  );
  const uncategorizedCount = wrongResponses.filter(
    (r) => !r.error_category,
  ).length;

  return (
    <div className="min-h-screen p-6 max-w-6xl mx-auto">
      <Button
        variant="ghost"
        onClick={() => router.push("/")}
        className="mb-6 text-muted-foreground"
      >
        ← Dashboard
      </Button>

      {/* ── Score Summary ── */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
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

      {/* ── Question Review ── */}
      <Card className="glass-card mb-8">
        <CardHeader>
          <CardTitle className="text-lg">Question Review</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow className="border-slate-700">
                <TableHead className="w-12">Q#</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Time</TableHead>
                <TableHead>Result</TableHead>
                <TableHead className="w-16">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {responses.map((r, i) => {
                const q = qMap.get(r.question_id);
                if (!q) return null;
                const isExpanded = expandedQ === r.id;
                const timeColor =
                  r.time_spent_seconds <= 90
                    ? "text-green-400"
                    : r.time_spent_seconds <= 120
                      ? "text-yellow-400"
                      : "text-red-400 font-bold";

                return (
                  <React.Fragment key={r.id}>
                    <TableRow
                      className="border-slate-800 cursor-pointer hover:bg-slate-800/50"
                      onClick={() => setExpandedQ(isExpanded ? null : r.id)}
                    >
                      <TableCell className="font-medium">{i + 1}</TableCell>
                      <TableCell className="text-sm">
                        {q.topic || q.question_type}{" "}
                        {r.triage_triggered && (
                          <span title="Triage triggered">⏰</span>
                        )}
                      </TableCell>
                      <TableCell className={timeColor}>
                        {formatTimeShort(r.time_spent_seconds)}
                      </TableCell>
                      <TableCell>
                        <span
                          className={
                            r.is_correct ? "text-green-400" : "text-red-400"
                          }
                        >
                          {r.selected_answer || "—"}
                        </span>
                        <span className="text-slate-500 mx-2">→</span>
                        <span className="text-green-400">
                          {q.correct_answer}
                        </span>
                        {r.error_category && !r.is_correct && (
                          <Badge
                            variant="outline"
                            className={`ml-3 ${CAT_COLORS[r.error_category]}`}
                          >
                            {CAT_EMOJIS[r.error_category]} {r.error_category}
                          </Badge>
                        )}
                        {!r.error_category && !r.is_correct && (
                          <span
                            className="ml-3 h-2 w-2 rounded-full bg-amber-500 inline-block animate-pulse"
                            title="Needs categorization"
                          />
                        )}
                      </TableCell>
                      <TableCell className="text-lg">
                        {r.is_correct ? "✅" : "❌"}
                      </TableCell>
                    </TableRow>
                    {isExpanded && (
                      <TableRow className="border-slate-800 bg-slate-900/30">
                        <TableCell colSpan={5} className="py-4">
                          <div className="space-y-4 max-w-4xl">
                            {/* Question stem */}
                            <div className="p-4 bg-slate-800/50 rounded-xl border border-slate-700/50">
                              {q.question_type === "Data Sufficiency" && (q.statement1 || q.statement2) ? (
                                <div className="space-y-3">
                                  <p className="text-sm leading-relaxed">{q.stem}</p>
                                  {q.statement1 && (
                                    <div className="pl-4 border-l-2 border-blue-500/40">
                                      <span className="text-blue-400 font-semibold text-sm">(1) </span>
                                      <span className="text-sm leading-relaxed">{q.statement1}</span>
                                    </div>
                                  )}
                                  {q.statement2 && (
                                    <div className="pl-4 border-l-2 border-blue-500/40">
                                      <span className="text-blue-400 font-semibold text-sm">(2) </span>
                                      <span className="text-sm leading-relaxed">{q.statement2}</span>
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <p className="text-sm leading-relaxed whitespace-pre-wrap">{q.stem}</p>
                              )}
                            </div>

                            {/* Answer choices */}
                            <div className="space-y-1.5">
                              {(["A", "B", "C", "D", "E"] as const)
                                .map((letter) => ({ letter, text: q[`choice_${letter.toLowerCase()}` as `choice_a`] }))
                                .filter((c) => c.text)
                                .map(({ letter, text }) => {
                                  const isCorrect = q.correct_answer === letter;
                                  const isSelected = r.selected_answer === letter;
                                  const isWrongSelected = isSelected && !isCorrect;
                                  return (
                                    <div
                                      key={letter}
                                      className={`flex items-start gap-3 px-3 py-2 rounded-lg text-sm border ${
                                        isCorrect
                                          ? "border-green-500/50 bg-green-500/10"
                                          : isWrongSelected
                                          ? "border-red-500/50 bg-red-500/10"
                                          : "border-slate-700/30 bg-slate-800/20"
                                      }`}
                                    >
                                      <span className={`w-6 h-6 rounded flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5 ${
                                        isCorrect ? "bg-green-600 text-white" : isWrongSelected ? "bg-red-600 text-white" : "bg-slate-700 text-slate-400"
                                      }`}>{letter}</span>
                                      <span className={`leading-relaxed ${isCorrect ? "text-green-200" : isWrongSelected ? "text-red-200" : "text-slate-300"}`}>{text}</span>
                                      {isCorrect && <span className="ml-auto text-green-400 flex-shrink-0">✓</span>}
                                      {isWrongSelected && <span className="ml-auto text-red-400 flex-shrink-0">✗</span>}
                                    </div>
                                  );
                                })}
                            </div>

                            {/* Feature 4: Passage Map */}
                            {r.passage_map &&
                              Object.keys(r.passage_map).length > 0 && (
                                <div className="p-4 bg-purple-500/5 border border-purple-500/20 rounded-xl">
                                  <h4 className="text-sm font-semibold text-purple-400 mb-2">
                                    🗺️ Passage Map
                                  </h4>
                                  <div className="space-y-2 text-sm text-slate-300">
                                    {Object.entries(r.passage_map).map(
                                      ([k, v]) => (
                                        <div key={k}>
                                          <strong className="text-slate-500 capitalize">
                                            {k}:
                                          </strong>{" "}
                                          {v}
                                        </div>
                                      ),
                                    )}
                                  </div>
                                </div>
                              )}

                            {/* Feature 3: Missing Link */}
                            {r.missing_link && (
                              <div className="p-4 bg-blue-500/5 border border-blue-500/20 rounded-xl">
                                <h4 className="text-sm font-semibold text-blue-400 mb-1">
                                  📝 My Missing Link
                                </h4>
                                <p className="text-sm text-slate-300 leading-relaxed">
                                  {r.missing_link}
                                </p>
                              </div>
                            )}

                            {/* Explanation */}
                            {q.explanation && (
                              <div className="p-4 bg-slate-900/80 rounded-xl border border-slate-700/50">
                                <h4 className="text-sm font-semibold text-blue-400 mb-2">
                                  Explanation
                                </h4>
                                <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
                                  {q.explanation}
                                </p>
                              </div>
                            )}

                            {/* Feature 1: Inline Error Categorization */}
                            {!r.is_correct && (
                              <div className="p-4 bg-amber-950/20 border border-amber-900/50 rounded-xl flex flex-col sm:flex-row gap-4">
                                <div className="flex-shrink-0">
                                  <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                                    Error Category
                                  </h4>
                                  <div className="flex gap-2">
                                    {(
                                      [
                                        "Content",
                                        "Process",
                                        "Habit",
                                      ] as ErrorCategory[]
                                    ).map((cat) => (
                                      <button
                                        key={cat}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleUpdateCategory(r.id, q.id, cat);
                                        }}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                                          r.error_category === cat
                                            ? CAT_COLORS[cat]
                                            : "border-slate-700 hover:bg-slate-800 text-slate-400"
                                        }`}
                                      >
                                        {CAT_EMOJIS[cat]} {cat}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                                <div className="flex-1">
                                  <div className="flex justify-between items-end mb-2">
                                    <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                                      Note to self
                                    </h4>
                                    {savingNotes[r.id] && (
                                      <span className="text-[10px] text-blue-400 animate-pulse">
                                        Saving...
                                      </span>
                                    )}
                                  </div>
                                  <Input
                                    value={draftNotes[r.id] || ""}
                                    onChange={(e) =>
                                      handleNoteChange(
                                        r.id,
                                        q.id,
                                        e.target.value,
                                      )
                                    }
                                    placeholder="What will I do differently next time?"
                                    className="h-8 bg-slate-900 border-slate-700 text-sm"
                                  />
                                </div>
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

      {/* ── Error Log Table ── */}
      {wrongResponses.length > 0 && (
        <Card className="glass-card mb-8 transition-all" id="error-log">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                📓 Smart Error Log
                {uncategorizedCount > 0 && (
                  <Badge
                    variant="secondary"
                    className="bg-amber-500/20 text-amber-500"
                  >
                    {uncategorizedCount} uncategorized
                  </Badge>
                )}
              </CardTitle>
            </div>
            <Button size="sm" variant="outline" onClick={exportErrorLogCSV}>
              📥 Export CSV
            </Button>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2 mb-4">
              {(["All", "Content", "Process", "Habit"] as const).map((cat) => (
                <button
                  key={cat}
                  onClick={() => setFilterCat(cat)}
                  className={`px-4 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                    filterCat === cat
                      ? cat === "All"
                        ? "bg-slate-700 text-white border-slate-600"
                        : CAT_COLORS[cat]
                      : "border-slate-800 hover:bg-slate-800 text-slate-400"
                  }`}
                >
                  {cat !== "All" && CAT_EMOJIS[cat as ErrorCategory]} {cat}
                </button>
              ))}
            </div>
            <Table>
              <TableHeader>
                <TableRow className="border-slate-700">
                  <TableHead className="w-10">Q#</TableHead>
                  <TableHead>Topic</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Time</TableHead>
                  <TableHead>Note</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredWrongResponses.map((r, i) => {
                  const q = qMap.get(r.question_id);
                  if (!q) return null;
                  const timeColor =
                    r.time_spent_seconds <= 90
                      ? "text-green-400"
                      : r.time_spent_seconds <= 120
                        ? "text-yellow-400"
                        : "text-red-400";
                  return (
                    <TableRow key={i} className="border-slate-800">
                      <TableCell>{q.question_number}</TableCell>
                      <TableCell className="text-sm">
                        {q.topic || q.question_type}
                      </TableCell>
                      <TableCell>
                        {r.error_category ? (
                          <Badge
                            variant="outline"
                            className={CAT_COLORS[r.error_category]}
                          >
                            {CAT_EMOJIS[r.error_category]} {r.error_category}
                          </Badge>
                        ) : (
                          <span className="text-amber-500 text-xs flex items-center gap-1">
                            <span className="animate-pulse">●</span>{" "}
                            Uncategorized
                          </span>
                        )}
                      </TableCell>
                      <TableCell className={timeColor}>
                        {formatTimeShort(r.time_spent_seconds)}
                      </TableCell>
                      <TableCell className="text-sm text-slate-300">
                        {r.note || (
                          <span className="text-slate-600 italic">
                            No notes
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* ── Charts ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <Card className="glass-card">
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
                  itemStyle={{ color: "#e2e8f0" }}
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  formatter={
                    ((value: any, _: any, entry: any) => [
                      `${value}% ${entry?.payload?.correct}/${entry?.payload?.total}`,
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
        <Card className="glass-card">
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
                <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} />
                <Tooltip
                  contentStyle={{
                    background: "#0f172a",
                    border: "1px solid #1e293b",
                    borderRadius: 8,
                  }}
                  labelStyle={{ color: "#94a3b8" }}
                  itemStyle={{ color: "#e2e8f0" }}
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  formatter={
                    ((value: any) => [
                      `${formatTimeShort(Number(value))}`,
                      "Time",
                    ]) as any
                  }
                />
                <ReferenceLine
                  y={120}
                  stroke="#EF4444"
                  strokeDasharray="4 4"
                  label={{
                    value: "120s Triage Limit",
                    fill: "#EF4444",
                    fontSize: 10,
                    position: "insideTopLeft",
                  }}
                />
                <ReferenceLine
                  y={avgTime}
                  stroke="#3B82F6"
                  strokeDasharray="5 5"
                  label={{
                    value: `Avg: ${avgTime}s`,
                    fill: "#3B82F6",
                    fontSize: 10,
                  }}
                />
                <Bar dataKey="time" radius={[4, 4, 0, 0]}>
                  {timeData.map((entry, index) => (
                    <Cell
                      key={index}
                      fill={
                        entry.correct
                          ? "#10B981"
                          : entry.time > 120
                            ? "#EF4444"
                            : "#F59E0B"
                      }
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <div className="flex justify-center gap-4 pb-12">
        <Button variant="outline" onClick={() => router.push("/")}>
          Dashboard
        </Button>
        <Button
          onClick={() => router.push("/analytics")}
          className="bg-blue-600 hover:bg-blue-700"
        >
          Analytics →
        </Button>
      </div>
    </div>
  );
}
