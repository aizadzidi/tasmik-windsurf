"use client";

import React from "react";
import Navbar from "@/components/Navbar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import { supabase } from "@/lib/supabaseClient";
import { useSearchParams } from "next/navigation";
import { Calendar, Check, ChevronDown, Edit2, GripVertical, List, Loader2, Plus, RefreshCw, Trash2, X } from "lucide-react";

type ClassItem = { id: string; name: string | null };
type SubjectItem = { id: string; name: string | null };
type SubtopicProgress = {
  id: string | null;
  subtopic_index: number;
  taught_on: string | null;
  remark: string | null;
};

type TopicWithProgress = {
  id: string;
  class_id: string;
  subject_id: string;
  title: string;
  description: string | null;
  subtopics: string[];
  objectives: string | null;
  order_index: number;
  subTopicProgress: SubtopicProgress[];
};

type EditorState = {
  id?: string;
  classId: string;
  subjectId: string;
  title: string;
  description: string;
  subtopics: string[];
  objectives: string;
  orderIndex: number;
};

const toDateInput = (date: string | null) => {
  if (!date) return "";
  const normalized = date.split("T")[0];
  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return normalized;
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString().slice(0, 10);
};

const todayLocal = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const baseCardClass = "rounded-2xl border border-gray-200 bg-white dark:border-slate-700 dark:bg-slate-900";
const summaryCardClass = `${baseCardClass} shadow-[0_18px_45px_rgba(15,23,42,0.06)] transition-shadow duration-150 hover:shadow-[0_20px_60px_rgba(15,23,42,0.09)]`;
const trackingCardClass = `${baseCardClass} shadow-[0_14px_35px_rgba(15,23,42,0.05)] transition-shadow duration-150`;
const selectorClass =
  "w-full h-10 rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm font-medium text-gray-900 transition duration-150 hover:bg-gray-100 focus:border-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-200 disabled:opacity-60";

type ProgressRingProps = {
  progress: number;
  neutral?: boolean;
};

const ProgressRing: React.FC<ProgressRingProps> = ({ progress, neutral = false }) => {
  const safe = Math.max(0, Math.min(progress, 100));
  const deg = (safe / 100) * 360;
  const track = "#d1d5db";
  const fill = "#3b82f6";
  const neutralBg = "conic-gradient(#e5e7eb 360deg, #e5e7eb 0deg)";
  const showFill = !neutral && safe > 0;

  return (
    <div
      className="relative h-5 w-5 rounded-full"
      style={{
        background: showFill ? `conic-gradient(${fill} ${deg}deg, ${track} 0deg)` : neutralBg,
      }}
    >
      <div className="absolute inset-[3px] rounded-full bg-white dark:bg-slate-900" />
      {showFill ? (
        <div className="absolute left-1/2 top-[1px] h-[3px] w-[3px] -translate-x-1/2 rounded-full bg-blue-500" />
      ) : null}
    </div>
  );
};

type TopicTrackingDensity = "default" | "compact";

function TeacherLessonPageContent() {
  const searchParams = useSearchParams();
  const densityParam = searchParams?.get("density");
  const density: TopicTrackingDensity = densityParam === "compact" ? "compact" : "default";
  const [userId, setUserId] = React.useState<string | null>(null);
  const [classes, setClasses] = React.useState<ClassItem[]>([]);
  const [subjects, setSubjects] = React.useState<SubjectItem[]>([]);
  const [activeTab, setActiveTab] = React.useState<"tracker" | "manage">("tracker");

  // Tracker selections
  const [trackerClassId, setTrackerClassId] = React.useState("");
  const [trackerSubjectId, setTrackerSubjectId] = React.useState("");
  const [trackerTopics, setTrackerTopics] = React.useState<TopicWithProgress[]>([]);
  const [openTopicIds, setOpenTopicIds] = React.useState<Set<string>>(new Set());

  // Management selections
  const [manageClassId, setManageClassId] = React.useState("");
  const [manageSubjectId, setManageSubjectId] = React.useState("");
  const [manageTopics, setManageTopics] = React.useState<TopicWithProgress[]>([]);
  const [draggingSubtopicIndex, setDraggingSubtopicIndex] = React.useState<number | null>(null);

  const [loadingMeta, setLoadingMeta] = React.useState(true);
  const [loadingTopics, setLoadingTopics] = React.useState(false);
  const [loadingManageTopics, setLoadingManageTopics] = React.useState(false);
  const [savingTopicId, setSavingTopicId] = React.useState<string | null>(null);
  const [inlineError, setInlineError] = React.useState<string | null>(null);
  const [actionMessage, setActionMessage] = React.useState<string | null>(null);

  const [editorOpen, setEditorOpen] = React.useState(false);
  const [editorMode, setEditorMode] = React.useState<"create" | "edit">("create");
  const [editorState, setEditorState] = React.useState<EditorState>({
    classId: "",
    subjectId: "",
    title: "",
    description: "",
    subtopics: [],
    objectives: "",
    orderIndex: 0,
  });
  const [savingEditor, setSavingEditor] = React.useState(false);

  const headerPadding = density === "compact" ? "px-3 py-2.5" : "px-4 py-3";
  const leafPadding = density === "compact" ? "px-3.5 py-2" : "px-4 py-[9px]";
  const pillPadding = density === "compact" ? "px-3 py-2" : "px-3.5 py-2.5";

  const { totalSubtopics, completedSubtopics } = React.useMemo(() => {
    let total = 0;
    let done = 0;

    for (const topic of trackerTopics) {
      const subs = topic.subtopics ?? [];
      const expected = subs.length > 0 ? subs.length : 1;
      total += expected;

      const map = new Map(topic.subTopicProgress.map((p) => [p.subtopic_index, p]));

      if (subs.length > 0) {
        for (let i = 0; i < subs.length; i++) {
          if (map.get(i)?.taught_on) done++;
        }
      } else {
        if (map.get(0)?.taught_on) done++;
      }
    }

    return { totalSubtopics: total, completedSubtopics: done };
  }, [trackerTopics]);

  const progressPercent = totalSubtopics
    ? Math.round((completedSubtopics / totalSubtopics) * 100)
    : 0;

  React.useEffect(() => {
    (async () => {
      const { data: authData } = await supabase.auth.getUser();
      if (authData?.user?.id) {
        setUserId(authData.user.id);
      } else {
        window.location.href = "/login";
      }
    })();
  }, []);

  const fetchMetadata = React.useCallback(async () => {
    setLoadingMeta(true);
    try {
      const [{ data: classData, error: classError }, { data: subjectData, error: subjectError }] =
        await Promise.all([
          supabase.from("classes").select("id, name").order("name"),
          supabase.from("subjects").select("id, name").order("name"),
        ]);
      if (classError) throw classError;
      if (subjectError) throw subjectError;

      const sortedClasses = (classData ?? []).map((cls) => ({ id: String(cls.id), name: cls.name })) ?? [];
      const sortedSubjects = (subjectData ?? []).map((subj) => ({ id: String(subj.id), name: subj.name })) ?? [];

      const defaultClass = sortedClasses[0]?.id || "";
      const defaultSubject = sortedSubjects[0]?.id || "";

      setClasses(sortedClasses);
      setSubjects(sortedSubjects);
      setTrackerClassId((current) => current || defaultClass);
      setTrackerSubjectId((current) => current || defaultSubject);
      setManageClassId((current) => current || defaultClass);
      setManageSubjectId((current) => current || defaultSubject);
      setEditorState((prev) => ({
        ...prev,
        classId: prev.classId || defaultClass,
        subjectId: prev.subjectId || defaultSubject,
      }));
    } catch (error) {
      console.error("Failed to load classes/subjects", error);
      setInlineError("Unable to load classes or subjects.");
      setClasses([]);
      setSubjects([]);
    } finally {
      setLoadingMeta(false);
    }
  }, []);

  type LessonTopicRow = {
    id: string;
    class_id: string;
    subject_id: string;
    title: string;
    description: string | null;
    sub_topics: string[] | null;
    objectives: string | null;
    order_index: number | null;
  };

  type LessonSubtopicProgressRow = {
    id: string;
    topic_id: string;
    subtopic_index: number;
    taught_on: string | null;
    remark: string | null;
    teacher_id: string | null;
  };

  const mapTopicsWithProgress = React.useCallback(
    (topicRows: LessonTopicRow[], subtopicProgressRows: LessonSubtopicProgressRow[]): TopicWithProgress[] => {
      const subtopicProgressMap = new Map<string, SubtopicProgress[]>();

      (subtopicProgressRows ?? []).forEach((row) => {
        const key = String(row.topic_id);
        const list = subtopicProgressMap.get(key) ?? [];
        list.push({
          id: row.id ? String(row.id) : null,
          subtopic_index: row.subtopic_index,
          taught_on: row.taught_on ?? null,
          remark: row.remark ?? null,
        });
        subtopicProgressMap.set(key, list);
      });

      return (topicRows ?? []).map((topic) => ({
        id: String(topic.id),
        class_id: String(topic.class_id),
        subject_id: String(topic.subject_id),
        title: topic.title,
        description: topic.description ?? null,
        subtopics: Array.isArray(topic.sub_topics) ? topic.sub_topics.filter(Boolean).map(String) : [],
        objectives: topic.objectives ?? null,
        order_index: topic.order_index ?? 0,
        subTopicProgress: subtopicProgressMap.get(String(topic.id)) ?? [],
      }));
    },
    []
  );

  const fetchTopics = React.useCallback(
    async (params: { classId: string; subjectId: string; target: "tracker" | "manage" }) => {
      const { classId, subjectId, target } = params;
      if (!classId || !subjectId) {
        if (target === "tracker") setTrackerTopics([]);
        else setManageTopics([]);
        return;
      }
      if (target === "tracker") {
        setLoadingTopics(true);
      } else {
        setLoadingManageTopics(true);
      }
      setInlineError(null);
      try {
        const { data: topicRows, error: topicError } = await supabase
          .from("lesson_topics")
          .select("id, class_id, subject_id, title, description, sub_topics, objectives, order_index")
          .eq("class_id", classId)
          .eq("subject_id", subjectId)
          .order("order_index", { ascending: true })
          .order("created_at", { ascending: true });
        if (topicError) throw topicError;

        const topicIds = (topicRows ?? []).map((t) => t.id as string);
        let subtopicProgressRows: LessonSubtopicProgressRow[] = [];
        if (topicIds.length > 0) {
          const { data: fetchedSubtopicProgress, error: subtopicProgressError } = await supabase
            .from("lesson_subtopic_progress")
            .select("id, topic_id, subtopic_index, taught_on, remark, teacher_id")
            .in("topic_id", topicIds);
          if (subtopicProgressError) {
            console.warn("Failed to fetch subtopic progress", subtopicProgressError);
          } else {
            subtopicProgressRows = fetchedSubtopicProgress ?? [];
          }
        }

        const mapped = mapTopicsWithProgress((topicRows ?? []) as LessonTopicRow[], subtopicProgressRows);
        if (target === "tracker") setTrackerTopics(mapped);
        else setManageTopics(mapped);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        console.error("Failed to load lesson topics", error);
        setInlineError(`Unable to load topics: ${message}`);
        if (target === "tracker") setTrackerTopics([]);
        else setManageTopics([]);
      } finally {
        if (target === "tracker") {
          setLoadingTopics(false);
        } else {
          setLoadingManageTopics(false);
        }
      }
    },
    [mapTopicsWithProgress]
  );

  React.useEffect(() => {
    fetchMetadata();
  }, [fetchMetadata]);

  React.useEffect(() => {
    fetchTopics({ classId: trackerClassId, subjectId: trackerSubjectId, target: "tracker" });
  }, [fetchTopics, trackerClassId, trackerSubjectId]);

  React.useEffect(() => {
    setOpenTopicIds(new Set(trackerTopics.map((topic) => topic.id)));
  }, [trackerTopics]);

  React.useEffect(() => {
    fetchTopics({ classId: manageClassId, subjectId: manageSubjectId, target: "manage" });
  }, [fetchTopics, manageClassId, manageSubjectId]);

  const reorderSubtopics = React.useCallback((from: number, to: number) => {
    setEditorState((prev) => {
      const list = [...(prev.subtopics.length ? prev.subtopics : [""])];
      if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return prev;
      const [item] = list.splice(from, 1);
      list.splice(to, 0, item);
      return { ...prev, subtopics: list };
    });
  }, []);

  const handleSubtopicToggle = async (topic: TopicWithProgress, subtopicIndex: number, checked: boolean) => {
    if (!userId) return;
    setSavingTopicId(topic.id);
    setActionMessage(null);
    try {
      if (checked) {
        const taughtOn = todayLocal();
        const existingRemark =
          topic.subTopicProgress.find((entry) => entry.subtopic_index === subtopicIndex)?.remark ?? null;
        const { data, error } = await supabase
          .from("lesson_subtopic_progress")
          .upsert(
            {
              topic_id: topic.id,
              subtopic_index: subtopicIndex,
              teacher_id: userId,
              taught_on: taughtOn,
              remark: existingRemark,
            },
            { onConflict: "topic_id,subtopic_index,teacher_id" }
          )
          .select("id, subtopic_index, taught_on, remark")
          .single();
        if (error) throw error;
        setTrackerTopics((prev) =>
          prev.map((row) =>
            row.id === topic.id
              ? {
                  ...row,
                  subTopicProgress: [
                    ...row.subTopicProgress.filter((s) => s.subtopic_index !== subtopicIndex),
                    {
                      id: data?.id ?? null,
                      subtopic_index: subtopicIndex,
                      taught_on: data?.taught_on ?? taughtOn,
                      remark: data?.remark ?? null,
                    },
                  ],
                }
              : row
          )
        );
      } else {
        const { error } = await supabase
          .from("lesson_subtopic_progress")
          .delete()
          .eq("topic_id", topic.id)
          .eq("subtopic_index", subtopicIndex);
        if (error) throw error;
        setTrackerTopics((prev) =>
          prev.map((row) =>
            row.id === topic.id
              ? { ...row, subTopicProgress: row.subTopicProgress.filter((s) => s.subtopic_index !== subtopicIndex) }
              : row
          )
        );
      }
    } catch (error) {
      console.error("Failed to update subtopic progress", error);
      setInlineError("Unable to update subtopic status right now.");
    } finally {
      setSavingTopicId(null);
    }
  };

  const handleSubtopicDateChange = async (topicId: string, subtopicIndex: number, value: string) => {
    if (!value || !userId) return;
    setSavingTopicId(topicId);
    setActionMessage(null);
    try {
      const existingTopic = trackerTopics.find((topic) => topic.id === topicId);
      const existingRemark =
        existingTopic?.subTopicProgress.find((entry) => entry.subtopic_index === subtopicIndex)?.remark ?? null;
      const { data, error } = await supabase
        .from("lesson_subtopic_progress")
        .upsert(
          {
            topic_id: topicId,
            subtopic_index: subtopicIndex,
            teacher_id: userId,
            taught_on: value,
            remark: existingRemark,
          },
          { onConflict: "topic_id,subtopic_index,teacher_id" }
        )
        .select("id, subtopic_index, taught_on, remark")
        .single();
      if (error) throw error;
      setTrackerTopics((prev) =>
        prev.map((row) =>
          row.id === topicId
            ? {
                ...row,
                subTopicProgress: [
                  ...row.subTopicProgress.filter((s) => s.subtopic_index !== subtopicIndex),
                  {
                    id: data?.id ?? null,
                    subtopic_index: subtopicIndex,
                    taught_on: data?.taught_on ?? value,
                    remark: data?.remark ?? null,
                  },
                ],
              }
            : row
        )
      );
    } catch (error) {
      console.error("Failed to save subtopic date", error);
      setInlineError("Could not save the subtopic taught date. Try again.");
    } finally {
      setSavingTopicId(null);
    }
  };

  const openEditor = (mode: "create" | "edit", topic?: TopicWithProgress) => {
    setEditorMode(mode);
    if (mode === "edit" && topic) {
      setEditorState({
        id: topic.id,
        classId: topic.class_id,
        subjectId: topic.subject_id,
        title: topic.title,
        description: topic.description ?? "",
        subtopics: topic.subtopics ?? [],
        objectives: topic.objectives ?? "",
        orderIndex: topic.order_index ?? 0,
      });
    } else {
      setEditorState({
        classId: manageClassId || trackerClassId,
        subjectId: manageSubjectId || trackerSubjectId,
        title: "",
        description: "",
        subtopics: [],
        objectives: "",
        orderIndex: 0,
      });
    }
    setEditorOpen(true);
    setActionMessage(null);
  };

  const handleEditorSubmit = async () => {
    if (!editorState.title.trim() || !editorState.classId || !editorState.subjectId) {
      setInlineError("Please fill in class, subject, and title.");
      return;
    }
    setSavingEditor(true);
    setInlineError(null);
    try {
      const subtopics = editorState.subtopics.map((item) => item.trim()).filter(Boolean);
      const payload = {
        class_id: editorState.classId,
        subject_id: editorState.subjectId,
        title: editorState.title.trim(),
        description: editorState.description.trim() || null,
        sub_topics: subtopics.length ? subtopics : null,
        objectives: editorState.objectives.trim() || null,
        order_index: Number(editorState.orderIndex) || 0,
        created_by: userId,
      };
      if (editorMode === "edit" && editorState.id) {
        const { error } = await supabase.from("lesson_topics").update(payload).eq("id", editorState.id);
        if (error) throw error;
        setActionMessage("Topic updated.");
      } else {
        const { error } = await supabase.from("lesson_topics").insert(payload);
        if (error) throw error;
        setActionMessage("Topic added.");
      }
      setEditorOpen(false);
      fetchTopics({ classId: manageClassId, subjectId: manageSubjectId, target: "manage" });
      if (manageClassId === trackerClassId && manageSubjectId === trackerSubjectId) {
        fetchTopics({ classId: trackerClassId, subjectId: trackerSubjectId, target: "tracker" });
      }
    } catch (error) {
      console.error("Failed to save topic", error);
      setInlineError("Unable to save topic. Check for duplicates or try again.");
    } finally {
      setSavingEditor(false);
    }
  };

  const handleDeleteTopic = async (topicId: string) => {
    if (!topicId) return;
    const confirmed = window.confirm("Delete this topic? This removes its taught status too.");
    if (!confirmed) return;
    setSavingTopicId(topicId);
    setInlineError(null);
    try {
      const { error } = await supabase.from("lesson_topics").delete().eq("id", topicId);
      if (error) throw error;
      fetchTopics({ classId: manageClassId, subjectId: manageSubjectId, target: "manage" });
      if (manageClassId === trackerClassId && manageSubjectId === trackerSubjectId) {
        fetchTopics({ classId: trackerClassId, subjectId: trackerSubjectId, target: "tracker" });
      }
      setActionMessage("Topic deleted.");
    } catch (error) {
      console.error("Failed to delete topic", error);
      setInlineError("Unable to delete topic right now.");
    } finally {
      setSavingTopicId(null);
    }
  };

  const trackerClassName = classes.find((cls) => cls.id === trackerClassId)?.name || "Class";
  const trackerSubjectName = subjects.find((subject) => subject.id === trackerSubjectId)?.name || "Subject";
  const manageClassName = classes.find((cls) => cls.id === manageClassId)?.name || "Class";
  const manageSubjectName = subjects.find((subject) => subject.id === manageSubjectId)?.name || "Subject";

  const toggleTopicOpen = (topicId: string) => {
    setOpenTopicIds((prev) => {
      const next = new Set(prev);
      if (next.has(topicId)) {
        next.delete(topicId);
      } else {
        next.add(topicId);
      }
      return next;
    });
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <main className="mx-auto max-w-4xl px-4 pb-16 pt-16 md:px-0 md:pt-20">
        <header>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-400">Lessons</p>
          <h1 className="mt-2 text-4xl font-semibold leading-[1.05] tracking-tight text-gray-900 md:text-[40px]">
            Track and curate topics with precision.
          </h1>
          <p className="mt-2 max-w-xl text-sm text-gray-500 md:text-base">
            Minimal, focused controls to log coverage and manage topic lists. Dates auto-fill to today and remain editable.
          </p>
        </header>

        <Tabs
          value={activeTab}
          onValueChange={(value) => setActiveTab(value as "tracker" | "manage")}
          className="mt-8"
        >
          <TabsList className="flex h-12 w-full items-end gap-8 border-b border-gray-200 bg-transparent px-0">
            <TabsTrigger
              value="tracker"
              className="relative rounded-none border-b-2 border-transparent px-0 pb-3 text-sm font-medium text-gray-500 transition-colors data-[state=active]:border-gray-900 data-[state=active]:bg-transparent data-[state=active]:font-semibold data-[state=active]:shadow-none data-[state=active]:text-gray-900"
            >
              Topic Tracker
            </TabsTrigger>
            <TabsTrigger
              value="manage"
              className="relative rounded-none border-b-2 border-transparent px-0 pb-3 text-sm font-medium text-gray-500 transition-colors data-[state=active]:border-gray-900 data-[state=active]:bg-transparent data-[state=active]:font-semibold data-[state=active]:shadow-none data-[state=active]:text-gray-900"
            >
              Topic Management
            </TabsTrigger>
          </TabsList>

          {inlineError && (
            <div className="mt-4 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
              {inlineError}
            </div>
          )}
          {actionMessage && (
            <div className="mt-4 rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              {actionMessage}
            </div>
          )}

          <TabsContent value="tracker" className="mt-6 space-y-5">
            <Card className={`${summaryCardClass} mt-1.5 space-y-6 p-8`}>
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div className="grid w-full grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="flex flex-col gap-1.5">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-400">Class</span>
                    <div className="mt-1">
                      <select
                        value={trackerClassId}
                        onChange={(e) => setTrackerClassId(e.target.value)}
                        className={selectorClass}
                        disabled={loadingMeta}
                      >
                        {classes.map((cls) => (
                          <option key={cls.id} value={cls.id}>
                            {cls.name ?? "Unnamed class"}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-400">Subject</span>
                    <div className="mt-1">
                      <select
                        value={trackerSubjectId}
                        onChange={(e) => setTrackerSubjectId(e.target.value)}
                        className={selectorClass}
                        disabled={loadingMeta}
                      >
                        {subjects.map((subject) => (
                          <option key={subject.id} value={subject.id}>
                            {subject.name ?? "Unnamed subject"}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium text-gray-500 transition-colors duration-150 hover:bg-gray-100 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 disabled:opacity-60"
                  onClick={() => fetchTopics({ classId: trackerClassId, subjectId: trackerSubjectId, target: "tracker" })}
                  disabled={loadingTopics}
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${loadingTopics ? "animate-spin" : ""}`} />
                  Refresh
                </button>
              </div>

              <div className="border-t border-gray-100 pt-6">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">Teaching progress</p>
                    <p className="text-xl font-semibold text-gray-900">{progressPercent}%</p>
                  </div>
                  <p className="text-sm text-gray-700">
                    {completedSubtopics} / {totalSubtopics || 0} subtopics taught
                  </p>
                  <p className="text-sm text-gray-500">
                    {trackerClassName} · {trackerSubjectName}
                  </p>
                  <div className="mt-3 h-2.5 w-full rounded-full bg-gray-200">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-blue-500 to-indigo-500 transition-all duration-300"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                </div>
              </div>
            </Card>

            <Card className={`${trackingCardClass} p-8`}>
              <CardHeader className="mb-2 px-0">
                <div className="flex flex-col gap-1">
                  <CardTitle className="text-sm font-semibold text-gray-900 leading-tight dark:text-slate-50">
                    Topic Tracking
                  </CardTitle>
                  <p className="text-xs text-gray-500 dark:text-slate-400">
                    Tap the checkbox to mark taught; date fills automatically.
                  </p>
                </div>
              </CardHeader>
              <CardContent className="px-0">
                {loadingTopics ? (
                  <div className="flex items-center justify-center gap-3 rounded-xl bg-gray-50 px-4 py-8 text-sm text-gray-500 dark:bg-slate-800">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading topics…
                  </div>
                ) : trackerTopics.length === 0 ? (
                  <div className="flex flex-col items-center justify-center gap-3 rounded-xl bg-gray-50 px-4 py-10 text-center dark:bg-slate-800">
                    <div className="rounded-full bg-gray-100 p-3 text-gray-400 dark:bg-slate-700 dark:text-slate-300">
                      <List className="h-6 w-6" />
                    </div>
                    <div className="text-sm text-gray-600 dark:text-slate-300">No topics yet for this class and subject.</div>
                    <button
                      className="text-sm font-semibold text-gray-900 underline-offset-4 hover:underline dark:text-slate-100"
                      onClick={() => setActiveTab("manage")}
                    >
                      Add topics from the management tab.
                    </button>
                  </div>
                ) : (
                  <div className="mt-5 space-y-4">
                    {trackerTopics.map((topic) => {
                      const isSaving = savingTopicId === topic.id;
                      const subtopics = topic.subtopics ?? [];
                      const isLeafTopic = subtopics.length === 0;
                      const totalCount = isLeafTopic ? 1 : subtopics.length;
                      const completedCount = topic.subTopicProgress.filter((p) => Boolean(p.taught_on)).length;
                      const progress = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;
                      const isOpen = !isLeafTopic && openTopicIds.has(topic.id);
                      const hasSubtopics = subtopics.length > 0;
                      const bodyId = `topic-${topic.id}-body`;

                      if (isLeafTopic) {
                        const leafProgressEntry = topic.subTopicProgress.find((p) => p.subtopic_index === 0);
                        const leafTaughtDate = toDateInput(leafProgressEntry?.taught_on ?? null);
                        const leafComplete = Boolean(leafProgressEntry?.taught_on);

                        return (
                          <div key={topic.id} className="space-y-2">
                            <div
                              className={`flex items-center justify-between gap-3 rounded-xl border border-gray-100 bg-gray-50 ${leafPadding} ${
                                isSaving ? "opacity-70" : ""
                              } dark:border-slate-700/60 dark:bg-slate-800`}
                            >
                              <div className="flex items-center gap-3">
                                <input
                                  type="checkbox"
                                  className="h-4 w-4 rounded border-gray-300 text-blue-500 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 dark:border-slate-600 dark:bg-slate-900"
                                  checked={leafComplete}
                                  disabled={isSaving}
                                  onChange={(e) => handleSubtopicToggle(topic, 0, e.target.checked)}
                                />
                                <span className="text-sm font-medium text-gray-900 dark:text-slate-50">{topic.title}</span>
                              </div>
                              <div className="flex items-center">
                                {leafComplete ? (
                                  <div
                                    className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs transition-colors duration-150 ease-out focus-within:ring-2 focus-within:ring-blue-500 focus-within:ring-offset-1 ${
                                      leafTaughtDate
                                        ? "border-blue-100 bg-blue-50 text-blue-700 dark:border-blue-500/40 dark:bg-blue-500/10 dark:text-blue-100"
                                        : "border-gray-200 bg-white text-gray-700 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"
                                    }`}
                                  >
                                    <Calendar className="h-3.5 w-3.5 text-inherit" />
                                    <input
                                      type="date"
                                      value={leafTaughtDate}
                                      min="2020-01-01"
                                      max="2100-12-31"
                                      disabled={isSaving}
                                      onChange={(e) => handleSubtopicDateChange(topic.id, 0, e.target.value)}
                                      className="h-5 w-[118px] border-none bg-transparent p-0 text-[11px] text-current focus:outline-none focus:ring-0"
                                    />
                                  </div>
                                ) : (
                                  <button
                                    type="button"
                                    className="inline-flex items-center gap-1 rounded-full border border-dashed border-gray-300 bg-transparent px-3 py-1 text-xs text-gray-400 transition-colors duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 dark:border-slate-700 dark:text-slate-500"
                                    disabled
                                  >
                                    <Calendar className="h-3.5 w-3.5" />
                                    Set date
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      }

                      return (
                        <div key={topic.id} className="space-y-3">
                          <button
                            type="button"
                            className={`flex w-full items-center justify-between rounded-2xl bg-gray-50 ${headerPadding} cursor-pointer transition-colors duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 hover:bg-gray-100 dark:bg-slate-800 dark:hover:bg-slate-700 ${
                              isSaving ? "opacity-70" : ""
                            }`}
                            onClick={() => toggleTopicOpen(topic.id)}
                            aria-expanded={isOpen}
                            aria-controls={bodyId}
                            data-open={isOpen ? "true" : "false"}
                          >
                            <div className="flex items-center gap-3 text-left">
                              <ProgressRing progress={progress} neutral={totalCount === 0} />
                              <div className="flex flex-col">
                                <span className="text-sm font-medium text-gray-900 dark:text-slate-50">{topic.title}</span>
                                {totalCount ? (
                                  <span className="text-[11px] text-gray-500 dark:text-slate-400">
                                    {totalCount} subtopic{totalCount > 1 ? "s" : ""}
                                  </span>
                                ) : null}
                              </div>
                            </div>

                            <div
                              className="flex items-center gap-2 text-xs font-medium text-gray-500 dark:text-slate-400"
                              data-open={isOpen ? "true" : "false"}
                            >
                              <span>
                                {completedCount}/{totalCount || 0}
                              </span>
                              <ChevronDown
                                className="h-4 w-4 text-gray-400 transition-transform duration-150 data-[open=true]:rotate-180 dark:text-slate-500"
                                data-open={isOpen ? "true" : "false"}
                              />
                            </div>
                          </button>

                          {hasSubtopics ? (
                            <>
                              {isOpen ? <div className="mt-2 h-px bg-gray-100 dark:bg-slate-700/60" /> : null}
                              <div
                                id={bodyId}
                                className={`overflow-hidden transition-[max-height,opacity] duration-200 ease-out ${
                                  isOpen ? "max-h-[800px] opacity-100" : "max-h-0 opacity-0"
                                }`}
                                aria-hidden={!isOpen}
                                data-open={isOpen ? "true" : "false"}
                              >
                                <div className="mt-2 pl-8">
                                  <div className="space-y-2 border-l border-gray-100 pl-4 dark:border-slate-700/60">
                                    {subtopics.map((sub, index) => {
                                      const progressEntry = topic.subTopicProgress.find((p) => p.subtopic_index === index);
                                      const taughtDate = toDateInput(progressEntry?.taught_on ?? null);
                                      const subComplete = Boolean(progressEntry?.taught_on);
                                      return (
                                        <div
                                          key={`${topic.id}-sub-${index}`}
                                          className={`flex items-center justify-between gap-3 rounded-xl border text-sm transition-colors duration-150 ease-out ${pillPadding} ${
                                            subComplete
                                              ? "border-blue-100 bg-blue-50/70 dark:border-blue-500/30 dark:bg-blue-500/10"
                                              : "border-gray-100 bg-gray-50 hover:bg-gray-50/80 dark:border-slate-700/60 dark:bg-slate-800 dark:hover:bg-slate-700"
                                          } ${isSaving ? "opacity-70" : ""}`}
                                        >
                                          <div className="flex items-center gap-3">
                                            <input
                                              type="checkbox"
                                              className="h-4 w-4 rounded border-gray-300 text-blue-500 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 dark:border-slate-600 dark:bg-slate-900"
                                              checked={subComplete}
                                              disabled={isSaving}
                                              onChange={(e) => handleSubtopicToggle(topic, index, e.target.checked)}
                                            />
                                            <span
                                              className={`font-medium ${
                                                subComplete ? "text-gray-800 dark:text-slate-200" : "text-gray-900 dark:text-slate-50"
                                              }`}
                                            >
                                              {sub}
                                            </span>
                                          </div>
                                          <div className="flex items-center">
                                            {subComplete ? (
                                              <div
                                                className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs transition-colors duration-150 ease-out focus-within:ring-2 focus-within:ring-blue-500 focus-within:ring-offset-1 ${
                                                  taughtDate
                                                    ? "border-blue-100 bg-blue-50 text-blue-700 dark:border-blue-500/40 dark:bg-blue-500/10 dark:text-blue-100"
                                                    : "border-gray-200 bg-white text-gray-700 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"
                                                }`}
                                              >
                                                <Calendar className="h-3.5 w-3.5 text-inherit" />
                                                <input
                                                  type="date"
                                                  value={taughtDate}
                                                  min="2020-01-01"
                                                  max="2100-12-31"
                                                  disabled={isSaving}
                                                  onChange={(e) => handleSubtopicDateChange(topic.id, index, e.target.value)}
                                                  className="h-5 w-[118px] border-none bg-transparent p-0 text-[11px] text-current focus:outline-none focus:ring-0"
                                                />
                                              </div>
                                            ) : (
                                              <button
                                                type="button"
                                                className="inline-flex items-center gap-1 rounded-full border border-dashed border-gray-300 bg-transparent px-3 py-1 text-xs text-gray-400 transition-colors duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 dark:border-slate-700 dark:text-slate-500"
                                                disabled
                                              >
                                                <Calendar className="h-3.5 w-3.5" />
                                                Set date
                                              </button>
                                            )}
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              </div>
                            </>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="manage" className="mt-6 space-y-6">
            <Card className={`${summaryCardClass} p-8`}>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-400">Target Class</span>
                  <div className="mt-1">
                    <select
                      value={manageClassId}
                      onChange={(e) => setManageClassId(e.target.value)}
                      className={selectorClass}
                      disabled={loadingMeta}
                    >
                      {classes.map((cls) => (
                        <option key={cls.id} value={cls.id}>
                          {cls.name ?? "Unnamed class"}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="flex flex-col gap-1.5">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-400">Target Subject</span>
                  <div className="mt-1">
                    <select
                      value={manageSubjectId}
                      onChange={(e) => setManageSubjectId(e.target.value)}
                      className={selectorClass}
                      disabled={loadingMeta}
                    >
                      {subjects.map((subject) => (
                        <option key={subject.id} value={subject.id}>
                          {subject.name ?? "Unnamed subject"}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
              <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-gray-900">
                    {manageClassName} · {manageSubjectName}
                  </p>
                  <p className="text-xs text-gray-500">Configure topics for any class/subject.</p>
                </div>
                <Button
                  className="inline-flex items-center gap-2 rounded-full bg-gray-900 px-4 py-2 text-sm font-semibold text-white shadow-[0_1px_3px_rgba(15,23,42,0.2)] transition hover:bg-black"
                  onClick={() => openEditor("create")}
                >
                  <Plus className="h-4 w-4" />
                  Add New Topic
                </Button>
              </div>
            </Card>

            <Card className={`${summaryCardClass} p-8`}>
              <CardHeader className="mb-2 px-0">
                <CardTitle className="text-sm font-semibold text-gray-900">Topic List</CardTitle>
                <p className="mt-1 text-xs text-gray-500">Edit titles or remove topics with subtle controls.</p>
              </CardHeader>
              <CardContent className="px-0">
                {loadingManageTopics ? (
                  <div className="flex items-center justify-center gap-3 rounded-xl bg-gray-50 px-4 py-8 text-sm text-gray-500">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading topics…
                  </div>
                ) : manageTopics.length === 0 ? (
                  <div className="rounded-xl bg-gray-50 px-4 py-8 text-center text-sm text-gray-600">
                    No topics for this class and subject yet.
                  </div>
                ) : (
                  <div className="divide-y divide-gray-100">
                    {manageTopics.map((topic) => (
                      <div key={topic.id} className="flex items-center justify-between gap-3 px-2 py-3">
                        <div>
                          <div className="text-sm font-semibold text-gray-900">{topic.title}</div>
                          <div className="text-xs text-gray-500 line-clamp-2">{topic.description}</div>
                          {topic.subtopics?.length ? (
                            <div className="text-[11px] text-gray-500 line-clamp-2">
                              Subtopics: {topic.subtopics.join(", ")}
                            </div>
                          ) : null}
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            className="rounded-full p-2 text-gray-500 transition hover:bg-gray-100"
                            onClick={() => openEditor("edit", topic)}
                            aria-label="Edit topic"
                          >
                            <Edit2 className="h-4 w-4" />
                          </button>
                          <button
                            className="rounded-full p-2 text-red-500 transition hover:bg-red-50"
                            onClick={() => handleDeleteTopic(topic.id)}
                            aria-label="Delete topic"
                            disabled={savingTopicId === topic.id}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {editorOpen && (
              <Card className={`${summaryCardClass} p-8`}>
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-400">
                      {editorMode === "edit" ? "Edit Topic" : "Add Topic"}
                    </p>
                    <p className="text-lg font-semibold text-gray-900">
                      {editorMode === "edit" ? "Update topic details" : "Create a new topic"}
                    </p>
                  </div>
                  <button
                    className="rounded-full p-2 text-gray-500 transition hover:bg-gray-100"
                    onClick={() => setEditorOpen(false)}
                    aria-label="Close editor"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="flex flex-col gap-1.5">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-400">Class</span>
                    <select
                      value={editorState.classId}
                      onChange={(e) => setEditorState((prev) => ({ ...prev, classId: e.target.value }))}
                      className={selectorClass}
                    >
                      {classes.map((cls) => (
                        <option key={cls.id} value={cls.id}>
                          {cls.name ?? "Unnamed class"}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-400">Subject</span>
                    <select
                      value={editorState.subjectId}
                      onChange={(e) => setEditorState((prev) => ({ ...prev, subjectId: e.target.value }))}
                      className={selectorClass}
                    >
                      {subjects.map((subject) => (
                        <option key={subject.id} value={subject.id}>
                          {subject.name ?? "Unnamed subject"}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="flex flex-col gap-1.5">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-400">Title</span>
                    <Input
                      value={editorState.title}
                      onChange={(e) => setEditorState((prev) => ({ ...prev, title: e.target.value }))}
                      placeholder="e.g. Fractions introduction"
                      className="rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-900 focus:border-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-200"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-400">Order</span>
                    <Input
                      type="number"
                      value={editorState.orderIndex}
                      onChange={(e) =>
                        setEditorState((prev) => ({ ...prev, orderIndex: Number(e.target.value) }))
                      }
                      className="rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-900 focus:border-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-200"
                      min={0}
                    />
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-1 gap-4">
                  <div className="flex flex-col gap-1.5">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-400">Description</span>
                    <textarea
                      value={editorState.description}
                      onChange={(e) => setEditorState((prev) => ({ ...prev, description: e.target.value }))}
                      rows={3}
                      className="w-full resize-none rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 focus:border-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-200"
                      placeholder="Key context or notes."
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-400">
                      Subtopics (optional)
                    </span>
                    <div className="space-y-2">
                      {(editorState.subtopics.length ? editorState.subtopics : [""]).map((value, index) => (
                        <div
                          key={`subtopic-${index}`}
                          className="flex items-center gap-2"
                          onDragOver={(e) => {
                            if (draggingSubtopicIndex === null) return;
                            e.preventDefault();
                            if (draggingSubtopicIndex !== index) {
                              reorderSubtopics(draggingSubtopicIndex, index);
                              setDraggingSubtopicIndex(index);
                            }
                          }}
                          onDrop={() => setDraggingSubtopicIndex(null)}
                          onDragEnd={() => setDraggingSubtopicIndex(null)}
                        >
                          <button
                            type="button"
                            className="flex h-8 w-8 items-center justify-center text-gray-400 transition-transform duration-150 hover:text-gray-700 active:cursor-grabbing cursor-grab"
                            draggable
                            onDragStart={() => setDraggingSubtopicIndex(index)}
                            aria-label="Reorder subtopic"
                          >
                            <GripVertical className="h-4 w-4" />
                          </button>
                          <div
                            className={`flex flex-1 items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 transition duration-150 ${
                              draggingSubtopicIndex === index
                                ? "scale-[1.01] border-gray-300 shadow-[0_10px_30px_rgba(15,23,42,0.08)]"
                                : "hover:border-gray-300 hover:shadow-[0_4px_16px_rgba(15,23,42,0.06)]"
                            }`}
                          >
                            <Input
                              value={value}
                              onChange={(e) =>
                                setEditorState((prev) => {
                                  const next = [...(prev.subtopics.length ? prev.subtopics : [""])];
                                  next[index] = e.target.value;
                                  return { ...prev, subtopics: next };
                                })
                              }
                              placeholder="Subtopic"
                              className="flex-1 border-none bg-transparent px-0 text-sm text-gray-900 shadow-none focus:border-0 focus:outline-none focus:ring-0"
                            />
                            <button
                              type="button"
                              className="text-xs text-gray-500 transition hover:text-red-500"
                              onClick={() =>
                                setEditorState((prev) => {
                                  const next = [...(prev.subtopics.length ? prev.subtopics : [""])];
                                  next.splice(index, 1);
                                  return { ...prev, subtopics: next };
                                })
                              }
                              aria-label="Remove subtopic"
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="mt-2">
                      <button
                        type="button"
                        className="inline-flex items-center gap-2 rounded-full border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-700 transition hover:bg-gray-100"
                        onClick={() =>
                          setEditorState((prev) => ({
                            ...prev,
                            subtopics: [...(prev.subtopics.length ? prev.subtopics : [""]), ""],
                          }))
                        }
                      >
                        <span className="text-base leading-none">＋</span>
                        Add Subtopic
                      </button>
                    </div>
                    <p className="text-xs text-gray-500">Add as many subtopics as needed; leave empty if none.</p>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-400">Objectives</span>
                    <textarea
                      value={editorState.objectives}
                      onChange={(e) => setEditorState((prev) => ({ ...prev, objectives: e.target.value }))}
                      rows={3}
                      className="w-full resize-none rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 focus:border-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-200"
                      placeholder="Learning outcomes or milestones."
                    />
                  </div>
                </div>
                <div className="mt-5 flex items-center justify-end gap-3">
                  <Button
                    variant="ghost"
                    className="rounded-full px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-100"
                    onClick={() => setEditorOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    className="inline-flex items-center gap-2 rounded-full bg-gray-900 px-4 py-2 text-sm font-semibold text-white shadow-[0_1px_3px_rgba(15,23,42,0.2)] transition hover:bg-black"
                    onClick={handleEditorSubmit}
                    disabled={savingEditor}
                  >
                    {savingEditor ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                    Save
                  </Button>
                </div>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

export default function TeacherLessonPage() {
  return (
    <React.Suspense fallback={<div className="p-6 text-sm text-gray-500">Loading lesson page…</div>}>
      <TeacherLessonPageContent />
    </React.Suspense>
  );
}
