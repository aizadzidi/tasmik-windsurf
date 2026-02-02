"use client";

import React from "react";
import Navbar from "@/components/Navbar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { supabase } from "@/lib/supabaseClient";
import { useSearchParams, useRouter } from "next/navigation";
import { useProgramScope } from "@/hooks/useProgramScope";
import type { ProgramScope } from "@/types/programs";
import {
  Calendar,
  Check,
  ChevronDown,
  ChevronsUpDown,
  Edit2,
  GripVertical,
  List,
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";

type ClassItem = { id: string; name: string | null };
type SubjectItem = { id: string; name: string | null };
type TeacherItem = { id: string; name: string | null; email: string | null };
type SubtopicProgress = {
  id: string | null;
  subtopic_index: number;
  taught_on: string | null;
  remark: string | null;
};

type TopicType = "new" | "revision";

type TopicWithProgress = {
  id: string;
  class_id: string;
  subject_id: string;
  title: string;
  subtopics: string[];
  order_index: number;
  topic_type: TopicType;
  subTopicProgress: SubtopicProgress[];
};

type EditorState = {
  id?: string;
  classId: string;
  subjectId: string;
  title: string;
  subtopics: string[];
  orderIndex: number;
  topicType: TopicType;
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

const displayDate = (value: string | null) => {
  if (!value) return "";
  const normalized = value.split("T")[0];
  if (normalized === todayLocal()) return "Today";
  const parts = normalized.split("-");
  if (parts.length !== 3) return normalized;
  const [yyyy, mm, dd] = parts;
  if (!yyyy || !mm || !dd) return normalized;
  return `${dd}/${mm}/${yyyy}`;
};

const baseCardClass = "rounded-2xl border border-gray-200 bg-white dark:border-slate-700 dark:bg-slate-900";
const summaryCardClass = `${baseCardClass} shadow-[0_18px_45px_rgba(15,23,42,0.06)] transition-shadow duration-150 hover:shadow-[0_20px_60px_rgba(15,23,42,0.09)]`;
const trackingCardClass = `${baseCardClass} shadow-[0_14px_35px_rgba(15,23,42,0.05)] transition-shadow duration-150`;
const selectorClass =
  "w-full h-10 rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm font-medium text-gray-900 transition duration-150 hover:bg-gray-100 focus:border-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-200 disabled:opacity-60";

const remarkPresets = [
  "Good engagement",
  "Needs revision",
  "Homework given",
  "Absent",
  "Excellent progress",
  "Needs more practice",
] as const;

const normalizePresetRemark = (remark: string) => {
  const trimmed = remark.trim();
  if (!trimmed) return trimmed;
  const match = remarkPresets.find((preset) => preset.toLowerCase() === trimmed.toLowerCase());
  return match ?? trimmed;
};

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

function TeacherLessonPageContent({ programScope }: { programScope: ProgramScope }) {
  const searchParams = useSearchParams();
  const densityParam = searchParams?.get("density");
  const density: TopicTrackingDensity = densityParam === "compact" ? "compact" : "default";
  const [userId, setUserId] = React.useState<string | null>(null);
  const [classes, setClasses] = React.useState<ClassItem[]>([]);
  const [subjects, setSubjects] = React.useState<SubjectItem[]>([]);
  const [activeTab, setActiveTab] = React.useState<"tracker" | "manage">("tracker");
  const [academicYear, setAcademicYear] = React.useState<number>(() => new Date().getFullYear());
  const [trackerMode, setTrackerMode] = React.useState<TopicType>("new");
  const [manageTopicFilter, setManageTopicFilter] = React.useState<"all" | TopicType>("all");
  const yearOptions = React.useMemo(() => {
    const now = new Date().getFullYear();
    const start = now - 2;
    const end = now + 3;
    return Array.from({ length: end - start + 1 }, (_, index) => start + index);
  }, []);

  // Tracker selections
  const [trackerClassId, setTrackerClassId] = React.useState("");
  const [trackerSubjectId, setTrackerSubjectId] = React.useState("");
  const [trackerTopics, setTrackerTopics] = React.useState<TopicWithProgress[]>([]);
  const [openTopicIds, setOpenTopicIds] = React.useState<Set<string>>(new Set());
  const [trackerTeacherName, setTrackerTeacherName] = React.useState("");
  const [trackerTeacherId, setTrackerTeacherId] = React.useState<string | null>(null);

  // Management selections
  const [manageClassId, setManageClassId] = React.useState("");
  const [manageSubjectId, setManageSubjectId] = React.useState("");
  const [manageTopics, setManageTopics] = React.useState<TopicWithProgress[]>([]);
  const [draggingSubtopicIndex, setDraggingSubtopicIndex] = React.useState<number | null>(null);
  const [manageTeacherName, setManageTeacherName] = React.useState("");
  const [manageTeacherId, setManageTeacherId] = React.useState<string | null>(null);

  const [loadingMeta, setLoadingMeta] = React.useState(true);
  const [loadingTopics, setLoadingTopics] = React.useState(false);
  const [loadingManageTopics, setLoadingManageTopics] = React.useState(false);
  const [savingTopicId, setSavingTopicId] = React.useState<string | null>(null);
  const [inlineError, setInlineError] = React.useState<string | null>(null);
  const [actionMessage, setActionMessage] = React.useState<string | null>(null);
  const [loadingTeacherName, setLoadingTeacherName] = React.useState(false);
  const [savingTeacherName, setSavingTeacherName] = React.useState(false);
  const [teachers, setTeachers] = React.useState<TeacherItem[]>([]);
  const [loadingTeachers, setLoadingTeachers] = React.useState(false);
  const [teacherComboboxOpen, setTeacherComboboxOpen] = React.useState(false);
  const [teacherComboboxQuery, setTeacherComboboxQuery] = React.useState("");

  const [expandedRemarkKeys, setExpandedRemarkKeys] = React.useState<Set<string>>(new Set());
  const [remarkDrafts, setRemarkDrafts] = React.useState<Record<string, string>>({});
  const [remarkErrors, setRemarkErrors] = React.useState<Record<string, string>>({});

  const [remarkModalTarget, setRemarkModalTarget] = React.useState<{
    topicId: string;
    subtopicIndex: number;
    topicTitle: string;
    subtopicTitle: string;
  } | null>(null);
  const [remarkModalText, setRemarkModalText] = React.useState("");
  const [remarkModalDate, setRemarkModalDate] = React.useState(todayLocal());
  const [remarkModalError, setRemarkModalError] = React.useState<string | null>(null);
  const [remarkModalSaving, setRemarkModalSaving] = React.useState(false);

  const [editorOpen, setEditorOpen] = React.useState(false);
  const [editorMode, setEditorMode] = React.useState<"create" | "edit">("create");
  const [editorState, setEditorState] = React.useState<EditorState>({
    classId: "",
    subjectId: "",
    title: "",
    subtopics: [],
    orderIndex: 0,
    topicType: "new",
  });
  const [savingEditor, setSavingEditor] = React.useState(false);

  const headerPadding = density === "compact" ? "px-3 py-2.5" : "px-4 py-3";
  const leafPadding = density === "compact" ? "px-3.5 py-2" : "px-4 py-[9px]";
  const pillPadding = density === "compact" ? "px-3 py-2" : "px-3.5 py-2.5";

  const filteredTrackerTopics = React.useMemo(
    () => trackerTopics.filter((topic) => (topic.topic_type ?? "new") === trackerMode),
    [trackerMode, trackerTopics]
  );

  const filteredManageTopics = React.useMemo(() => {
    if (manageTopicFilter === "all") return manageTopics;
    return manageTopics.filter((topic) => (topic.topic_type ?? "new") === manageTopicFilter);
  }, [manageTopicFilter, manageTopics]);

  const actionVerb = trackerMode === "revision" ? "revised" : "taught";
  const progressLabel = trackerMode === "revision" ? "Revision progress" : "Teaching progress";
  const actionLabel = trackerMode === "revision" ? "Mark revised" : "Mark taught";
  const dateLabel = trackerMode === "revision" ? "Revised date" : "Taught date";
  const trackerEmptyMessage =
    trackerTopics.length === 0
      ? "No topics yet for this class and subject."
      : trackerMode === "revision"
        ? "No revision topics yet for this class and subject."
        : "No new lesson topics yet for this class and subject.";
  const manageEmptyMessage =
    manageTopics.length === 0
      ? "No topics for this class and subject yet."
      : manageTopicFilter === "revision"
        ? "No revision topics yet for this class and subject."
        : manageTopicFilter === "new"
          ? "No new topics yet for this class and subject."
          : "No topics match this filter.";

  const { totalSubtopics, completedSubtopics } = React.useMemo(() => {
    let total = 0;
    let done = 0;

    for (const topic of filteredTrackerTopics) {
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
  }, [filteredTrackerTopics]);

  const progressPercent = totalSubtopics
    ? Math.round((completedSubtopics / totalSubtopics) * 100)
    : 0;
  const canEditTracker = Boolean(userId && trackerTeacherId && userId === trackerTeacherId);

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

  const getAccessToken = React.useCallback(async () => {
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;
    if (!accessToken) throw new Error("Session expired");
    return accessToken;
  }, []);

  const fetchMetadata = React.useCallback(async () => {
    if (!userId) return;
    setLoadingMeta(true);
    setLoadingTeachers(true);
    try {
      const accessToken = await getAccessToken();

      const res = await fetch("/api/teacher/lesson-metadata", {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(payload?.error || "Failed to load metadata");
      }

      const sortedClasses = (payload?.classes ?? []).map((cls: ClassItem) => ({
        id: String(cls.id),
        name: cls.name
      }));
      const sortedSubjects = (payload?.subjects ?? []).map((subj: SubjectItem) => ({
        id: String(subj.id),
        name: subj.name
      }));
      const sortedTeachers =
        (payload?.teachers ?? []).map((teacher: TeacherItem) => ({
          id: String(teacher.id),
          name: teacher.name ?? null,
          email: teacher.email ?? null,
        })) ?? [];

      const defaultClass = sortedClasses[0]?.id || "";
      const defaultSubject = sortedSubjects[0]?.id || "";

      setClasses(sortedClasses);
      setSubjects(sortedSubjects);
      setTeachers(sortedTeachers);
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
      setTeachers([]);
    } finally {
      setLoadingMeta(false);
      setLoadingTeachers(false);
    }
  }, [getAccessToken, userId]);

  type LessonTopicRow = {
    id: string;
    class_id: string;
    subject_id: string;
    title: string;
    sub_topics: string[] | null;
    order_index: number | null;
    topic_type: string | null;
  };

  type LessonSubtopicProgressRow = {
    id: string;
    topic_id: string;
    subtopic_index: number;
    taught_on: string | null;
    remark: string | null;
  };

  const mapTopicsWithProgress = React.useCallback(
    (topicRows: LessonTopicRow[], subtopicProgressRows: LessonSubtopicProgressRow[]): TopicWithProgress[] => {
      const subtopicProgressMap = new Map<string, SubtopicProgress[]>();

      (subtopicProgressRows ?? []).forEach((row) => {
        const key = String(row.topic_id);
        const list = subtopicProgressMap.get(key) ?? [];
        const nextEntry = {
          id: row.id ? String(row.id) : null,
          subtopic_index: row.subtopic_index,
          taught_on: row.taught_on ?? null,
          remark: row.remark ?? null,
        };
        const existingIndex = list.findIndex((item) => item.subtopic_index === row.subtopic_index);
        if (existingIndex >= 0) {
          const existing = list[existingIndex];
          const existingTime = existing.taught_on ? new Date(existing.taught_on).getTime() : 0;
          const nextTime = nextEntry.taught_on ? new Date(nextEntry.taught_on).getTime() : 0;
          list[existingIndex] = nextTime >= existingTime ? nextEntry : existing;
        } else {
          list.push(nextEntry);
        }
        subtopicProgressMap.set(key, list);
      });

      return (topicRows ?? []).map((topic) => ({
        id: String(topic.id),
        class_id: String(topic.class_id),
        subject_id: String(topic.subject_id),
        title: topic.title,
        subtopics: Array.isArray(topic.sub_topics) ? topic.sub_topics.filter(Boolean).map(String) : [],
        order_index: topic.order_index ?? 0,
        topic_type: (topic.topic_type === "revision" ? "revision" : "new") as TopicType,
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
          .select("id, class_id, subject_id, title, sub_topics, order_index, topic_type")
          .eq("class_id", classId)
          .eq("subject_id", subjectId)
          .order("order_index", { ascending: true })
          .order("created_at", { ascending: true });
        if (topicError) throw topicError;

        const topicIds = (topicRows ?? []).map((t) => t.id as string);
        let subtopicProgressRows: LessonSubtopicProgressRow[] = [];
        if (topicIds.length > 0 && userId) {
          const { data: fetchedSubtopicProgress, error: subtopicProgressError } = await supabase
            .from("lesson_subtopic_progress")
            .select("id, topic_id, subtopic_index, taught_on, remark")
            .in("topic_id", topicIds)
            .eq("academic_year", academicYear);
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
    [academicYear, mapTopicsWithProgress, userId]
  );

  const fetchTeacherName = React.useCallback(
    async (params: { classId: string; subjectId: string; target: "tracker" | "manage" }) => {
      const { classId, subjectId, target } = params;
      if (!classId || !subjectId) {
        if (target === "tracker") {
          setTrackerTeacherName("");
          setTrackerTeacherId(null);
        } else {
          setManageTeacherName("");
          setManageTeacherId(null);
        }
        return;
      }
      setLoadingTeacherName(true);
      try {
        const { data, error } = await supabase
          .from("lesson_class_subject_year")
          .select("subject_teacher_id, subject_teacher_name")
          .eq("class_id", classId)
          .eq("subject_id", subjectId)
          .eq("academic_year", academicYear)
          .maybeSingle();
        if (error) throw error;
        const name = data?.subject_teacher_name ? String(data.subject_teacher_name) : "";
        const teacherId = data?.subject_teacher_id ? String(data.subject_teacher_id) : null;
        if (target === "tracker") {
          setTrackerTeacherName(name);
          setTrackerTeacherId(teacherId);
        } else {
          setManageTeacherName(name);
          setManageTeacherId(teacherId);
        }
      } catch (error) {
        console.warn("Failed to fetch teacher name", error);
        if (target === "tracker") {
          setTrackerTeacherName("");
          setTrackerTeacherId(null);
        } else {
          setManageTeacherName("");
          setManageTeacherId(null);
        }
      } finally {
        setLoadingTeacherName(false);
      }
    },
    [academicYear]
  );

  const saveTeacherName = React.useCallback(
    async (params: { classId: string; subjectId: string; target: "tracker" | "manage" }) => {
      const { classId, subjectId, target } = params;
      if (!classId || !subjectId || !userId) return;
      const name = (target === "tracker" ? trackerTeacherName : manageTeacherName).trim();
      const teacherId = target === "tracker" ? trackerTeacherId : manageTeacherId;
      if (name && !teacherId) {
        setInlineError("Please select a teacher from the list.");
        return;
      }
      setSavingTeacherName(true);
      setInlineError(null);
      setActionMessage(null);
      try {
        const { error } = await supabase.from("lesson_class_subject_year").upsert(
          {
            class_id: classId,
            subject_id: subjectId,
            academic_year: academicYear,
            subject_teacher_name: name || null,
            subject_teacher_id: name ? teacherId : null,
            created_by: userId,
          },
          { onConflict: "class_id,subject_id,academic_year" }
        );
        if (error) throw error;
        if (target === "manage") {
          setManageTeacherName(name);
          setManageTeacherId(name ? teacherId ?? null : null);
          if (classId === trackerClassId && subjectId === trackerSubjectId) {
            setTrackerTeacherName(name);
            setTrackerTeacherId(name ? teacherId ?? null : null);
          }
        } else {
          setTrackerTeacherName(name);
          setTrackerTeacherId(name ? teacherId ?? null : null);
        }
        const message = "Teacher name saved.";
        setActionMessage(message);
        window.setTimeout(() => {
          setActionMessage((current) => (current === message ? null : current));
        }, 2500);
      } catch (error) {
        console.error("Failed to save teacher name", error);
        setInlineError("Unable to save teacher name right now.");
      } finally {
        setSavingTeacherName(false);
      }
    },
    [
      academicYear,
      manageTeacherId,
      manageTeacherName,
      trackerClassId,
      trackerSubjectId,
      trackerTeacherId,
      trackerTeacherName,
      userId,
    ]
  );

  React.useEffect(() => {
    if (userId) {
      fetchMetadata();
    }
  }, [userId, fetchMetadata]);

  React.useEffect(() => {
    fetchTopics({ classId: trackerClassId, subjectId: trackerSubjectId, target: "tracker" });
  }, [fetchTopics, trackerClassId, trackerSubjectId]);

  React.useEffect(() => {
    fetchTeacherName({ classId: trackerClassId, subjectId: trackerSubjectId, target: "tracker" });
  }, [fetchTeacherName, trackerClassId, trackerSubjectId]);

  React.useEffect(() => {
    setRemarkModalTarget(null);
    setRemarkModalText("");
    setRemarkModalDate(todayLocal());
    setRemarkModalError(null);
    setRemarkModalSaving(false);
    setExpandedRemarkKeys(new Set());
    setRemarkDrafts({});
    setRemarkErrors({});
  }, [academicYear, trackerClassId, trackerSubjectId]);

  React.useEffect(() => {
    setOpenTopicIds(new Set(filteredTrackerTopics.map((topic) => topic.id)));
  }, [filteredTrackerTopics]);

  React.useEffect(() => {
    fetchTopics({ classId: manageClassId, subjectId: manageSubjectId, target: "manage" });
  }, [fetchTopics, manageClassId, manageSubjectId]);

  React.useEffect(() => {
    fetchTeacherName({ classId: manageClassId, subjectId: manageSubjectId, target: "manage" });
  }, [fetchTeacherName, manageClassId, manageSubjectId]);

  const reorderSubtopics = React.useCallback((from: number, to: number) => {
    setEditorState((prev) => {
      const list = [...(prev.subtopics.length ? prev.subtopics : [""])];
      if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return prev;
      const [item] = list.splice(from, 1);
      list.splice(to, 0, item);
      return { ...prev, subtopics: list };
    });
  }, []);

  const makeRemarkKey = React.useCallback((topicId: string, subtopicIndex: number) => `${topicId}:${subtopicIndex}`, []);

  const toggleRemarkExpanded = React.useCallback((key: string, next?: boolean) => {
    setExpandedRemarkKeys((prev) => {
      const updated = new Set(prev);
      const shouldOpen = typeof next === "boolean" ? next : !updated.has(key);
      if (shouldOpen) updated.add(key);
      else updated.delete(key);
      return updated;
    });
  }, []);

  const openRemarkModal = React.useCallback(
    (params: {
      topicId: string;
      subtopicIndex: number;
      topicTitle: string;
      subtopicTitle: string;
      taughtOn: string | null;
      remark: string | null;
    }) => {
      if (!canEditTracker) {
        setInlineError("Only the subject teacher can edit progress for this subject.");
        return;
      }
      setRemarkModalTarget({
        topicId: params.topicId,
        subtopicIndex: params.subtopicIndex,
        topicTitle: params.topicTitle,
        subtopicTitle: params.subtopicTitle,
      });
      setRemarkModalText(params.remark ?? "");
      setRemarkModalDate(toDateInput(params.taughtOn) || todayLocal());
      setRemarkModalError(null);
    },
    [canEditTracker]
  );

  const closeRemarkModal = React.useCallback(() => {
    if (remarkModalSaving) return;
    setRemarkModalTarget(null);
    setRemarkModalText("");
    setRemarkModalDate(todayLocal());
    setRemarkModalError(null);
  }, [remarkModalSaving]);

  const upsertSubtopicProgress = React.useCallback(
    async (params: { topicId: string; subtopicIndex: number; taughtOn: string | null; remark: string | null }) => {
      const { topicId, subtopicIndex, taughtOn, remark } = params;
      if (!userId) return null;
      const accessToken = await getAccessToken();
      const res = await fetch("/api/teacher/lesson-subtopic-progress", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          topic_id: topicId,
          subtopic_index: subtopicIndex,
          taught_on: taughtOn,
          remark,
          academic_year: academicYear,
        }),
      });
      const resClone = res.clone();
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        const rawText = payload ? "" : await resClone.text().catch(() => "");
        const message = payload?.error || rawText || res.statusText || "Failed to save subtopic progress";
        console.error("Failed to save subtopic progress", {
          status: res.status,
          statusText: res.statusText,
          payload,
          rawText,
        });
        throw new Error(message);
      }
      return payload?.data ?? null;
    },
    [academicYear, getAccessToken, userId]
  );

  const applySubtopicProgressUpdate = React.useCallback(
    (topicId: string, subtopicIndex: number, next: { id: string | null; taught_on: string | null; remark: string | null }) => {
      setTrackerTopics((prev) =>
        prev.map((row) =>
          row.id === topicId
            ? {
                ...row,
                subTopicProgress: [
                  ...row.subTopicProgress.filter((s) => s.subtopic_index !== subtopicIndex),
                  {
                    id: next.id,
                    subtopic_index: subtopicIndex,
                    taught_on: next.taught_on,
                    remark: next.remark,
                  },
                ],
              }
            : row
        )
      );
    },
    []
  );

  const markSubtopicTaughtWithRemark = React.useCallback(
    async (topic: TopicWithProgress, subtopicIndex: number, remark: string) => {
      if (!userId) return;
      if (!canEditTracker) {
        setInlineError("Only the subject teacher can edit progress for this subject.");
        return;
      }
      const trimmedRemark = remark.trim();
      if (!trimmedRemark) return;
      setSavingTopicId(topic.id);
      setActionMessage(null);
      try {
        const taughtOn = todayLocal();
        const data = await upsertSubtopicProgress({
          topicId: topic.id,
          subtopicIndex,
          taughtOn,
          remark: trimmedRemark,
        });
        if (!data) return;
        applySubtopicProgressUpdate(topic.id, subtopicIndex, {
          id: data.id ? String(data.id) : null,
          taught_on: data.taught_on ?? taughtOn,
          remark: data.remark ?? trimmedRemark,
        });
      } catch (error) {
        console.error("Failed to update subtopic progress", error);
        setInlineError("Unable to update subtopic status right now.");
      } finally {
        setSavingTopicId(null);
      }
    },
    [applySubtopicProgressUpdate, canEditTracker, upsertSubtopicProgress, userId]
  );

  const saveSubtopicRemark = React.useCallback(
    async (topicId: string, subtopicIndex: number, taughtOn: string, remark: string) => {
      if (!userId) return;
      if (!canEditTracker) {
        setInlineError("Only the subject teacher can edit progress for this subject.");
        return;
      }
      const trimmedRemark = remark.trim();
      if (!trimmedRemark) return;
      setSavingTopicId(topicId);
      setActionMessage(null);
      try {
        const data = await upsertSubtopicProgress({
          topicId,
          subtopicIndex,
          taughtOn,
          remark: trimmedRemark,
        });
        if (!data) return;
        applySubtopicProgressUpdate(topicId, subtopicIndex, {
          id: data.id ? String(data.id) : null,
          taught_on: data.taught_on ?? taughtOn,
          remark: data.remark ?? trimmedRemark,
        });
      } catch (error) {
        console.error("Failed to save subtopic remark", error);
        setInlineError("Unable to save remark right now.");
      } finally {
        setSavingTopicId(null);
      }
    },
    [applySubtopicProgressUpdate, canEditTracker, upsertSubtopicProgress, userId]
  );

  const handleSubtopicToggle = async (topic: TopicWithProgress, subtopicIndex: number, checked: boolean) => {
    if (!userId) return;
    if (!canEditTracker) {
      setInlineError("Only the subject teacher can edit progress for this subject.");
      return;
    }
    setSavingTopicId(topic.id);
    setActionMessage(null);
    try {
      if (!checked) {
        const accessToken = await getAccessToken();
        const res = await fetch("/api/teacher/lesson-subtopic-progress", {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`
          },
          body: JSON.stringify({
            topic_id: topic.id,
            subtopic_index: subtopicIndex,
            academic_year: academicYear,
          }),
        });
        if (!res.ok) {
          const payload = await res.json().catch(() => null);
          throw new Error(payload?.error || "Failed to remove subtopic progress");
        }
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

  const handleRemarkModalSave = React.useCallback(async () => {
    if (!remarkModalTarget || !userId) return;
    if (!canEditTracker) {
      setInlineError("Only the subject teacher can edit progress for this subject.");
      return;
    }
    const trimmedRemark = normalizePresetRemark(remarkModalText);
    if (!trimmedRemark) {
      setRemarkModalError("Remark is required.");
      return;
    }
    const taughtOn = remarkModalDate || todayLocal();
    setRemarkModalSaving(true);
    setSavingTopicId(remarkModalTarget.topicId);
    setActionMessage(null);
    try {
      const data = await upsertSubtopicProgress({
        topicId: remarkModalTarget.topicId,
        subtopicIndex: remarkModalTarget.subtopicIndex,
        taughtOn,
        remark: trimmedRemark,
      });
      if (!data) return;
      applySubtopicProgressUpdate(remarkModalTarget.topicId, remarkModalTarget.subtopicIndex, {
        id: data.id ? String(data.id) : null,
        taught_on: data.taught_on ?? taughtOn,
        remark: data.remark ?? trimmedRemark,
      });
      const message = "Remark saved.";
      setActionMessage(message);
      window.setTimeout(() => {
        setActionMessage((current) => (current === message ? null : current));
      }, 2500);
      closeRemarkModal();
    } catch (error) {
      console.error("Failed to save remark", error);
      setInlineError("Unable to save remark right now.");
    } finally {
      setRemarkModalSaving(false);
      setSavingTopicId(null);
    }
  }, [
    applySubtopicProgressUpdate,
    canEditTracker,
    closeRemarkModal,
    remarkModalDate,
    remarkModalTarget,
    remarkModalText,
    upsertSubtopicProgress,
    userId,
  ]);

  const openEditor = (mode: "create" | "edit", topic?: TopicWithProgress) => {
    setEditorMode(mode);
    if (mode === "edit" && topic) {
      setEditorState({
        id: topic.id,
        classId: topic.class_id,
        subjectId: topic.subject_id,
        title: topic.title,
        subtopics: topic.subtopics ?? [],
        orderIndex: topic.order_index ?? 0,
        topicType: topic.topic_type ?? "new",
      });
    } else {
      const defaultType = manageTopicFilter === "all" ? "new" : manageTopicFilter;
      setEditorState({
        classId: manageClassId || trackerClassId,
        subjectId: manageSubjectId || trackerSubjectId,
        title: "",
        subtopics: [],
        orderIndex: 0,
        topicType: defaultType,
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
        sub_topics: subtopics.length ? subtopics : null,
        order_index: Number(editorState.orderIndex) || 0,
        topic_type: editorState.topicType,
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
    const confirmed = window.confirm("Delete this topic? This removes its progress history too.");
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

  const renderTopicTypeBadge = (topicType: TopicType) => {
    const isRevision = topicType === "revision";
    return (
      <span
        className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${
          isRevision
            ? "border-amber-200 bg-amber-50 text-amber-700"
            : "border-emerald-200 bg-emerald-50 text-emerald-700"
        }`}
      >
        {isRevision ? "Revision" : "New"}
      </span>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar programScope={programScope} />
      <Modal
        open={Boolean(remarkModalTarget)}
        title={remarkModalTarget?.subtopicTitle || "Remark"}
        description={remarkModalTarget ? `Topic: ${remarkModalTarget.topicTitle}` : undefined}
        onClose={closeRemarkModal}
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button
              className="rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
              disabled={remarkModalSaving}
              onClick={closeRemarkModal}
            >
              Cancel
            </Button>
            <Button
              className="rounded-full bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-black"
              disabled={remarkModalSaving || !canEditTracker || !remarkModalText.trim()}
              onClick={() => void handleRemarkModalSave()}
            >
              {remarkModalSaving ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Saving
                </span>
              ) : (
                "Save"
              )}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-400 dark:text-slate-500">
              {dateLabel}
            </div>
            <div className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm text-gray-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-50">
              <Calendar className="h-4 w-4 text-gray-500 dark:text-slate-400" />
              <input
                type="date"
                value={remarkModalDate}
                min="2020-01-01"
                max="2100-12-31"
                disabled={remarkModalSaving || !canEditTracker}
                onChange={(e) => setRemarkModalDate(e.target.value)}
                className="h-6 border-none bg-transparent p-0 text-sm font-medium text-current focus:outline-none focus:ring-0"
              />
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-400 dark:text-slate-500">
                Remark (required)
              </label>
              <div className="hidden flex-wrap items-center justify-end gap-1 sm:flex">
                {remarkPresets.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    disabled={remarkModalSaving || !canEditTracker}
                    onClick={() => {
                      setRemarkModalText((prev) => {
                        const trimmed = prev.trim();
                        if (!trimmed) return preset;
                        if (trimmed.toLowerCase().includes(preset.toLowerCase())) return prev;
                        const suffix = /[.!?]$/.test(trimmed) ? "" : ".";
                        return `${trimmed}${suffix} ${preset}`;
                      });
                      setRemarkModalError(null);
                    }}
                    className="rounded-full border border-gray-200 bg-white px-3 py-1 text-[11px] font-semibold text-gray-600 transition hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>

            <textarea
              value={remarkModalText}
              onChange={(e) => {
                setRemarkModalText(e.target.value);
                if (e.target.value.trim()) setRemarkModalError(null);
              }}
              rows={4}
              disabled={remarkModalSaving || !canEditTracker}
              placeholder="Write a short, specific note…"
              className="w-full resize-none rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-gray-300 focus:outline-none focus:ring-4 focus:ring-gray-100 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50 dark:focus:border-slate-600 dark:focus:ring-slate-800"
            />
            {remarkModalError ? <p className="mt-2 text-xs font-semibold text-red-600">{remarkModalError}</p> : null}

            <div className="mt-3 flex flex-wrap items-center gap-1 sm:hidden">
              {remarkPresets.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    disabled={remarkModalSaving || !canEditTracker}
                    onClick={() => {
                      setRemarkModalText((prev) => {
                        const trimmed = prev.trim();
                        if (!trimmed) return preset;
                        if (trimmed.toLowerCase().includes(preset.toLowerCase())) return prev;
                        const suffix = /[.!?]$/.test(trimmed) ? "" : ".";
                        return `${trimmed}${suffix} ${preset}`;
                      });
                      setRemarkModalError(null);
                    }}
                    className="rounded-full border border-gray-200 bg-white px-3 py-1 text-[11px] font-semibold text-gray-600 transition hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                  {preset}
                </button>
              ))}
            </div>
          </div>
        </div>
      </Modal>
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
                <div className="grid w-full grid-cols-1 gap-4 sm:grid-cols-3">
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
                  <div className="flex flex-col gap-1.5">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-400">Year</span>
                    <div className="mt-1">
                      <select
                        value={String(academicYear)}
                        onChange={(e) => setAcademicYear(Number(e.target.value))}
                        className={selectorClass}
                        disabled={loadingMeta}
                      >
                        {yearOptions.map((year) => (
                          <option key={year} value={year}>
                            {year}
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

              <div className="flex items-end justify-between gap-3">
                <div className="flex min-w-0 flex-col gap-1.5">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-400">
                    Subject teacher
                  </span>
                  <p className="truncate text-sm font-semibold text-gray-900">
                    {loadingTeacherName ? "Loading…" : trackerTeacherName.trim() ? trackerTeacherName : "Not set"}
                  </p>
                  {!canEditTracker ? (
                    <p className="text-xs text-gray-500">
                      Only the assigned subject teacher can edit progress. Update it in the Manage tab.
                    </p>
                  ) : null}
                </div>
              </div>

              <div className="border-t border-gray-100 pt-6">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">{progressLabel}</p>
                    <p className="text-xl font-semibold text-gray-900">{progressPercent}%</p>
                  </div>
                  <p className="text-sm text-gray-700">
                    {completedSubtopics} / {totalSubtopics || 0} subtopics {actionVerb}
                  </p>
                  <p className="text-sm text-gray-500">
                    {trackerClassName} · {trackerSubjectName} · {academicYear}
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
                <div className="flex items-center justify-between gap-3">
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <CardTitle className="text-sm font-semibold text-gray-900 leading-tight dark:text-slate-50">
                        Topic Tracking
                      </CardTitle>
                      {renderTopicTypeBadge(trackerMode)}
                    </div>
                  </div>
                  <div className="inline-flex items-center rounded-full border border-gray-200 bg-white p-1 shadow-sm">
                    <button
                      type="button"
                      onClick={() => setTrackerMode("new")}
                      className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                        trackerMode === "new"
                          ? "bg-gray-900 text-white shadow"
                          : "text-gray-600 hover:text-gray-900"
                      }`}
                    >
                      New Lesson
                    </button>
                    <button
                      type="button"
                      onClick={() => setTrackerMode("revision")}
                      className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                        trackerMode === "revision"
                          ? "bg-gray-900 text-white shadow"
                          : "text-gray-600 hover:text-gray-900"
                      }`}
                    >
                      Revision
                    </button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="px-0">
                {loadingTopics ? (
                  <div className="flex items-center justify-center gap-3 rounded-xl bg-gray-50 px-4 py-8 text-sm text-gray-500 dark:bg-slate-800">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading topics…
                  </div>
                ) : filteredTrackerTopics.length === 0 ? (
                  <div className="flex flex-col items-center justify-center gap-3 rounded-xl bg-gray-50 px-4 py-10 text-center dark:bg-slate-800">
                    <div className="rounded-full bg-gray-100 p-3 text-gray-400 dark:bg-slate-700 dark:text-slate-300">
                      <List className="h-6 w-6" />
                    </div>
                    <div className="text-sm text-gray-600 dark:text-slate-300">{trackerEmptyMessage}</div>
                    <button
                      className="text-sm font-semibold text-gray-900 underline-offset-4 hover:underline dark:text-slate-100"
                      onClick={() => setActiveTab("manage")}
                    >
                      Add topics from the management tab.
                    </button>
                  </div>
                ) : (
                  <div className="mt-5 space-y-4">
                    {filteredTrackerTopics.map((topic) => {
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
	                        const leafKey = makeRemarkKey(topic.id, 0);
	                        const leafExistingRemark = leafProgressEntry?.remark ?? "";
	                        const leafRemarkDraft = remarkDrafts[leafKey] ?? leafExistingRemark;
	                        const leafRemarkExpanded = expandedRemarkKeys.has(leafKey);
	                        const leafRemarkError = remarkErrors[leafKey];

	                        return (
	                          <div key={topic.id} className="space-y-2">
	                            <div
	                              className={`flex items-start justify-between gap-3 rounded-xl border border-gray-100 bg-gray-50 ${leafPadding} ${
	                                isSaving ? "opacity-70" : ""
	                              } dark:border-slate-700/60 dark:bg-slate-800`}
	                            >
	                              <div className="flex min-w-0 flex-1 items-start gap-3">
	                                <input
	                                  type="checkbox"
	                                  className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-500 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 dark:border-slate-600 dark:bg-slate-900"
	                                  checked={leafComplete}
	                                  disabled={isSaving || !canEditTracker}
	                                  onChange={(e) => {
	                                    if (e.target.checked) {
	                                      toggleRemarkExpanded(leafKey, false);
	                                      setRemarkErrors((prev) => {
	                                        const next = { ...prev };
	                                        delete next[leafKey];
	                                        return next;
	                                      });
	                                      openRemarkModal({
	                                        topicId: topic.id,
	                                        subtopicIndex: 0,
	                                        topicTitle: topic.title,
	                                        subtopicTitle: topic.title,
	                                        taughtOn: null,
	                                        remark: leafRemarkDraft,
	                                      });
	                                      return;
	                                    }
	                                    void handleSubtopicToggle(topic, 0, false);
	                                  }}
	                                />
		                                <div className="min-w-0 flex-1">
                                  <div className="flex items-start justify-between gap-2">
                                    <span className="text-sm font-medium text-gray-900 dark:text-slate-50">{topic.title}</span>
                                    {renderTopicTypeBadge(topic.topic_type)}
                                  </div>
		                                  {!leafRemarkExpanded && leafExistingRemark.trim() ? (
		                                    <div className="mt-1 flex items-center gap-1 text-xs leading-5 text-gray-500 dark:text-slate-400">
		                                      <span className="min-w-0 line-clamp-2">“{leafExistingRemark}”</span>
		                                      <button
		                                        type="button"
		                                        className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-gray-400 transition hover:bg-gray-100 hover:text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 disabled:opacity-60 dark:text-slate-500 dark:hover:bg-slate-700 dark:hover:text-slate-100"
		                                        disabled={isSaving || !canEditTracker}
		                                        onClick={() =>
		                                          openRemarkModal({
		                                            topicId: topic.id,
		                                            subtopicIndex: 0,
		                                            topicTitle: topic.title,
		                                            subtopicTitle: topic.title,
		                                            taughtOn: leafProgressEntry?.taught_on ?? null,
		                                            remark: leafProgressEntry?.remark ?? leafRemarkDraft,
		                                          })
		                                        }
		                                      >
		                                        <span className="sr-only">Edit remark</span>
		                                        <Edit2 className="h-3.5 w-3.5" />
		                                      </button>
		                                    </div>
		                                  ) : null}
	                                  {leafRemarkExpanded ? (
	                                    <div className="mt-2 rounded-xl border border-gray-200 bg-white/70 p-3 dark:border-slate-700 dark:bg-slate-900/40">
	                                      <textarea
	                                        value={leafRemarkDraft}
	                                        disabled={!canEditTracker}
	                                        onChange={(e) => {
	                                          const nextValue = e.target.value;
	                                          setRemarkDrafts((prev) => ({ ...prev, [leafKey]: nextValue }));
	                                          if (nextValue.trim()) {
	                                            setRemarkErrors((prev) => {
	                                              const next = { ...prev };
	                                              delete next[leafKey];
	                                              return next;
	                                            });
	                                          }
	                                        }}
	                                        rows={3}
	                                        className="w-full resize-none rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 focus:border-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-50"
	                                        placeholder="Engagement notes (required). e.g. Some students struggled; need recap next class."
	                                      />
	                                      {leafRemarkError ? (
	                                        <p className="mt-2 text-xs font-semibold text-red-600">{leafRemarkError}</p>
	                                      ) : null}
	                                      <div className="mt-2 flex items-center justify-end gap-2">
	                                        {leafComplete ? (
	                                          <Button
	                                            className="rounded-full bg-gray-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-black"
	                                            disabled={isSaving || !canEditTracker || !leafRemarkDraft.trim()}
	                                            onClick={() => {
	                                              const taughtOn = leafProgressEntry?.taught_on ?? null;
	                                              if (!taughtOn) return;
	                                              const remark = leafRemarkDraft.trim();
	                                              if (!remark) return;
	                                              toggleRemarkExpanded(leafKey, false);
	                                              void saveSubtopicRemark(topic.id, 0, taughtOn, remark);
	                                            }}
	                                          >
	                                            Save remark
	                                          </Button>
	                                        ) : (
	                                          <Button
	                                            className="rounded-full bg-gray-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-black"
	                                            disabled={isSaving || !canEditTracker || !leafRemarkDraft.trim()}
	                                            onClick={() => {
	                                              const remark = leafRemarkDraft.trim();
	                                              if (!remark) {
	                                                setRemarkErrors((prev) => ({
	                                                  ...prev,
                                                  [leafKey]: `Remark is required to mark this subtopic as ${actionVerb}.`,
	                                                }));
	                                                return;
	                                              }
	                                              setRemarkErrors((prev) => {
	                                                const next = { ...prev };
	                                                delete next[leafKey];
	                                                return next;
	                                              });
	                                              toggleRemarkExpanded(leafKey, false);
	                                              void markSubtopicTaughtWithRemark(topic, 0, remark);
	                                            }}
	                                          >
                                            {actionLabel}
	                                          </Button>
	                                        )}
	                                      </div>
	                                    </div>
	                                  ) : null}
	                                </div>
	                              </div>
	                              <div className="flex items-center">
	                                {leafComplete ? (
	                                  <button
	                                    type="button"
	                                    className="inline-flex items-center gap-1.5 rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 transition hover:bg-blue-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 disabled:opacity-60 dark:border-blue-500/40 dark:bg-blue-500/10 dark:text-blue-100 dark:hover:bg-blue-500/15"
	                                    disabled={isSaving || !canEditTracker}
	                                    onClick={() =>
	                                      openRemarkModal({
	                                        topicId: topic.id,
	                                        subtopicIndex: 0,
	                                        topicTitle: topic.title,
	                                        subtopicTitle: topic.title,
	                                        taughtOn: leafProgressEntry?.taught_on ?? leafTaughtDate ?? null,
	                                        remark: leafProgressEntry?.remark ?? leafRemarkDraft,
	                                      })
	                                    }
	                                  >
	                                    <Calendar className="h-3.5 w-3.5" />
	                                    <span>{displayDate(leafTaughtDate || todayLocal())}</span>
	                                  </button>
	                                ) : null}
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
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-medium text-gray-900 dark:text-slate-50">{topic.title}</span>
                                  {renderTopicTypeBadge(topic.topic_type)}
                                </div>
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
	                                      const remarkKey = makeRemarkKey(topic.id, index);
	                                      const existingRemark = progressEntry?.remark ?? "";
	                                      const remarkDraft = remarkDrafts[remarkKey] ?? existingRemark;
	                                      const remarkExpanded = expandedRemarkKeys.has(remarkKey);
	                                      const remarkError = remarkErrors[remarkKey];
	                                      return (
	                                        <div
	                                          key={`${topic.id}-sub-${index}`}
	                                          className={`flex items-start justify-between gap-3 rounded-xl border text-sm transition-colors duration-150 ease-out ${pillPadding} ${
	                                            subComplete
	                                              ? "border-blue-100 bg-blue-50/70 dark:border-blue-500/30 dark:bg-blue-500/10"
	                                              : "border-gray-100 bg-gray-50 hover:bg-gray-50/80 dark:border-slate-700/60 dark:bg-slate-800 dark:hover:bg-slate-700"
	                                          } ${isSaving ? "opacity-70" : ""}`}
	                                        >
	                                          <div className="flex min-w-0 flex-1 items-start gap-3">
	                                            <input
	                                              type="checkbox"
	                                              className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-500 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 dark:border-slate-600 dark:bg-slate-900"
	                                              checked={subComplete}
	                                              disabled={isSaving || !canEditTracker}
	                                              onChange={(e) => {
	                                                if (e.target.checked) {
	                                                  toggleRemarkExpanded(remarkKey, false);
	                                                  setRemarkErrors((prev) => {
	                                                    const next = { ...prev };
	                                                    delete next[remarkKey];
	                                                    return next;
	                                                  });
	                                                  openRemarkModal({
	                                                    topicId: topic.id,
	                                                    subtopicIndex: index,
	                                                    topicTitle: topic.title,
	                                                    subtopicTitle: sub,
	                                                    taughtOn: null,
	                                                    remark: remarkDraft,
	                                                  });
	                                                  return;
	                                                }
	                                                void handleSubtopicToggle(topic, index, false);
	                                              }}
	                                            />
		                                            <div className="min-w-0 flex-1">
		                                              <div className="flex items-start justify-between gap-2">
		                                                <span
		                                                  className={`min-w-0 truncate font-medium ${
		                                                    subComplete ? "text-gray-800 dark:text-slate-200" : "text-gray-900 dark:text-slate-50"
		                                                  }`}
		                                                >
		                                                  {sub}
		                                                </span>
		                                              </div>
		                                              {!remarkExpanded && existingRemark.trim() ? (
		                                                <div className="mt-1 flex items-center gap-1 text-xs leading-5 text-gray-500 dark:text-slate-400">
		                                                  <span className="min-w-0 line-clamp-2">“{existingRemark}”</span>
		                                                  <button
		                                                    type="button"
		                                                    className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-gray-400 transition hover:bg-gray-100 hover:text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 disabled:opacity-60 dark:text-slate-500 dark:hover:bg-slate-700 dark:hover:text-slate-100"
		                                                    disabled={isSaving || !canEditTracker}
		                                                    onClick={() =>
		                                                      openRemarkModal({
		                                                        topicId: topic.id,
		                                                        subtopicIndex: index,
		                                                        topicTitle: topic.title,
		                                                        subtopicTitle: sub,
		                                                        taughtOn: progressEntry?.taught_on ?? null,
		                                                        remark: progressEntry?.remark ?? remarkDraft,
		                                                      })
		                                                    }
		                                                  >
		                                                    <span className="sr-only">Edit remark</span>
		                                                    <Edit2 className="h-3.5 w-3.5" />
		                                                  </button>
		                                                </div>
		                                              ) : null}
	                                              {remarkExpanded ? (
	                                                <div className="mt-2 rounded-xl border border-gray-200 bg-white/70 p-3 dark:border-slate-700 dark:bg-slate-900/40">
	                                                  <textarea
	                                                    value={remarkDraft}
	                                                    disabled={!canEditTracker}
	                                                    onChange={(e) => {
	                                                      const nextValue = e.target.value;
	                                                      setRemarkDrafts((prev) => ({ ...prev, [remarkKey]: nextValue }));
	                                                      if (nextValue.trim()) {
	                                                        setRemarkErrors((prev) => {
	                                                          const next = { ...prev };
	                                                          delete next[remarkKey];
	                                                          return next;
	                                                        });
	                                                      }
	                                                    }}
	                                                    rows={3}
	                                                    className="w-full resize-none rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 focus:border-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-50"
	                                                    placeholder="Engagement notes (required). e.g. Some students struggled; need recap next class."
	                                                  />
	                                                  {remarkError ? (
	                                                    <p className="mt-2 text-xs font-semibold text-red-600">{remarkError}</p>
	                                                  ) : null}
	                                                  <div className="mt-2 flex items-center justify-end gap-2">
	                                                    {subComplete ? (
	                                                      <Button
	                                                        className="rounded-full bg-gray-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-black"
	                                                        disabled={isSaving || !canEditTracker || !remarkDraft.trim()}
	                                                        onClick={() => {
	                                                          const taughtOnRaw = progressEntry?.taught_on ?? null;
	                                                          if (!taughtOnRaw) return;
	                                                          const remark = remarkDraft.trim();
	                                                          if (!remark) return;
	                                                          toggleRemarkExpanded(remarkKey, false);
	                                                          void saveSubtopicRemark(topic.id, index, taughtOnRaw, remark);
	                                                        }}
	                                                      >
	                                                        Save remark
	                                                      </Button>
	                                                    ) : (
	                                                      <Button
	                                                        className="rounded-full bg-gray-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-black"
	                                                        disabled={isSaving || !canEditTracker || !remarkDraft.trim()}
	                                                        onClick={() => {
	                                                          const remark = remarkDraft.trim();
	                                                          if (!remark) {
	                                                            setRemarkErrors((prev) => ({
	                                                              ...prev,
                                                              [remarkKey]: `Remark is required to mark this subtopic as ${actionVerb}.`,
	                                                            }));
	                                                            return;
	                                                          }
	                                                          setRemarkErrors((prev) => {
	                                                            const next = { ...prev };
	                                                            delete next[remarkKey];
	                                                            return next;
	                                                          });
	                                                          toggleRemarkExpanded(remarkKey, false);
	                                                          void markSubtopicTaughtWithRemark(topic, index, remark);
	                                                        }}
	                                                      >
                                                        {actionLabel}
	                                                      </Button>
	                                                    )}
	                                                  </div>
	                                                </div>
	                                              ) : null}
	                                            </div>
	                                          </div>
	                                          <div className="flex items-center">
	                                            {subComplete ? (
	                                              <button
	                                                type="button"
	                                                className="inline-flex items-center gap-1.5 rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 transition hover:bg-blue-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 disabled:opacity-60 dark:border-blue-500/40 dark:bg-blue-500/10 dark:text-blue-100 dark:hover:bg-blue-500/15"
	                                                disabled={isSaving || !canEditTracker}
	                                                onClick={() =>
	                                                  openRemarkModal({
	                                                    topicId: topic.id,
	                                                    subtopicIndex: index,
	                                                    topicTitle: topic.title,
	                                                    subtopicTitle: sub,
	                                                    taughtOn: progressEntry?.taught_on ?? taughtDate ?? null,
	                                                    remark: progressEntry?.remark ?? remarkDraft,
	                                                  })
	                                                }
	                                              >
	                                                <Calendar className="h-3.5 w-3.5" />
	                                                <span>{displayDate(taughtDate || todayLocal())}</span>
	                                              </button>
	                                            ) : null}
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
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
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
                <div className="flex flex-col gap-1.5">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-400">Year</span>
                  <div className="mt-1">
                    <select
                      value={String(academicYear)}
                      onChange={(e) => setAcademicYear(Number(e.target.value))}
                      className={selectorClass}
                      disabled={loadingMeta}
                    >
                      {yearOptions.map((year) => (
                        <option key={year} value={year}>
                          {year}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
              <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div className="flex w-full flex-col gap-1.5">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-400">
                    Subject teacher name
                  </span>
                  <Popover open={teacherComboboxOpen} onOpenChange={setTeacherComboboxOpen}>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        role="combobox"
                        aria-expanded={teacherComboboxOpen}
                        aria-controls="teacher-combobox-list"
                        aria-haspopup="listbox"
                        className={`${selectorClass} inline-flex items-center justify-between`}
                        disabled={loadingMeta || loadingTeacherName || savingTeacherName || loadingTeachers}
                      >
                        <span className="truncate">
                          {manageTeacherName.trim() ? manageTeacherName : "Select teacher…"}
                        </span>
                        <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-60" />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                      <Command>
                        <CommandInput
                          placeholder="Search teacher..."
                          value={teacherComboboxQuery}
                          onValueChange={setTeacherComboboxQuery}
                        />
                        <CommandList id="teacher-combobox-list">
                          <CommandEmpty>No teachers found.</CommandEmpty>
                          <CommandGroup heading="Teachers">
                            {teachers.map((teacher) => {
                              const label = teacher.name || teacher.email || "Unnamed teacher";
                              const selected = teacher.id === manageTeacherId;
                              return (
                                <CommandItem
                                  key={teacher.id}
                                  value={`${label} ${teacher.email ?? ""}`.trim()}
                                  onSelect={() => {
                                    setManageTeacherName(label);
                                    setManageTeacherId(teacher.id);
                                    setTeacherComboboxOpen(false);
                                    setTeacherComboboxQuery("");
                                  }}
                                >
                                  <span className="truncate">{label}</span>
                                  {selected ? <Check className="ml-auto h-4 w-4 opacity-70" /> : null}
                                </CommandItem>
                              );
                            })}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                  {manageTeacherName.trim() ? (
                    <button
                      type="button"
                      className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-gray-500 hover:text-gray-900"
                      onClick={() => {
                        setManageTeacherName("");
                        setManageTeacherId(null);
                      }}
                      disabled={savingTeacherName}
                    >
                      <X className="h-3.5 w-3.5" />
                      Clear
                    </button>
                  ) : null}
                </div>
                <Button
                  className="inline-flex h-10 items-center gap-2 rounded-full bg-gray-900 px-4 text-sm font-semibold text-white shadow-[0_1px_3px_rgba(15,23,42,0.2)] transition hover:bg-black disabled:opacity-60"
                  onClick={() => saveTeacherName({ classId: manageClassId, subjectId: manageSubjectId, target: "manage" })}
                  disabled={loadingMeta || loadingTeacherName || savingTeacherName || !manageClassId || !manageSubjectId}
                >
                  {savingTeacherName ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  Save
                </Button>
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
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {[
                    { value: "all", label: "All" },
                    { value: "new", label: "New topic" },
                    { value: "revision", label: "Revision topic" },
                  ].map((option) => {
                    const active = manageTopicFilter === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setManageTopicFilter(option.value as "all" | TopicType)}
                        className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                          active
                            ? "border-gray-900 bg-gray-900 text-white"
                            : "border-gray-200 text-gray-600 hover:border-gray-300 hover:text-gray-900"
                        }`}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              </CardHeader>
              <CardContent className="px-0">
                {loadingManageTopics ? (
                  <div className="flex items-center justify-center gap-3 rounded-xl bg-gray-50 px-4 py-8 text-sm text-gray-500">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading topics…
                  </div>
                ) : filteredManageTopics.length === 0 ? (
                  <div className="rounded-xl bg-gray-50 px-4 py-8 text-center text-sm text-gray-600">
                    {manageEmptyMessage}
                  </div>
                ) : (
                  <div className="divide-y divide-gray-100">
	                    {filteredManageTopics.map((topic) => (
	                      <div key={topic.id} className="flex items-center justify-between gap-3 px-2 py-3">
	                        <div>
	                          <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                              {topic.title}
                              {renderTopicTypeBadge(topic.topic_type)}
                            </div>
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
                <div className="mt-4 flex flex-col gap-2">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-400">
                    Topic type
                  </span>
                  <div className="inline-flex w-fit items-center rounded-full border border-gray-200 bg-gray-50 p-1">
                    <button
                      type="button"
                      onClick={() => setEditorState((prev) => ({ ...prev, topicType: "new" }))}
                      className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                        editorState.topicType === "new"
                          ? "bg-gray-900 text-white shadow"
                          : "text-gray-600 hover:text-gray-900"
                      }`}
                    >
                      New topic
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditorState((prev) => ({ ...prev, topicType: "revision" }))}
                      className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                        editorState.topicType === "revision"
                          ? "bg-gray-900 text-white shadow"
                          : "text-gray-600 hover:text-gray-900"
                      }`}
                    >
                      Revision topic
                    </button>
                  </div>
                  <p className="text-xs text-gray-500">
                    Use revision for recap, reinforcement, or assessment-aligned practice.
                  </p>
                </div>
	                <div className="mt-4 grid grid-cols-1 gap-4">
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
  const router = useRouter();
  const { programScope, loading: programScopeLoading } = useProgramScope({ role: "teacher" });

  React.useEffect(() => {
    if (!programScopeLoading && programScope === "online") {
      router.replace("/teacher");
    }
  }, [programScope, programScopeLoading, router]);

  if (programScopeLoading || programScope === "online") {
    return null;
  }

  return (
    <React.Suspense fallback={<div className="p-6 text-sm text-gray-500">Loading lesson page…</div>}>
      <TeacherLessonPageContent programScope={programScope} />
    </React.Suspense>
  );
}
