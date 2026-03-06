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
  getAllSimulationExams,
  getSimulationSections,
} from "@/lib/db";
import {
  ExamSession,
  QuestionResponse,
  QuestionSet,
  Question,
  ErrorPattern,
  ErrorCategory,
  SimulationExam,
  SimulationSection,
  QuestionType,
  SectionType,
} from "@/types/gmat";
import {
  LineChart,
  Line,
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
  ReferenceLine,
  Legend,
} from "recharts";
type AnalyticsSectionFilter = "all" | SectionType;

const QUESTION_TYPE_TO_SECTION: Record<QuestionType, SectionType> = {
  "Data Sufficiency": "quant",
  "Problem Solving": "quant",
  "Reading Comprehension": "verbal",
  "Critical Reasoning": "verbal",
  "Multi-Source Reasoning": "di",
  "Table Analysis": "di",
  "Graphics Interpretation": "di",
  "Two-Part Analysis": "di",
};

function getSectionForQuestion(q?: Question): SectionType | null {
  if (!q) return null;
  return QUESTION_TYPE_TO_SECTION[q.question_type] ?? null;
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}
function formatDateTime(d: string) {
  return new Date(d).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
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
  const [simExams, setSimExams] = useState<SimulationExam[]>([]);
  const [simSectionsMap, setSimSectionsMap] = useState<Record<string, SimulationSection[]>>({});
  const [showSectionTrends, setShowSectionTrends] = useState(false);
  const [sectionFilter, setSectionFilter] =
    useState<AnalyticsSectionFilter>("all");

  useEffect(() => {
    async function load() {
      try {
        const [sess, resp, qSets, simExamsList] = await Promise.all([
          getAllSessions(),
          getAllResponses(),
          getQuestionSets(),
          getAllSimulationExams().catch(() => [] as SimulationExam[]),
        ]);
        setSessions(sess);
        setResponses(resp);
        setSets(qSets);
        setSimExams(simExamsList);

        // Load all questions for topic analysis
        const allQs: Question[] = [];
        for (const s of qSets) {
          const qs = await getQuestionsBySetId(s.id);
          allQs.push(...qs);
        }
        setAllQuestions(allQs);

        // Load sections for completed simulation exams
        const completedSims = simExamsList.filter((e) => e.status === "completed");
        const sectionsMap: Record<string, SimulationSection[]> = {};
        await Promise.all(
          completedSims.map(async (exam) => {
            try {
              const secs = await getSimulationSections(exam.id);
              sectionsMap[exam.id] = secs;
            } catch { /* best effort */ }
          })
        );
        setSimSectionsMap(sectionsMap);
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

  const completedSessionIds = useMemo(() => new Set(completed.map((s) => s.id)), [completed]);
  const analysisResponses = useMemo(
    () =>
      responses.filter(
        (r) => completedSessionIds.has(r.session_id) && r.is_correct !== null,
      ),
    [responses, completedSessionIds],
  );

  const filteredResponses = useMemo(
    () => {
      if (sectionFilter === "all") return analysisResponses;
      return analysisResponses.filter((r) => {
        const q = qMap.get(r.question_id);
        if (!q) return false;
        const sec = getSectionForQuestion(q);
        return sec === sectionFilter;
      });
    },
    [analysisResponses, qMap, sectionFilter],
  );

  const responsesBySession = useMemo(() => {
    const map = new Map<string, QuestionResponse[]>();
    filteredResponses.forEach((r) => {
      const arr = map.get(r.session_id) || [];
      arr.push(r);
      map.set(r.session_id, arr);
    });
    return map;
  }, [filteredResponses]);

  const filteredSessions = useMemo(
    () => {
      if (sectionFilter === "all") return completed;
      const ids = new Set(Array.from(responsesBySession.keys()));
      return completed.filter((s) => ids.has(s.id));
    },
    [completed, responsesBySession, sectionFilter],
  );

  // ─── Accuracy Over Time ──────────────────────────────────
  const accuracyOverTime = useMemo(
    () =>
      filteredSessions
        .slice()
        .sort(
          (a, b) =>
            new Date(a.started_at).getTime() - new Date(b.started_at).getTime(),
        )
        .map((s, i) => {
          const sResp = responsesBySession.get(s.id) || [];
          const total = sResp.length;
          const correct = sResp.filter((r) => r.is_correct).length;
          const accuracy = total
            ? Math.round((correct / total) * 100)
            : 0;
          return {
            session: i + 1,
            date: formatDate(s.started_at),
            label: formatDateTime(s.started_at),
            accuracy,
          };
        }),
    [filteredSessions, responsesBySession],
  );

  // ─── Avg Time Over Time ──────────────────────────────────
  const timeOverTime = useMemo(
    () =>
      filteredSessions
        .slice()
        .sort(
          (a, b) =>
            new Date(a.started_at).getTime() - new Date(b.started_at).getTime(),
        )
        .map((s, i) => {
          const sResp = responsesBySession.get(s.id) || [];
          const avg = sResp.length
            ? Math.round(
                sResp.reduce(
                  (sum, r) => sum + (r.time_spent_seconds || 0),
                  0,
                ) / sResp.length,
              )
            : 0;
          return {
            session: i + 1,
            date: formatDate(s.started_at),
            label: formatDateTime(s.started_at),
            avgTime: avg,
          };
        }),
    [filteredSessions, responsesBySession],
  );

  // ─── Accuracy by Question Type (Radar) ───────────────────
  const radarData = useMemo(() => {
    const typeStats: Record<string, { correct: number; total: number }> = {};
    filteredResponses.forEach((r) => {
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
  }, [filteredResponses, qMap]);

  // ─── Answer Change Analysis ──────────────────────────────
  const changeAnalysis = useMemo(() => {
    const changed = filteredResponses.filter(
      (r) => r.answer_changes && r.answer_changes.length > 0,
    );
    const helped = changed.filter((r) => r.is_correct).length;
    return {
      total: changed.length,
      helped,
      hurt: changed.length - helped,
      rate: filteredResponses.length
        ? Math.round((changed.length / filteredResponses.length) * 100)
        : 0,
    };
  }, [filteredResponses]);

  // ─── Flag Analysis ───────────────────────────────────────
  const flagAnalysis = useMemo(() => {
    const flagged = filteredResponses.filter((r) => r.flagged_for_review);
    const flaggedCorrect = flagged.filter((r) => r.is_correct).length;
    const unflagged = filteredResponses.filter((r) => !r.flagged_for_review);
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
  }, [filteredResponses]);

  // ─── Time vs Accuracy Scatter ────────────────────────────
  const scatterData = useMemo(
    () =>
      filteredResponses.map((r) => ({
        time: r.time_spent_seconds,
        correct: r.is_correct ? 1 : 0,
      })),
    [filteredResponses],
  );

  // ─── Simulation Score Data ────────────────────────────────
  const completedSimExams = useMemo(
    () => simExams.filter((e) => e.status === "completed" && e.total_score),
    [simExams]
  );

  const simScoreData = useMemo(() => {
    return completedSimExams
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
      .map((exam, i) => {
        const sections = simSectionsMap[exam.id] || [];
        const quantSec = sections.find((s) => s.section_type === "quant");
        const verbalSec = sections.find((s) => s.section_type === "verbal");
        const diSec = sections.find((s) => s.section_type === "di");
        return {
          exam: i + 1,
          date: formatDate(exam.created_at),
          total: exam.total_score || 0,
          quant: quantSec?.scaled_score,
          verbal: verbalSec?.scaled_score,
          di: diSec?.scaled_score,
          examId: exam.id,
          firstSessionId: sections.find((s) => s.section_order === 1)?.session_id,
        };
      });
  }, [completedSimExams, simSectionsMap]);

  // Set of session IDs that belong to simulation exams (for [SIM] badge)
  const simSessionIds = useMemo(() => {
    const ids = new Set<string>();
    Object.values(simSectionsMap).forEach((secs) => {
      secs.forEach((s) => { if (s.session_id) ids.add(s.session_id); });
    });
    return ids;
  }, [simSectionsMap]);

  // ─── Pattern Tracker ─────────────────────────────────────
  const patterns = useMemo(() => {
    const errorStats: Record<
      string,
      { sessions: Set<string>; count: number; lastSeen: string }
    > = {};

    filteredResponses.forEach((r) => {
      if (r.is_correct !== false || !r.error_category) return;
      const q = qMap.get(r.question_id);
      if (!q) return;
      const topic = q.topic || q.question_type;
      const key = `${topic}|${r.error_category}`;

      if (!errorStats[key]) {
        errorStats[key] = { sessions: new Set(), count: 0, lastSeen: "" };
      }
      errorStats[key].sessions.add(r.session_id);
      errorStats[key].count++;

      const session = sessions.find((s) => s.id === r.session_id);
      if (session) {
        if (
          !errorStats[key].lastSeen ||
          new Date(session.started_at) > new Date(errorStats[key].lastSeen)
        ) {
          errorStats[key].lastSeen = session.started_at;
        }
      }
    });

    const result: (ErrorPattern & { hasSimSession: boolean })[] = [];
    Object.entries(errorStats).forEach(([key, stats]) => {
      if (stats.sessions.size >= 2) {
        const [topic, category] = key.split("|");
        let status: "EMERGING" | "WATCH" | "CRITICAL" = "WATCH";
        if (stats.count >= 5) status = "CRITICAL";
        else if (stats.count >= 3) status = "EMERGING";
        const sessionArr = Array.from(stats.sessions);
        const hasSimSession = sessionArr.some((sid) => simSessionIds.has(sid));

        result.push({
          topic,
          category: category as ErrorCategory,
          count: stats.count,
          sessions: sessionArr,
          lastSeen: stats.lastSeen,
          status,
          hasSimSession,
        });
      }
    });

    return result.sort((a, b) => b.count - a.count);
  }, [filteredResponses, qMap, sessions, simSessionIds]);

  // ─── Weakness Areas ──────────────────────────────────────
  const weaknesses = useMemo(() => {
    const typeStats: Record<string, { correct: number; total: number }> = {};
    filteredResponses.forEach((r) => {
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
  }, [filteredResponses, qMap]);

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
    itemStyle: { color: "#e2e8f0" },
  };

  const SECTION_FILTER_OPTIONS: { id: AnalyticsSectionFilter; label: string }[] =
    [
      { id: "all", label: "All" },
      { id: "quant", label: "Quant" },
      { id: "verbal", label: "Verbal" },
      { id: "di", label: "DI" },
    ];

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
          {filteredSessions.length} sessions · {filteredResponses.length} responses analyzed
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">Section:</span>
          {SECTION_FILTER_OPTIONS.map((opt) => (
            <Button
              key={opt.id}
              variant={sectionFilter === opt.id ? "default" : "outline"}
              size="sm"
              className={`h-7 px-3 text-xs ${
                sectionFilter === opt.id
                  ? "bg-slate-800 text-blue-400 border-blue-500/60 hover:bg-slate-700"
                  : "border-slate-700 text-slate-300 hover:bg-slate-800"
              }`}
              onClick={() => setSectionFilter(opt.id)}
            >
              {opt.label}
            </Button>
          ))}
        </div>
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
          {/* ─── Simulated Scores ──────────────────────────── */}
          {completedSimExams.length > 0 && (
            <Card className="glass-card mb-8 animate-slide-up border-indigo-500/30">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-sm flex items-center gap-2 text-indigo-400">
                      🎯 Simulated Scores
                    </CardTitle>
                    <p className="text-xs text-muted-foreground mt-1">
                      {completedSimExams.length} exam{completedSimExams.length > 1 ? 's' : ''} · Target: 680
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs border-slate-600 text-slate-300 hover:bg-slate-800"
                    onClick={() => setShowSectionTrends((v) => !v)}
                  >
                    {showSectionTrends ? 'Hide' : 'Show'} Section Trends
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={simScoreData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis dataKey="date" tick={{ fill: "#94a3b8", fontSize: 11 }} />
                    <YAxis domain={[205, 805]} tick={{ fill: "#94a3b8", fontSize: 11 }} />
                    <Tooltip
                      contentStyle={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 8 }}
                      labelStyle={{ color: "#94a3b8" }}
                      itemStyle={{ color: "#e2e8f0" }}
                      formatter={(v, name) => {
                        if (name === "total") return [`${v}`, "Total Score"];
                        if (name === "quant") return [`${v}`, "Quant (60-90)"];
                        if (name === "verbal") return [`${v}`, "Verbal (60-90)"];
                        if (name === "di") return [`${v}`, "DI (60-90)"];
                        return [`${v}`, String(name)];
                      }}
                    />
                    <ReferenceLine y={680} stroke="#F59E0B" strokeDasharray="6 3" label={{ value: "Target 680", fill: "#F59E0B", fontSize: 11 }} />
                    <Line type="monotone" dataKey="total" stroke="#6366F1" strokeWidth={2.5} dot={{ fill: "#6366F1", r: 5 }} activeDot={{ r: 7 }} name="total" />
                    {showSectionTrends && (
                      <>
                        <Line type="monotone" dataKey="quant" stroke="#3B82F6" strokeWidth={1.5} strokeDasharray="4 2" dot={{ fill: "#3B82F6", r: 3 }} name="quant" />
                        <Line type="monotone" dataKey="verbal" stroke="#8B5CF6" strokeWidth={1.5} strokeDasharray="4 2" dot={{ fill: "#8B5CF6", r: 3 }} name="verbal" />
                        <Line type="monotone" dataKey="di" stroke="#10B981" strokeWidth={1.5} strokeDasharray="4 2" dot={{ fill: "#10B981", r: 3 }} name="di" />
                        <Legend wrapperStyle={{ fontSize: 11, color: "#94a3b8" }} />
                      </>
                    )}
                  </LineChart>
                </ResponsiveContainer>

                {/* Simulation history table */}
                <div className="mt-6">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-slate-700">
                        <TableHead className="text-xs">Date</TableHead>
                        <TableHead className="text-xs">Total</TableHead>
                        <TableHead className="text-xs">Quant</TableHead>
                        <TableHead className="text-xs">Verbal</TableHead>
                        <TableHead className="text-xs">DI</TableHead>
                        <TableHead className="text-xs">Status</TableHead>
                        <TableHead />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {simScoreData.map((row) => (
                        <TableRow key={row.examId} className="border-slate-800">
                          <TableCell className="text-muted-foreground text-xs">{row.date}</TableCell>
                          <TableCell>
                            <span className={`font-bold text-sm ${
                              row.total >= 680 ? 'text-emerald-400' :
                              row.total >= 650 ? 'text-amber-400' :
                              'text-red-400'
                            }`}>
                              {row.total}
                            </span>
                          </TableCell>
                          <TableCell className="text-xs text-slate-300">{row.quant ?? '—'}</TableCell>
                          <TableCell className="text-xs text-slate-300">{row.verbal ?? '—'}</TableCell>
                          <TableCell className="text-xs text-slate-300">{row.di ?? '—'}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-xs border-indigo-500/30 text-indigo-400">SIM</Badge>
                          </TableCell>
                          <TableCell>
                            {row.firstSessionId && (
                              <Button variant="ghost" size="sm" className="text-xs text-blue-400"
                                onClick={() => router.push(`/results/${row.firstSessionId}`)}>
                                Review →
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}

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
                      dataKey="session"
                      tick={{ fill: "#94a3b8", fontSize: 11 }}
                      tickFormatter={(v) => `S${v}`}
                    />
                    <YAxis
                      domain={[0, 100]}
                      tick={{ fill: "#94a3b8", fontSize: 11 }}
                    />
                    <Tooltip
                      {...tooltipStyle}
                      labelFormatter={(_, payload) => payload?.[0]?.payload?.label ?? ""}
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
                      dataKey="session"
                      tick={{ fill: "#94a3b8", fontSize: 11 }}
                      tickFormatter={(v) => `S${v}`}
                    />
                    <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} />
                    <Tooltip
                      {...tooltipStyle}
                      labelFormatter={(_, payload) => payload?.[0]?.payload?.label ?? ""}
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

          {/* ─── Pattern Tracker ───────────────────────────────────── */}
          {patterns.length > 0 && (
            <Card className="glass-card mb-8 animate-slide-up border-amber-500/30">
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2 text-amber-500">
                  🔍 Detected Error Patterns
                </CardTitle>
                <p className="text-xs text-muted-foreground mt-1">
                  Repeated mistakes across multiple sessions
                </p>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {patterns.map((p, i) => (
                    <div
                      key={i}
                      className="glass rounded-lg p-4 flex items-center justify-between border-l-4 border-l-amber-500 bg-amber-950/10"
                    >
                      <div>
                        <div className="flex items-center gap-3 mb-1 flex-wrap">
                          <span className="font-semibold text-sm">
                            {p.topic}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            ×
                          </span>
                          <Badge
                            variant="outline"
                            className={`text-xs ${p.category === "Content" ? "text-red-400 border-red-500/30" : p.category === "Process" ? "text-yellow-400 border-yellow-500/30" : "text-blue-400 border-blue-500/30"}`}
                          >
                            {p.category} Error
                          </Badge>
                          {p.hasSimSession && (
                            <Badge variant="outline" className="text-xs border-indigo-500/30 text-indigo-400">
                              [SIM]
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Done {p.count} times across {p.sessions.length}{" "}
                          sessions. Last seen {formatDate(p.lastSeen)}.
                        </p>
                      </div>
                      <Badge
                        className={
                          p.status === "CRITICAL"
                            ? "bg-red-600"
                            : p.status === "EMERGING"
                              ? "bg-amber-600"
                              : "bg-blue-600"
                        }
                      >
                        {p.status}
                      </Badge>
                    </div>
                  ))}
                </div>
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
                  {filteredSessions.map((s) => {
                    const set = setMap.get(s.set_id);
                    const sResp = responsesBySession.get(s.id) || [];
                    const total = sResp.length;
                    const correct = sResp.filter((r) => r.is_correct).length;
                    const acc = total
                      ? Math.round((correct / total) * 100)
                      : 0;
                    const totalTime = sResp.reduce(
                      (sum, r) => sum + (r.time_spent_seconds || 0),
                      0,
                    );
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
                          {total > 0 ? `${correct}/${total}` : "—"}
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
                          {totalTime
                            ? formatTimeShort(totalTime)
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
