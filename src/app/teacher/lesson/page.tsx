"use client";

import React from "react";
import Navbar from "@/components/Navbar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { supabase } from "@/lib/supabaseClient";
import { Check, Edit2, List, Loader2, Plus, RefreshCw, Trash2, X } from "lucide-react";

type ClassItem = { id: string; name: string | null };
type SubjectItem = { id: string; name: string | null };
type TopicWithProgress = {
  id: string;
  class_id: string;
  subject_id: string;
  title: string;
  description: string | null;
  objectives: string | null;
  order_index: number;
  progressId: string | null;
  taughtOn: string | null;
};

type EditorState = {
  id?: string;
  classId: string;
  subjectId: string;
  title: string;
  description: string;
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

const baseCardClass = "rounded-3xl bg-white shadow-[0_1px_3px_rgba(0,0,0,0.08)]";
const selectorClass =
  "w-full rounded-2xl border border-transparent bg-white px-3 py-2 text-sm font-medium text-[#000000] shadow-[inset_0_1px_0_rgba(0,0,0,0.05)] focus:border-slate-300 focus:outline-none";

export default function TeacherLessonPage() {
  const [userId, setUserId] = React.useState<string | null>(null);
  const [classes, setClasses] = React.useState<ClassItem[]>([]);
  const [subjects, setSubjects] = React.useState<SubjectItem[]>([]);
  const [activeTab, setActiveTab] = React.useState<"tracker" | "manage">("tracker");

  // Tracker selections
  const [trackerClassId, setTrackerClassId] = React.useState("");
  const [trackerSubjectId, setTrackerSubjectId] = React.useState("");
  const [trackerTopics, setTrackerTopics] = React.useState<TopicWithProgress[]>([]);

  // Management selections
  const [manageClassId, setManageClassId] = React.useState("");
  const [manageSubjectId, setManageSubjectId] = React.useState("");
  const [manageTopics, setManageTopics] = React.useState<TopicWithProgress[]>([]);

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
    objectives: "",
    orderIndex: 0,
  });
  const [savingEditor, setSavingEditor] = React.useState(false);

  const trackerTaughtCount = React.useMemo(
    () => trackerTopics.filter((topic) => Boolean(topic.taughtOn)).length,
    [trackerTopics]
  );

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

  const mapTopicsWithProgress = (topicRows: any[], progressRows: any[]) => {
    const progressMap = new Map<string, { id: string; taught_on: string | null }>(
      (progressRows ?? []).map((row: any) => [String(row.topic_id), { id: String(row.id), taught_on: row.taught_on }])
    );

    return (topicRows ?? []).map((topic: any) => {
      const progressRow = progressMap.get(String(topic.id));
      return {
        id: String(topic.id),
        class_id: String(topic.class_id),
        subject_id: String(topic.subject_id),
        title: topic.title,
        description: topic.description ?? null,
        objectives: topic.objectives ?? null,
        order_index: topic.order_index ?? 0,
        progressId: progressRow?.id ?? null,
        taughtOn: progressRow?.taught_on ?? null,
      } as TopicWithProgress;
    });
  };

  const fetchTopics = React.useCallback(
    async (params: { classId: string; subjectId: string; target: "tracker" | "manage" }) => {
      const { classId, subjectId, target } = params;
      if (!classId || !subjectId) {
        if (target === "tracker") setTrackerTopics([]);
        else setManageTopics([]);
        return;
      }
      target === "tracker" ? setLoadingTopics(true) : setLoadingManageTopics(true);
      setInlineError(null);
      try {
        const { data: topicRows, error: topicError } = await supabase
          .from("lesson_topics")
          .select("id, class_id, subject_id, title, description, objectives, order_index")
          .eq("class_id", classId)
          .eq("subject_id", subjectId)
          .order("order_index", { ascending: true })
          .order("created_at", { ascending: true });
        if (topicError) throw topicError;

        const topicIds = (topicRows ?? []).map((t: any) => t.id);
        let progressRows: any[] = [];
        if (topicIds.length > 0) {
          const { data: fetchedProgress, error: progressError } = await supabase
            .from("lesson_progress")
            .select("id, topic_id, taught_on")
            .in("topic_id", topicIds);
          if (progressError) {
            console.warn("Failed to fetch lesson progress", progressError);
          } else {
            progressRows = fetchedProgress ?? [];
          }
        }

        const mapped = mapTopicsWithProgress(topicRows ?? [], progressRows);
        if (target === "tracker") setTrackerTopics(mapped);
        else setManageTopics(mapped);
      } catch (error: any) {
        console.error("Failed to load lesson topics", error);
        setInlineError(error?.message ? `Unable to load topics: ${error.message}` : "Unable to load topics.");
        if (target === "tracker") setTrackerTopics([]);
        else setManageTopics([]);
      } finally {
        target === "tracker" ? setLoadingTopics(false) : setLoadingManageTopics(false);
      }
    },
    []
  );

  React.useEffect(() => {
    fetchMetadata();
  }, [fetchMetadata]);

  React.useEffect(() => {
    fetchTopics({ classId: trackerClassId, subjectId: trackerSubjectId, target: "tracker" });
  }, [fetchTopics, trackerClassId, trackerSubjectId]);

  React.useEffect(() => {
    fetchTopics({ classId: manageClassId, subjectId: manageSubjectId, target: "manage" });
  }, [fetchTopics, manageClassId, manageSubjectId]);

  const handleToggleTaught = async (topic: TopicWithProgress, checked: boolean) => {
    if (!userId) return;
    setSavingTopicId(topic.id);
    setActionMessage(null);
    try {
      if (checked) {
        const taughtOn = topic.taughtOn ? toDateInput(topic.taughtOn) : todayLocal();
        const { data, error } = await supabase
          .from("lesson_progress")
          .upsert(
            { topic_id: topic.id, taught_on: taughtOn, teacher_id: userId },
            { onConflict: "topic_id" }
          )
          .select("id, taught_on")
          .single();
        if (error) throw error;
        setTrackerTopics((prev) =>
          prev.map((row) =>
            row.id === topic.id
              ? { ...row, progressId: data?.id ?? row.progressId, taughtOn: data?.taught_on ?? taughtOn }
              : row
          )
        );
      } else {
        const { error } = await supabase.from("lesson_progress").delete().eq("topic_id", topic.id);
        if (error) throw error;
        setTrackerTopics((prev) =>
          prev.map((row) => (row.id === topic.id ? { ...row, progressId: null, taughtOn: null } : row))
        );
      }
    } catch (error) {
      console.error("Failed to update progress", error);
      setInlineError("Unable to update taught status right now.");
    } finally {
      setSavingTopicId(null);
    }
  };

  const handleDateChange = async (topicId: string, value: string) => {
    if (!value || !userId) return;
    setSavingTopicId(topicId);
    setActionMessage(null);
    try {
      const { data, error } = await supabase
        .from("lesson_progress")
        .upsert(
          { topic_id: topicId, taught_on: value, teacher_id: userId },
          { onConflict: "topic_id" }
        )
        .select("id, taught_on")
        .single();
      if (error) throw error;
      setTrackerTopics((prev) =>
        prev.map((row) =>
          row.id === topicId
            ? { ...row, progressId: data?.id ?? row.progressId, taughtOn: data?.taught_on ?? value }
            : row
        )
      );
    } catch (error) {
      console.error("Failed to save date", error);
      setInlineError("Could not save the taught date. Try again.");
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
        objectives: topic.objectives ?? "",
        orderIndex: topic.order_index ?? 0,
      });
    } else {
      setEditorState({
        classId: manageClassId || trackerClassId,
        subjectId: manageSubjectId || trackerSubjectId,
        title: "",
        description: "",
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
      const payload = {
        class_id: editorState.classId,
        subject_id: editorState.subjectId,
        title: editorState.title.trim(),
        description: editorState.description.trim() || null,
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

  return (
    <div className="min-h-screen bg-white">
      <Navbar />
      <main className="mx-auto max-w-6xl px-6 pt-10 pb-16">
        <header className="mb-6">
          <p className="text-xs font-semibold tracking-[0.2em] text-[#4A4A4A]">Lessons</p>
          <h1 className="mt-2 text-[28px] font-semibold leading-tight tracking-tight text-[#000000]">
            Track and curate topics with precision
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-[#4A4A4A]">
            Minimal, focused controls to log coverage and manage topic lists. Dates auto-fill to today and remain editable.
          </p>
        </header>

        <div className="mb-7 flex gap-4 border-b border-slate-200 pb-2">
          {[
            { id: "tracker", label: "Topic Tracker" },
            { id: "manage", label: "Topic Management" },
          ].map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as "tracker" | "manage")}
                className={`relative pb-2 text-sm font-semibold transition-colors ${
                  isActive ? "text-[#007AFF]" : "text-[#4A4A4A] hover:text-[#000000]"
                }`}
              >
                {tab.label}
                {isActive && (
                  <span className="absolute inset-x-0 -bottom-[2px] h-0.5 rounded-full bg-[#007AFF]" />
                )}
              </button>
            );
          })}
        </div>

        {inlineError && (
          <div className="mb-4 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
            {inlineError}
          </div>
        )}
        {actionMessage && (
          <div className="mb-4 rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
            {actionMessage}
          </div>
        )}

        {activeTab === "tracker" && (
          <section className="space-y-6">
            <div className={`${baseCardClass} p-5`}>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-medium text-[#4A4A4A]">Class</label>
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
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-medium text-[#4A4A4A]">Subject</label>
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

              <div className="mt-8 rounded-3xl bg-white px-5 py-4 shadow-[0_1px_3px_rgba(0,0,0,0.08)]">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-medium text-[#4A4A4A]">Progress</p>
                    <p className="text-[24px] font-bold text-[#000000]">
                      {trackerTaughtCount} / {trackerTopics.length}
                    </p>
                    <p className="text-sm font-medium text-[#4A4A4A]">Topics Taught</p>
                    <p className="text-xs text-[#4A4A4A]">
                      {trackerClassName} · {trackerSubjectName}
                    </p>
                  </div>
                  <button
                    className="inline-flex items-center gap-2 text-sm font-semibold text-[#007AFF] hover:text-[#005fcc]"
                    onClick={() => fetchTopics({ classId: trackerClassId, subjectId: trackerSubjectId, target: "tracker" })}
                    disabled={loadingTopics}
                  >
                    <RefreshCw className={`h-4 w-4 ${loadingTopics ? "animate-spin" : ""}`} />
                    Refresh
                  </button>
                </div>
                <div className="mt-3 relative h-1.5 w-full rounded-full bg-slate-200">
                  <div
                    className="absolute left-0 top-0 h-full rounded-full bg-[#007AFF] transition-all"
                    style={{
                      width: trackerTopics.length
                        ? `${Math.min(100, Math.round((trackerTaughtCount / trackerTopics.length) * 100))}%`
                        : "0%",
                    }}
                  />
                </div>
              </div>
            </div>

            <Card className={`${baseCardClass} p-5`}>
              <CardHeader className="px-0 pb-3">
                <CardTitle className="text-[18px] font-semibold text-[#000000]">Topic Tracking</CardTitle>
                <p className="text-sm text-[#4A4A4A]">Tap the checkbox to mark taught; date fills automatically.</p>
              </CardHeader>
              <CardContent className="px-0">
                {loadingTopics ? (
                  <div className="flex items-center justify-center gap-3 rounded-2xl bg-[#F7F7F7] px-4 py-8 text-sm text-[#4A4A4A]">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading topics…
                  </div>
                ) : trackerTopics.length === 0 ? (
                  <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
                    <div className="rounded-full bg-slate-100 p-3 text-slate-400">
                      <List className="h-6 w-6" />
                    </div>
                    <div className="text-sm text-[#4A4A4A]">No topics yet for this class and subject.</div>
                    <button
                      className="text-sm font-semibold text-[#007AFF] hover:text-[#005fcc]"
                      onClick={() => setActiveTab("manage")}
                    >
                      No topics found. Click here to add new topics.
                    </button>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {trackerTopics.map((topic) => {
                      const isSaving = savingTopicId === topic.id;
                      const taughtDate = toDateInput(topic.taughtOn);
                      const rowComplete = Boolean(topic.taughtOn);
                      return (
                        <div
                          key={topic.id}
                          className={`flex flex-col gap-2 px-2 py-3 sm:flex-row sm:items-center sm:justify-between ${
                            rowComplete ? "bg-[#F8F8F8]" : "bg-white"
                          }`}
                        >
                          <div className="flex flex-1 items-start gap-3">
                            <input
                              type="checkbox"
                              className="mt-1 h-4 w-4 rounded border-slate-300 text-[#007AFF] focus:ring-[#007AFF]"
                              checked={rowComplete}
                              disabled={isSaving}
                              onChange={(e) => handleToggleTaught(topic, e.target.checked)}
                            />
                            <div className="flex-1">
                              <div className="text-[15px] font-semibold text-[#000000]">{topic.title}</div>
                              <div className="text-sm text-[#4A4A4A]">{topic.description}</div>
                            </div>
                          </div>
                          <div className="text-right text-xs text-[#4A4A4A]">
                            {rowComplete ? (
                              <Input
                                type="date"
                                value={taughtDate}
                                min="2020-01-01"
                                max="2100-12-31"
                                disabled={isSaving}
                                onChange={(e) => handleDateChange(topic.id, e.target.value)}
                                className="w-[140px] rounded-2xl border border-transparent bg-[#F7F7F7] px-3 py-2 text-sm text-[#000000] focus:border-slate-300 focus:outline-none"
                              />
                            ) : (
                              <span className="text-slate-400">Not taught</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </section>
        )}

        {activeTab === "manage" && (
          <section className="space-y-6">
            <div className={`${baseCardClass} p-5`}>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-semibold uppercase tracking-[0.2em] text-[#4A4A4A]">Target Class</label>
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
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-semibold uppercase tracking-[0.2em] text-[#4A4A4A]">Target Subject</label>
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
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-[15px] font-semibold text-[#000000]">
                    {manageClassName} · {manageSubjectName}
                  </p>
                  <p className="text-sm text-[#4A4A4A]">Configure topics for any class/subject.</p>
                </div>
                <Button
                  className="inline-flex items-center gap-2 rounded-full bg-[#007AFF] text-sm font-semibold text-white shadow-[0_1px_3px_rgba(0,0,0,0.12)] hover:bg-[#0066d6]"
                  onClick={() => openEditor("create")}
                >
                  <Plus className="h-4 w-4" />
                  Add New Topic
                </Button>
              </div>
            </div>

            <Card className={`${baseCardClass} p-5`}>
              <CardHeader className="px-0 pb-3">
                <CardTitle className="text-[18px] font-semibold text-[#000000]">Topic List</CardTitle>
                <p className="text-sm text-[#4A4A4A]">Edit titles or remove topics with subtle controls.</p>
              </CardHeader>
              <CardContent className="px-0">
                {loadingManageTopics ? (
                  <div className="flex items-center justify-center gap-3 rounded-2xl bg-[#F7F7F7] px-4 py-8 text-sm text-[#4A4A4A]">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading topics…
                  </div>
                ) : manageTopics.length === 0 ? (
                  <div className="rounded-2xl bg-[#F7F7F7] px-4 py-8 text-center text-sm text-[#4A4A4A]">
                    No topics for this class and subject yet.
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {manageTopics.map((topic) => (
                      <div key={topic.id} className="flex items-center justify-between gap-3 px-2 py-3">
                        <div>
                          <div className="text-[15px] font-semibold text-[#000000]">{topic.title}</div>
                          <div className="text-sm text-[#4A4A4A] line-clamp-2">{topic.description}</div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            className="rounded-full p-2 text-[#4A4A4A] transition hover:bg-slate-100"
                            onClick={() => openEditor("edit", topic)}
                            aria-label="Edit topic"
                          >
                            <Edit2 className="h-4 w-4" />
                          </button>
                          <button
                            className="rounded-full p-2 text-[#c81e1e] transition hover:bg-red-50"
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
              <div className={`${baseCardClass} p-5`}>
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#4A4A4A]">
                      {editorMode === "edit" ? "Edit Topic" : "Add Topic"}
                    </p>
                    <p className="text-[18px] font-semibold text-[#000000]">
                      {editorMode === "edit" ? "Update topic details" : "Create a new topic"}
                    </p>
                  </div>
                  <button
                    className="rounded-full p-2 text-[#4A4A4A] transition hover:bg-slate-100"
                    onClick={() => setEditorOpen(false)}
                    aria-label="Close editor"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-semibold uppercase tracking-[0.2em] text-[#4A4A4A]">Class</label>
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
                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-semibold uppercase tracking-[0.2em] text-[#4A4A4A]">Subject</label>
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
                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-semibold uppercase tracking-[0.2em] text-[#4A4A4A]">Title</label>
                    <Input
                      value={editorState.title}
                      onChange={(e) => setEditorState((prev) => ({ ...prev, title: e.target.value }))}
                      placeholder="e.g. Fractions introduction"
                      className="rounded-2xl border border-transparent bg-[#F7F7F7] text-sm text-[#000000] focus:border-slate-300 focus:outline-none"
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-semibold uppercase tracking-[0.2em] text-[#4A4A4A]">Order</label>
                    <Input
                      type="number"
                      value={editorState.orderIndex}
                      onChange={(e) =>
                        setEditorState((prev) => ({ ...prev, orderIndex: Number(e.target.value) }))
                      }
                      className="rounded-2xl border border-transparent bg-[#F7F7F7] text-sm text-[#000000] focus:border-slate-300 focus:outline-none"
                      min={0}
                    />
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-1 gap-4">
                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-semibold uppercase tracking-[0.2em] text-[#4A4A4A]">Description</label>
                    <textarea
                      value={editorState.description}
                      onChange={(e) => setEditorState((prev) => ({ ...prev, description: e.target.value }))}
                      rows={3}
                      className="w-full resize-none rounded-2xl border border-transparent bg-[#F7F7F7] px-3 py-2 text-sm text-[#000000] focus:border-slate-300 focus:outline-none"
                      placeholder="Key context or notes."
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-semibold uppercase tracking-[0.2em] text-[#4A4A4A]">Objectives</label>
                    <textarea
                      value={editorState.objectives}
                      onChange={(e) => setEditorState((prev) => ({ ...prev, objectives: e.target.value }))}
                      rows={3}
                      className="w-full resize-none rounded-2xl border border-transparent bg-[#F7F7F7] px-3 py-2 text-sm text-[#000000] focus:border-slate-300 focus:outline-none"
                      placeholder="Learning outcomes or milestones."
                    />
                  </div>
                </div>
                <div className="mt-5 flex items-center justify-end gap-3">
                  <Button
                    variant="ghost"
                    className="rounded-full px-4 py-2 text-sm font-semibold text-[#4A4A4A] hover:bg-slate-100"
                    onClick={() => setEditorOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    className="inline-flex items-center gap-2 rounded-full bg-[#007AFF] px-4 py-2 text-sm font-semibold text-white shadow-[0_1px_3px_rgba(0,0,0,0.12)] hover:bg-[#0066d6]"
                    onClick={handleEditorSubmit}
                    disabled={savingEditor}
                  >
                    {savingEditor ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                    Save
                  </Button>
                </div>
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
