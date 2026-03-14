"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { ThemeToggle } from "@/components/theme-toggle";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  faArrowLeft,
  faArrowRight,
  faArrowsRotate,
  faBullseye,
  faChartLine,
  faCircleCheck,
  faFlag,
  faMagnifyingGlass,
  faTriangleExclamation,
} from "@fortawesome/free-solid-svg-icons";
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
  getResponsesLite,
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
import { FaIcon } from "@/components/ui/fa-icon";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Bar,
  BarChart,
  Cell,
  ReferenceLine,
  Legend,
} from "recharts";
type AnalyticsSectionFilter = "all" | SectionType;

const QUESTION_TYPE_TO_SECTION: Record<QuestionType, SectionType> = {
  "Data Sufficiency": "di",
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
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const gridColor = isDark ? "#1e293b" : "#e2e8f0";
  const tickColor = isDark ? "#94a3b8" : "#475569";
  const tooltipBg = isDark ? "#0f172a" : "#ffffff";
  const tooltipBorder = isDark ? "#1e293b" : "#e2e8f0";

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
          getResponsesLite(),
          getQuestionSets(),
          getAllSimulationExams().catch(() => [] as SimulationExam[]),
        ]);
        setSessions(sess);
        setResponses(resp);
        setSets(qSets);
        setSimExams(simExamsList);

        const completedSims = simExamsList.filter((e) => e.status === "completed");

        // Load questions (parallel) and sim sections (parallel) concurrently
        const [questionArrays, sectionsResults] = await Promise.all([
          Promise.all(qSets.map((s) => getQuestionsBySetId(s.id))),
          Promise.all(
            completedSims.map((exam) =>
              getSimulationSections(exam.id).catch(() => [] as SimulationSection[])
            )
          ),
        ]);

        setAllQuestions(questionArrays.flat());

        const sectionsMap: Record<string, SimulationSection[]> = {};
        completedSims.forEach((exam, i) => { sectionsMap[exam.id] = sectionsResults[i]; });
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
    return Object.entries(typeStats)
      .map(([type, data]) => ({
        topic: type,
        accuracy: data.total ? Math.round((data.correct / data.total) * 100) : 0,
        count: data.total,
      }))
      .sort((a, b) => a.accuracy - b.accuracy);
  }, [filteredResponses, qMap]);

  // ─── Answer Change Analysis ──────────────────────────────
  const changeAnalysis = useMemo(() => {
    const changed = filteredResponses.filter(
      (r) => r.answer_changes && r.answer_changes.length > 0,
    );
    const kept = filteredResponses.filter(
      (r) => !r.answer_changes || r.answer_changes.length === 0,
    );
    const helped = changed.filter((r) => r.is_correct).length;
    const keptCorrect = kept.filter((r) => r.is_correct).length;
    return {
      total: changed.length,
      helped,
      hurt: changed.length - helped,
      rate: filteredResponses.length
        ? Math.round((changed.length / filteredResponses.length) * 100)
        : 0,
      keptCount: kept.length,
      keptAccuracy: kept.length ? Math.round((keptCorrect / kept.length) * 100) : null,
      changedAccuracy: changed.length ? Math.round((helped / changed.length) * 100) : null,
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

  // ─── Time vs Accuracy Buckets ────────────────────────────
  const TIME_BUCKETS = [
    { label: "<30s", min: 0, max: 30 },
    { label: "30-60s", min: 30, max: 60 },
    { label: "60-90s", min: 60, max: 90 },
    { label: "1-2m", min: 90, max: 120 },
    { label: "2-3m", min: 120, max: 180 },
    { label: ">3m", min: 180, max: Infinity },
  ];

  const timeBucketData = useMemo(() => {
    return TIME_BUCKETS.map(({ label, min, max }) => {
      const inBucket = filteredResponses.filter(
        (r) => r.time_spent_seconds >= min && r.time_spent_seconds < max
      );
      const correct = inBucket.filter((r) => r.is_correct).length;
      const wrong = inBucket.length - correct;
      return { label, correct, wrong, total: inBucket.length };
    }).filter((b) => b.total > 0);
  }, [filteredResponses]);

  const avgTimeStats = useMemo(() => {
    const correctResps = filteredResponses.filter((r) => r.is_correct && r.time_spent_seconds > 0);
    const wrongResps = filteredResponses.filter((r) => !r.is_correct && r.time_spent_seconds > 0);
    const avgCorrect = correctResps.length
      ? Math.round(correctResps.reduce((s, r) => s + r.time_spent_seconds, 0) / correctResps.length)
      : null;
    const avgWrong = wrongResps.length
      ? Math.round(wrongResps.reduce((s, r) => s + r.time_spent_seconds, 0) / wrongResps.length)
      : null;
    return { avgCorrect, avgWrong };
  }, [filteredResponses]);

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
      background: tooltipBg,
      border: `1px solid ${tooltipBorder}`,
      borderRadius: 8,
    },
    labelStyle: { color: tickColor },
    itemStyle: { color: isDark ? "#e2e8f0" : "#0f172a" },
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
        <div className="flex items-center justify-between mb-4">
          <Button
            variant="ghost"
            onClick={() => router.push("/")}
            className="text-muted-foreground"
          >
            <FaIcon icon={faArrowLeft} className="mr-2 h-3.5 w-3.5" />
            Dashboard
          </Button>
          <ThemeToggle />
        </div>
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
              className={`h-7 px-3 text-xs ${sectionFilter === opt.id
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
            <div className="mb-4 flex justify-center">
              <FaIcon icon={faChartLine} className="h-10 w-10 text-slate-400" />
            </div>
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
                      <FaIcon icon={faBullseye} className="h-4 w-4" />
                      Simulated Scores
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
                    <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                    <XAxis dataKey="date" tick={{ fill: tickColor, fontSize: 11 }} />
                    <YAxis domain={[205, 805]} tick={{ fill: tickColor, fontSize: 11 }} />
                    <Tooltip
                      contentStyle={{ background: tooltipBg, border: `1px solid ${tooltipBorder}`, borderRadius: 8 }}
                      labelStyle={{ color: tickColor }}
                      itemStyle={{ color: isDark ? "#e2e8f0" : "#0f172a" }}
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
                        <Legend wrapperStyle={{ fontSize: 11, color: tickColor }} />
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
                            <span className={`font-bold text-sm ${row.total >= 680 ? 'text-emerald-400' :
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
                                Review <FaIcon icon={faArrowRight} className="ml-2 h-3 w-3" />
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
                    <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                    <XAxis
                      dataKey="session"
                      tick={{ fill: tickColor, fontSize: 11 }}
                      tickFormatter={(v) => `S${v}`}
                    />
                    <YAxis
                      domain={[0, 100]}
                      tick={{ fill: tickColor, fontSize: 11 }}
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
                    <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                    <XAxis
                      dataKey="session"
                      tick={{ fill: tickColor, fontSize: 11 }}
                      tickFormatter={(v) => `S${v}`}
                    />
                    <YAxis tick={{ fill: tickColor, fontSize: 11 }} />
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

          {/* ─── Bar Chart (Accuracy by Topic) + Behavioral ─── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            {/* Horizontal Bar Chart by Topic */}
            {radarData.length > 0 && (
              <Card className="glass-card animate-slide-up md:col-span-2">
                <CardHeader>
                  <CardTitle className="text-sm">Accuracy by Topic</CardTitle>
                </CardHeader>
                <CardContent>
                  <div style={{ overflowY: "auto", maxHeight: 480 }}>
                    <ResponsiveContainer width="100%" height={Math.max(300, radarData.length * 28)}>
                      <BarChart
                        data={radarData}
                        layout="vertical"
                        margin={{ top: 4, right: 48, left: 4, bottom: 4 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke={gridColor} horizontal={false} />
                        <XAxis type="number" domain={[0, 100]} tick={{ fill: tickColor, fontSize: 11 }} unit="%" />
                        <YAxis
                          type="category"
                          dataKey="topic"
                          width={200}
                          tick={{ fill: tickColor, fontSize: 11 }}
                        />
                        <Tooltip
                          formatter={(val, _name, item) =>
                            [`${val ?? 0}% (${(item.payload as { count?: number })?.count ?? 0} attempts)`, "Accuracy"]
                          }
                          contentStyle={{ background: tooltipBg, border: `1px solid ${tooltipBorder}`, borderRadius: 8 }}
                          labelStyle={{ color: tickColor }}
                          itemStyle={{ color: isDark ? "#e2e8f0" : "#0f172a" }}
                        />
                        <Bar dataKey="accuracy" radius={[0, 4, 4, 0]} maxBarSize={18}>
                          {radarData.map((entry, i) => (
                            <Cell
                              key={i}
                              fill={entry.accuracy >= 70 ? "#22c55e" : entry.accuracy >= 50 ? "#f59e0b" : "#ef4444"}
                            />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Behavioral Patterns */}
            <Card className="glass-card animate-slide-up md:col-span-2">
              <CardHeader>
                <CardTitle className="text-sm">Behavioral Patterns</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col sm:flex-row gap-0 divide-y sm:divide-y-0 sm:divide-x divide-border">

                  {/* ── Answer Changes ── */}
                  <div className="flex-1 space-y-4 py-2 sm:pr-6">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-semibold text-yellow-400 flex items-center gap-1.5">
                        <FaIcon icon={faArrowsRotate} className="h-3.5 w-3.5" />
                        Answer Changes
                      </h4>
                      <span className="text-[10px] text-muted-foreground tabular-nums">
                        {changeAnalysis.total} lần · {changeAnalysis.rate}%
                      </span>
                    </div>

                    {changeAnalysis.total > 0 ? (
                      <>
                        {/* Compact stat row */}
                        <div className="flex items-center gap-2">
                          <div className="flex-1 text-center">
                            <p className="text-xl font-bold tabular-nums leading-none">{changeAnalysis.keptAccuracy ?? '–'}%</p>
                            <p className="text-[10px] text-muted-foreground mt-1">First answer</p>
                            <p className="text-[10px] text-slate-500">{changeAnalysis.keptCount}Q</p>
                          </div>
                          <div className="flex flex-col items-center gap-0.5 shrink-0 px-1">
                            <FaIcon icon={faArrowRight} className="h-3 w-3 text-slate-500" />
                            {changeAnalysis.changedAccuracy !== null && changeAnalysis.keptAccuracy !== null && (
                              <span className={`text-[9px] font-bold ${changeAnalysis.changedAccuracy >= changeAnalysis.keptAccuracy ? 'text-green-400' : 'text-red-400'}`}>
                                {changeAnalysis.changedAccuracy >= changeAnalysis.keptAccuracy ? '+' : ''}{changeAnalysis.changedAccuracy - changeAnalysis.keptAccuracy}%
                              </span>
                            )}
                          </div>
                          <div className="flex-1 text-center">
                            <p className={`text-xl font-bold tabular-nums leading-none ${changeAnalysis.changedAccuracy !== null && changeAnalysis.keptAccuracy !== null ? (changeAnalysis.changedAccuracy >= changeAnalysis.keptAccuracy ? 'text-green-400' : 'text-red-400') : ''}`}>
                              {changeAnalysis.changedAccuracy ?? '–'}%
                            </p>
                            <p className="text-[10px] text-muted-foreground mt-1">After change</p>
                            <p className="text-[10px] text-slate-500">{changeAnalysis.total}Q</p>
                          </div>
                        </div>

                        {/* Helped / Hurt bar */}
                        <div className="space-y-1">
                          <div className="flex h-2 rounded-full overflow-hidden">
                            <div className="bg-green-500/80 transition-all" style={{ width: `${Math.round((changeAnalysis.helped / changeAnalysis.total) * 100)}%` }} />
                            <div className="bg-red-500/70 flex-1" />
                          </div>
                          <div className="flex justify-between text-[10px]">
                            <span className="text-green-400">{changeAnalysis.helped} helped</span>
                            <span className="text-red-400">{changeAnalysis.hurt} hurt</span>
                          </div>
                        </div>

                        {/* Verdict */}
                        {changeAnalysis.changedAccuracy !== null && changeAnalysis.keptAccuracy !== null && (
                          <div className={`text-[11px] flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg ${changeAnalysis.changedAccuracy > changeAnalysis.keptAccuracy ? 'bg-green-500/10 text-green-400' : changeAnalysis.changedAccuracy < changeAnalysis.keptAccuracy ? 'bg-amber-500/10 text-amber-400' : 'bg-slate-500/10 text-slate-400'}`}>
                            <FaIcon icon={changeAnalysis.changedAccuracy > changeAnalysis.keptAccuracy ? faCircleCheck : changeAnalysis.changedAccuracy < changeAnalysis.keptAccuracy ? faTriangleExclamation : faCircleCheck} className="h-3 w-3 shrink-0" />
                            {changeAnalysis.changedAccuracy > changeAnalysis.keptAccuracy ? 'Thay đáp án giúp bạn tốt hơn' : changeAnalysis.changedAccuracy < changeAnalysis.keptAccuracy ? 'Tin vào đáp án đầu tiên' : 'Kết quả tương đương'}
                          </div>
                        )}
                      </>
                    ) : (
                      <p className="text-xs text-muted-foreground py-2">Không có lần đổi đáp án nào</p>
                    )}
                  </div>

                  {/* ── Flag vs Accuracy ── */}
                  <div className="flex-1 space-y-4 py-2 sm:pl-6 pt-4 sm:pt-2">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-semibold text-blue-400 flex items-center gap-1.5">
                        <FaIcon icon={faFlag} className="h-3.5 w-3.5" />
                        Flag vs Accuracy
                      </h4>
                      <span className="text-[10px] text-muted-foreground tabular-nums">
                        {flagAnalysis.flaggedCount} flagged
                      </span>
                    </div>

                    {flagAnalysis.flaggedCount > 0 ? (
                      <>
                        {/* Bar comparison */}
                        <div className="space-y-3">
                          {[
                            { label: 'Flagged', count: `${flagAnalysis.flaggedCount}Q`, value: flagAnalysis.flaggedAccuracy, color: 'bg-blue-400/80', textColor: 'text-blue-300' },
                            { label: 'Not Flagged', count: null, value: flagAnalysis.unflaggedAccuracy, color: 'bg-slate-400/60', textColor: 'text-slate-300' },
                          ].map(({ label, count, value, color, textColor }) => (
                            <div key={label} className="space-y-1">
                              <div className="flex items-center justify-between text-[11px]">
                                <span className="text-muted-foreground">
                                  {label}{count && <span className="text-slate-500 ml-1">{count}</span>}
                                </span>
                                <span className={`font-semibold tabular-nums ${textColor}`}>{value}%</span>
                              </div>
                              <div className="h-2 rounded-full bg-slate-700/50 overflow-hidden">
                                <div className={`h-full rounded-full ${color} transition-all duration-500`} style={{ width: `${value}%` }} />
                              </div>
                            </div>
                          ))}
                        </div>

                        {/* Insight */}
                        <div className={`text-[11px] flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg ${flagAnalysis.flaggedAccuracy < flagAnalysis.unflaggedAccuracy ? 'bg-slate-500/10 text-slate-400' : 'bg-green-500/10 text-green-400'}`}>
                          <FaIcon icon={flagAnalysis.flaggedAccuracy < flagAnalysis.unflaggedAccuracy ? faMagnifyingGlass : faCircleCheck} className="h-3 w-3 shrink-0" />
                          {flagAnalysis.flaggedAccuracy < flagAnalysis.unflaggedAccuracy ? 'Câu flag là điểm yếu cần ôn thêm' : 'Flag giúp xử lý tốt hơn câu khó'}
                        </div>
                      </>
                    ) : (
                      <p className="text-xs text-muted-foreground py-2">Không có câu nào được flag</p>
                    )}
                  </div>

                </div>
              </CardContent>
            </Card>
          </div>

          {/* ─── Time vs Accuracy Buckets ──────────────────── */}
          {filteredResponses.length > 5 && (
            <Card className="glass-card mb-8 animate-slide-up">
              <CardHeader>
                <CardTitle className="text-sm">Time Spent vs Accuracy</CardTitle>
              </CardHeader>
              <CardContent>
                {/* Summary stats */}
                <div className="flex gap-3 mb-4 flex-wrap">
                  {avgTimeStats.avgCorrect !== null && (
                    <span className="inline-flex items-center gap-1.5 text-xs px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      <span className="w-2 h-2 rounded-full bg-emerald-500" />
                      Avg time correct: {avgTimeStats.avgCorrect}s
                    </span>
                  )}
                  {avgTimeStats.avgWrong !== null && (
                    <span className="inline-flex items-center gap-1.5 text-xs px-3 py-1 rounded-full bg-red-500/10 text-red-400 border border-red-500/20">
                      <span className="w-2 h-2 rounded-full bg-red-500" />
                      Avg time wrong: {avgTimeStats.avgWrong}s
                    </span>
                  )}
                  {avgTimeStats.avgCorrect !== null && avgTimeStats.avgWrong !== null && (
                    <span className="text-xs text-muted-foreground self-center">
                      {avgTimeStats.avgCorrect < avgTimeStats.avgWrong
                        ? "You answer correctly faster than incorrectly"
                        : "You spend more time on questions you get right"}
                    </span>
                  )}
                </div>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={timeBucketData} barSize={32}>
                    <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                    <XAxis dataKey="label" tick={{ fill: tickColor, fontSize: 11 }} />
                    <YAxis tick={{ fill: tickColor, fontSize: 11 }} allowDecimals={false} />
                    <Tooltip
                      {...tooltipStyle}
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      formatter={(value: any, name: any) => [
                        value ?? 0,
                        name === "correct" ? "Correct" : "Wrong",
                      ]}
                    />
                    <Legend
                      wrapperStyle={{ fontSize: 11, color: tickColor }}
                      formatter={(v) => (v === "correct" ? "Correct" : "Wrong")}
                    />
                    <Bar dataKey="correct" stackId="a" fill="#10B981" name="correct" radius={[0, 0, 0, 0]} />
                    <Bar
                      dataKey="wrong"
                      stackId="a"
                      fill="#EF4444"
                      name="wrong"
                      radius={[3, 3, 0, 0]}
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      label={{
                        position: "top" as const, content: (props: any) => {
                          const { x, y, width, index } = props;
                          const d = timeBucketData[index ?? 0];
                          if (!d || d.total === 0) return null;
                          const pct = Math.round((d.correct / d.total) * 100);
                          return (
                            <text
                              x={Number(x ?? 0) + Number(width ?? 0) / 2}
                              y={Number(y ?? 0) - 4}
                              textAnchor="middle"
                              fontSize={10}
                              fill={tickColor}
                            >
                              {pct}%
                            </text>
                          );
                        }
                      }}
                    />
                  </BarChart>
                </ResponsiveContainer>
                <p className="text-xs text-muted-foreground mt-2 text-right">
                  % shown above each bar = accuracy rate for that time range
                </p>
              </CardContent>
            </Card>
          )}

          {/* ─── Pattern Tracker ───────────────────────────────────── */}
          {patterns.length > 0 && (
            <Card className="glass-card mb-8 animate-slide-up border-amber-500/30">
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2 text-amber-500">
                  <FaIcon icon={faMagnifyingGlass} className="h-4 w-4" />
                  Detected Error Patterns
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
                  <span className="inline-flex items-center gap-2">
                    <FaIcon icon={faTriangleExclamation} className="h-4 w-4 text-amber-400" />
                    Weakness Areas (Bottom 3)
                  </span>
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
                            View <FaIcon icon={faArrowRight} className="ml-2 h-3 w-3" />
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
