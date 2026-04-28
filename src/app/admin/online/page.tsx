"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Copy, Plus, RotateCcw } from "lucide-react";
import AdminNavbar from "@/components/admin/AdminNavbar";
import AdminScopeSwitch from "@/components/admin/AdminScopeSwitch";
import ClassDistributionChart from "@/components/admin/ClassDistributionChart";
import TeacherAssignmentChart from "@/components/admin/TeacherAssignmentChart";
import {
  AdminOnlineClaimAccessCell,
  AdminOnlineClaimPanel,
  type ClaimLinkResult,
} from "@/components/admin/online/AdminOnlineClaimAccess";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { authFetch } from "@/lib/authFetch";

type OnlineStudent = {
  id: string;
  name: string;
  parent_id?: string | null;
  assigned_teacher_id: string | null;
  account_owner_user_id?: string | null;
  parent_name?: string | null;
  parent_contact_number?: string | null;
  crm_stage?: string | null;
  crm_status_reason?: string | null;
  package_assignments?: PackageAssignmentSummary[];
};

type PackageAssignmentSummary = {
  id: string;
  course_id: string;
  course_name: string;
  teacher_id: string;
  teacher_name: string;
  status: string;
  effective_from: string;
  effective_to: string | null;
  schedule_state: string;
};

type PackageAssignmentDetail = PackageAssignmentSummary & {
  student_id: string;
  student_name: string;
  parent_name: string | null;
  parent_contact_number: string | null;
  sessions_per_week_snapshot: number;
  duration_minutes_snapshot: number;
  monthly_fee_cents_snapshot: number;
  notes: string | null;
};

type CourseOption = {
  id: string;
  name: string;
  sessions_per_week?: number | null;
  monthly_fee_cents?: number | null;
  is_active?: boolean;
};

type Teacher = {
  id: string;
  name: string;
};

type RegistryPayload = {
  students?: OnlineStudent[];
  teachers?: Teacher[];
};

type PackageAssignmentsPayload = {
  assignments?: PackageAssignmentDetail[];
  warning?: string;
};

type FamilyClaimLinkResult = {
  student_ids: string[];
  student_names: string[];
  claim_url: string;
  expires_at: string;
};

type EditStudentForm = {
  name: string;
  assigned_teacher_id: string;
  parent_name: string;
  parent_contact_number: string;
  crm_stage: string;
  crm_status_reason: string;
};

type PackageForm = {
  course_id: string;
  teacher_id: string;
  status: string;
  effective_from: string;
  notes: string;
};

type PackageFormMode = "hidden" | "create" | "edit";

const FALLBACK_STAGES = ["interested", "active", "pending_payment", "paused", "discontinued"];
const PACKAGE_STATUS_OPTIONS = ["active", "pending_payment", "paused", "draft"];
const packageStatusLabel = (status: string) => formatStageLabel(status || "draft");
const scheduleStateLabel = (state: string) =>
  state === "scheduled" ? "Scheduled" : state === "partially_scheduled" ? "Partially Scheduled" : state === "cancelled" ? "Cancelled" : "Waiting For Slot";
const defaultPackageForm = (): PackageForm => ({
  course_id: "",
  teacher_id: "",
  status: "active",
  effective_from: new Date().toISOString().slice(0, 7),
  notes: "",
});

const toPackageAssignmentSummary = (assignment: PackageAssignmentDetail): PackageAssignmentSummary => ({
  id: assignment.id,
  course_id: assignment.course_id,
  course_name: assignment.course_name,
  teacher_id: assignment.teacher_id,
  teacher_name: assignment.teacher_name,
  status: assignment.status,
  effective_from: assignment.effective_from,
  effective_to: assignment.effective_to,
  schedule_state: assignment.schedule_state,
});

const extractError = (payload: unknown, fallback: string) => {
  if (payload && typeof payload === "object" && "error" in payload) {
    const candidate = (payload as { error?: unknown }).error;
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return candidate;
    }
  }
  return fallback;
};

const normalizeStageKey = (stage: string | null | undefined) => {
  const normalized = stage?.trim().toLowerCase();
  return normalized && normalized.length > 0 ? normalized : "active";
};

const formatStageLabel = (stage: string) =>
  stage
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

export default function AdminOnlinePage() {
  const [students, setStudents] = useState<OnlineStudent[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [courses, setCourses] = useState<CourseOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [packageBusy, setPackageBusy] = useState(false);
  const [packageLoading, setPackageLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [searchTerm, setSearchTerm] = useState("");
  const [filterTeacher, setFilterTeacher] = useState("");
  const [filterStage, setFilterStage] = useState("");

  const [isAddStudentModalOpen, setIsAddStudentModalOpen] = useState(false);
  const [newStudentName, setNewStudentName] = useState("");
  const [newStudentParentName, setNewStudentParentName] = useState("");
  const [newStudentParentContactNumber, setNewStudentParentContactNumber] = useState("");
  const [newStudentTeacherId, setNewStudentTeacherId] = useState("");

  const [editStudentId, setEditStudentId] = useState<string | null>(null);
  const [editStudentForm, setEditStudentForm] = useState<EditStudentForm>({
    name: "",
    assigned_teacher_id: "",
    parent_name: "",
    parent_contact_number: "",
    crm_stage: "interested",
    crm_status_reason: "",
  });
  const [packageStudentId, setPackageStudentId] = useState<string | null>(null);
  const [packageAssignments, setPackageAssignments] = useState<PackageAssignmentDetail[]>([]);
  const [editingPackageId, setEditingPackageId] = useState<string | null>(null);
  const [packageFormMode, setPackageFormMode] = useState<PackageFormMode>("hidden");
  const [packageForm, setPackageForm] = useState<PackageForm>(defaultPackageForm);
  const [packageError, setPackageError] = useState("");
  const [packageSuccess, setPackageSuccess] = useState("");
  const [claimBusyStudentId, setClaimBusyStudentId] = useState<string | null>(null);
  const [activeClaimStudentId, setActiveClaimStudentId] = useState<string | null>(null);
  const [claimLinkResultsByStudentId, setClaimLinkResultsByStudentId] = useState<Record<string, ClaimLinkResult>>({});
  const [claimErrorsByStudentId, setClaimErrorsByStudentId] = useState<Record<string, string>>({});
  const [familyClaimStudentIds, setFamilyClaimStudentIds] = useState<string[]>([]);
  const [familyClaimBusy, setFamilyClaimBusy] = useState(false);
  const [familyClaimResult, setFamilyClaimResult] = useState<FamilyClaimLinkResult | null>(null);
  const [familyClaimError, setFamilyClaimError] = useState("");
  const [familyClaimCopyMessage, setFamilyClaimCopyMessage] = useState("");

  const studentListRef = useRef<HTMLDivElement | null>(null);
  const packageFormRef = useRef<HTMLDivElement | null>(null);
  const familyClaimInputRef = useRef<HTMLInputElement | null>(null);

  const refreshData = useCallback(
    async (withLoading = true) => {
      if (withLoading) setLoading(true);
      setError("");

      try {
        const [studentsRes, registryRes, coursesRes] = await Promise.all([
          authFetch("/api/admin/online/students"),
          authFetch("/api/admin/online/registry"),
          authFetch("/api/admin/online/courses"),
        ]);

        const [studentsPayload, registryPayload, coursesPayload] = await Promise.all([
          studentsRes.json(),
          registryRes.json(),
          coursesRes.json(),
        ]);

        const failures: string[] = [];
        const registry = registryPayload as RegistryPayload;
        const coursesData = coursesPayload as { courses?: CourseOption[] };

        if (!studentsRes.ok) {
          failures.push(extractError(studentsPayload, "Failed to load online students"));
          if (Array.isArray(registry.students)) {
            setStudents(registry.students);
          }
        } else {
          setStudents(Array.isArray(studentsPayload) ? (studentsPayload as OnlineStudent[]) : []);
        }

        if (!registryRes.ok) {
          failures.push(extractError(registryPayload, "Failed to load online registry"));
        } else {
          setTeachers(Array.isArray(registry.teachers) ? registry.teachers : []);
        }

        if (!coursesRes.ok) {
          failures.push(extractError(coursesPayload, "Failed to load online courses"));
        } else {
          setCourses(Array.isArray(coursesData.courses) ? coursesData.courses : []);
        }

        if (failures.length > 0) {
          setError(failures.join(" | "));
        }
      } catch (refreshError) {
        setError(refreshError instanceof Error ? refreshError.message : "Failed to refresh online registry");
      } finally {
        if (withLoading) setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    refreshData();
  }, [refreshData]);

  const teacherById = useMemo(() => new Map(teachers.map((teacher) => [teacher.id, teacher.name])), [teachers]);

  const stageOptions = useMemo(() => {
    const dynamicStages = students.map((student) => normalizeStageKey(student.crm_stage));
    return Array.from(new Set([...FALLBACK_STAGES, ...dynamicStages]));
  }, [students]);

  const filteredStudents = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return students
      .filter((student) => {
        if (filterTeacher) {
          if (filterTeacher === "unassigned") {
            if (student.assigned_teacher_id) return false;
          } else if ((student.assigned_teacher_id ?? "") !== filterTeacher) {
            return false;
          }
        }

        const studentStage = normalizeStageKey(student.crm_stage);
        if (filterStage && studentStage !== filterStage) return false;

        if (!term) return true;

        return (
          student.name.toLowerCase().includes(term) ||
          (student.parent_name ?? "").toLowerCase().includes(term) ||
          (student.parent_contact_number ?? "").toLowerCase().includes(term)
        );
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [filterStage, filterTeacher, searchTerm, students]);

  const assignedTeacherCount = useMemo(
    () => students.filter((student) => Boolean(student.assigned_teacher_id)).length,
    [students]
  );

  const teachersWithStudentsCount = useMemo(
    () =>
      new Set(
        students
          .map((student) => student.assigned_teacher_id)
          .filter((teacherId): teacherId is string => Boolean(teacherId))
      ).size,
    [students]
  );

  const activeCrmCount = useMemo(
    () => students.filter((student) => normalizeStageKey(student.crm_stage) === "active").length,
    [students]
  );

  const requiresFollowUpCount = useMemo(
    () =>
      students.filter((student) => {
        const stage = normalizeStageKey(student.crm_stage);
        return stage !== "active" && stage !== "discontinued";
      }).length,
    [students]
  );

  const unassignedTeacherCount = useMemo(
    () => students.filter((student) => !student.assigned_teacher_id).length,
    [students]
  );

  const claimedPortalCount = useMemo(
    () => students.filter((student) => Boolean(student.account_owner_user_id)).length,
    [students]
  );

  const stageChartStudents = useMemo(
    () => students.map((student) => ({ class_name: normalizeStageKey(student.crm_stage) })),
    [students]
  );

  const teacherChartStudents = useMemo(
    () =>
      students.map((student) => ({
        id: student.id,
        name: student.name,
        parent_id: "",
        class_id: null,
        assigned_teacher_id: student.assigned_teacher_id,
      })),
    [students]
  );

  const teacherChartTeachers = useMemo(
    () => teachers.map((teacher) => ({ id: teacher.id, name: teacher.name, email: "" })),
    [teachers]
  );

  const clearSuccessSoon = () => {
    window.setTimeout(() => setSuccess(""), 3000);
  };

  const clearPackageSuccessSoon = () => {
    window.setTimeout(() => setPackageSuccess(""), 3000);
  };

  const scrollToStudentList = useCallback(() => {
    studentListRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const resetPackageForm = useCallback(
    (
      student?: OnlineStudent | null,
      assignment?: PackageAssignmentDetail | null,
      mode: PackageFormMode = assignment ? "edit" : "create"
    ) => {
      setEditingPackageId(assignment?.id ?? null);
      setPackageFormMode(mode);
      setPackageForm({
        course_id: assignment?.course_id ?? courses.find((course) => course.is_active !== false)?.id ?? "",
        teacher_id: assignment?.teacher_id ?? student?.assigned_teacher_id ?? teachers[0]?.id ?? "",
        status: assignment?.status ?? "active",
        effective_from: assignment?.effective_from?.slice(0, 7) ?? new Date().toISOString().slice(0, 7),
        notes: assignment?.notes ?? "",
      });
    },
    [courses, teachers]
  );

  const loadPackageAssignments = useCallback(async (studentId: string) => {
    setPackageLoading(true);
    setError("");
    try {
      const response = await authFetch(
        `/api/admin/online/package-assignments?student_id=${encodeURIComponent(studentId)}`
      );
      const payload = (await response.json()) as PackageAssignmentsPayload & { error?: string };
      if (!response.ok) {
        throw new Error(extractError(payload, "Failed to load package assignments"));
      }
      const assignments = Array.isArray(payload.assignments) ? payload.assignments : [];
      setPackageAssignments(assignments);
      return assignments;
    } catch (packageError) {
      setError(packageError instanceof Error ? packageError.message : "Failed to load package assignments");
      setPackageAssignments([]);
      return [];
    } finally {
      setPackageLoading(false);
    }
  }, []);

  const openPackageManager = useCallback(
    async (student: OnlineStudent) => {
      if (packageStudentId === student.id) {
        setPackageStudentId(null);
        setPackageAssignments([]);
        setPackageError("");
        setPackageSuccess("");
        resetPackageForm(null, null, "hidden");
        return;
      }
      setPackageStudentId(student.id);
      setPackageAssignments([]);
      setPackageError("");
      setPackageSuccess("");
      resetPackageForm(student, null, "hidden");
      const assignments = await loadPackageAssignments(student.id);
      if (assignments.length === 0) {
        resetPackageForm(student, null, "create");
      }
    },
    [loadPackageAssignments, packageStudentId, resetPackageForm]
  );

  const handleEditPackageAssignment = (student: OnlineStudent, assignment: PackageAssignmentDetail) => {
    setPackageError("");
    setPackageSuccess("");
    resetPackageForm(student, assignment, "edit");
    window.setTimeout(() => packageFormRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 100);
  };

  const handleAddPackageAssignment = (student: OnlineStudent) => {
    resetPackageForm(student, null, "create");
  };

  const handleDismissPackageForm = (student: OnlineStudent) => {
    resetPackageForm(student, null, packageAssignments.length === 0 ? "create" : "hidden");
  };

  const submitPackageAssignment = async () => {
    if (!packageStudentId) return;
    if (!packageForm.course_id || !packageForm.teacher_id) {
      setPackageError("Course and teacher are required for a package assignment.");
      return;
    }

    setPackageBusy(true);
    setPackageError("");
    setPackageSuccess("");

    try {
      const wasEditing = Boolean(editingPackageId);
      const url = editingPackageId
        ? `/api/admin/online/package-assignments/${encodeURIComponent(editingPackageId)}`
        : "/api/admin/online/package-assignments";
      const response = await authFetch(url, {
        method: editingPackageId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(editingPackageId ? {} : { student_id: packageStudentId }),
          course_id: packageForm.course_id,
          teacher_id: packageForm.teacher_id,
          status: packageForm.status,
          effective_from: packageForm.effective_from,
          notes: packageForm.notes.trim() || null,
        }),
      });
      const payload = (await response.json()) as { assignment?: PackageAssignmentDetail; error?: string };
      if (!response.ok) {
        throw new Error(extractError(payload, "Failed to save package assignment"));
      }

      const returnedAssignment = payload.assignment;
      if (returnedAssignment) {
        const nextSummary = toPackageAssignmentSummary(returnedAssignment);
        const nextPackageAssignmentCount = wasEditing
          ? packageAssignments.some((assignment) => assignment.id === returnedAssignment.id)
            ? packageAssignments.length
            : packageAssignments.length + 1
          : packageAssignments.length + 1;
        setPackageAssignments((current) => {
          if (wasEditing) {
            return current.some((assignment) => assignment.id === returnedAssignment.id)
              ? current.map((assignment) =>
                  assignment.id === returnedAssignment.id ? returnedAssignment : assignment
                )
              : [returnedAssignment, ...current];
          }
          return [returnedAssignment, ...current];
        });
        setStudents((current) =>
          current.map((student) => {
            if (student.id !== packageStudentId) return student;
            const currentAssignments = student.package_assignments ?? [];
            const nextAssignments = wasEditing
              ? currentAssignments.some((assignment) => assignment.id === nextSummary.id)
                ? currentAssignments.map((assignment) =>
                    assignment.id === nextSummary.id ? nextSummary : assignment
                  )
                : [nextSummary, ...currentAssignments]
              : [nextSummary, ...currentAssignments];
            return {
              ...student,
              package_assignments: nextAssignments,
            };
          })
        );
        resetPackageForm(null, null, nextPackageAssignmentCount === 0 ? "create" : "hidden");
      } else {
        const assignments = await loadPackageAssignments(packageStudentId);
        resetPackageForm(null, null, assignments.length === 0 ? "create" : "hidden");
      }

      setPackageSuccess(wasEditing ? "Package assignment updated successfully." : "Package assignment added successfully.");
      clearPackageSuccessSoon();
    } catch (caughtError) {
      setPackageError(caughtError instanceof Error ? caughtError.message : "Failed to save package assignment");
    } finally {
      setPackageBusy(false);
    }
  };

  const deletePackageAssignment = async (assignmentId: string) => {
    if (!packageStudentId) return;
    const confirmed = window.confirm("Cancel this package assignment?");
    if (!confirmed) return;

    setPackageBusy(true);
    setPackageError("");
    setPackageSuccess("");
    try {
      const response = await authFetch(
        `/api/admin/online/package-assignments/${encodeURIComponent(assignmentId)}`,
        { method: "DELETE" }
      );
      const payload = (await response.json()) as { assignment?: PackageAssignmentDetail; error?: string };
      if (!response.ok) {
        throw new Error(extractError(payload, "Failed to cancel package assignment"));
      }

      const returnedAssignment = payload.assignment;
      if (returnedAssignment) {
        const nextSummary = toPackageAssignmentSummary(returnedAssignment);
        setPackageAssignments((current) =>
          current.some((assignment) => assignment.id === returnedAssignment.id)
            ? current.map((assignment) =>
                assignment.id === returnedAssignment.id ? returnedAssignment : assignment
              )
            : [returnedAssignment, ...current]
        );
        setStudents((current) =>
          current.map((student) => {
            if (student.id !== packageStudentId) return student;
            const currentAssignments = student.package_assignments ?? [];
            const nextAssignments = currentAssignments.some((assignment) => assignment.id === nextSummary.id)
              ? currentAssignments.map((assignment) =>
                  assignment.id === nextSummary.id ? nextSummary : assignment
                )
              : [nextSummary, ...currentAssignments];
            return {
              ...student,
              package_assignments: nextAssignments,
            };
          })
        );
        resetPackageForm(null, null, "hidden");
      } else {
        const assignments = await loadPackageAssignments(packageStudentId);
        resetPackageForm(null, null, assignments.length === 0 ? "create" : "hidden");
      }
      setPackageSuccess("Package assignment cancelled successfully.");
      clearPackageSuccessSoon();
    } catch (caughtError) {
      setPackageError(caughtError instanceof Error ? caughtError.message : "Failed to cancel package assignment");
    } finally {
      setPackageBusy(false);
    }
  };

  const handleStageChartSelect = useCallback(
    (stageKey: string) => {
      setFilterStage(stageKey === "unassigned" ? "" : stageKey);
      setFilterTeacher("");
      scrollToStudentList();
    },
    [scrollToStudentList]
  );

  const handleTeacherChartSelect = useCallback(
    (teacherId: string) => {
      setFilterTeacher(teacherId);
      setFilterStage("");
      scrollToStudentList();
    },
    [scrollToStudentList]
  );

  const clearFilters = () => {
    setSearchTerm("");
    setFilterTeacher("");
    setFilterStage("");
  };

  const handleAddStudent = async () => {
    const name = newStudentName.trim();
    if (!name) return;

    setBusy(true);
    setError("");
    setSuccess("");

    try {
      const response = await authFetch("/api/admin/online/students", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          assigned_teacher_id: newStudentTeacherId || null,
          parent_name: newStudentParentName.trim() || null,
          parent_contact_number: newStudentParentContactNumber.trim() || null,
        }),
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(extractError(payload, "Failed to add online student"));
      }

      await refreshData(false);
      setNewStudentName("");
      setNewStudentTeacherId("");
      setNewStudentParentName("");
      setNewStudentParentContactNumber("");
      setIsAddStudentModalOpen(false);
      setSuccess("Online student added successfully.");
      clearSuccessSoon();
    } catch (addError) {
      setError(addError instanceof Error ? addError.message : "Failed to add online student");
    } finally {
      setBusy(false);
    }
  };

  const handleStartEditStudent = (student: OnlineStudent) => {
    setEditStudentId(student.id);
    setEditStudentForm({
      name: student.name,
      assigned_teacher_id: student.assigned_teacher_id ?? "",
      parent_name: student.parent_name ?? "",
      parent_contact_number: student.parent_contact_number ?? "",
      crm_stage: normalizeStageKey(student.crm_stage),
      crm_status_reason: student.crm_status_reason ?? "",
    });
  };

  const handleSaveEditStudent = async (studentId: string) => {
    const name = editStudentForm.name.trim();
    if (!name) return;

    setBusy(true);
    setError("");
    setSuccess("");

    try {
      const response = await authFetch("/api/admin/online/students", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: studentId,
          name,
          assigned_teacher_id: editStudentForm.assigned_teacher_id || null,
          parent_name: editStudentForm.parent_name.trim() || null,
          parent_contact_number: editStudentForm.parent_contact_number.trim() || null,
          crm_stage: editStudentForm.crm_stage || null,
          crm_status_reason: editStudentForm.crm_status_reason.trim() || null,
        }),
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(extractError(payload, "Failed to update online student"));
      }

      await refreshData(false);
      setEditStudentId(null);
      setSuccess("Online student updated successfully.");
      clearSuccessSoon();
    } catch (editError) {
      setError(editError instanceof Error ? editError.message : "Failed to update online student");
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteStudent = async (studentId: string) => {
    const confirmed = window.confirm("Are you sure you want to delete this online student?");
    if (!confirmed) return;

    setBusy(true);
    setError("");
    setSuccess("");

    try {
      const response = await authFetch(`/api/admin/online/students?id=${encodeURIComponent(studentId)}`, {
        method: "DELETE",
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(extractError(payload, "Failed to delete online student"));
      }

      await refreshData(false);
      setClaimLinkResultsByStudentId((prev) => {
        if (!prev[studentId]) return prev;
        const next = { ...prev };
        delete next[studentId];
        return next;
      });
      setClaimErrorsByStudentId((prev) => {
        if (!prev[studentId]) return prev;
        const next = { ...prev };
        delete next[studentId];
        return next;
      });
      setFamilyClaimStudentIds((current) => current.filter((id) => id !== studentId));
      setActiveClaimStudentId((current) => (current === studentId ? null : current));
      setSuccess("Online student deleted successfully.");
      clearSuccessSoon();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Failed to delete online student");
    } finally {
      setBusy(false);
    }
  };

  const handleGenerateClaimLink = useCallback(async (studentId: string) => {
    setClaimBusyStudentId(studentId);
    setClaimErrorsByStudentId((prev) => {
      if (!prev[studentId]) return prev;
      return { ...prev, [studentId]: "" };
    });
    try {
      const response = await authFetch("/api/admin/online/claim-links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ student_id: studentId }),
      });
      const payload = (await response.json()) as ClaimLinkResult & { error?: string };
      if (!response.ok) {
        throw new Error(extractError(payload, "Failed to generate claim link"));
      }
      setClaimLinkResultsByStudentId((prev) => ({
        ...prev,
        [studentId]: {
          student_id: payload.student_id,
          student_name: payload.student_name,
          claim_url: payload.claim_url,
          expires_at: payload.expires_at,
        },
      }));
      setClaimErrorsByStudentId((prev) => {
        if (!prev[studentId]) return prev;
        return { ...prev, [studentId]: "" };
      });
      setActiveClaimStudentId(studentId);
    } catch (claimError) {
      setClaimErrorsByStudentId((prev) => ({
        ...prev,
        [studentId]: claimError instanceof Error ? claimError.message : "Failed to generate claim link",
      }));
      setActiveClaimStudentId(studentId);
    } finally {
      setClaimBusyStudentId(null);
    }
  }, []);

  const handleToggleClaimPanel = useCallback((studentId: string) => {
    setActiveClaimStudentId((current) => (current === studentId ? null : studentId));
  }, []);

  const toggleFamilyClaimStudent = (studentId: string) => {
    setFamilyClaimStudentIds((current) =>
      current.includes(studentId)
        ? current.filter((id) => id !== studentId)
        : [...current, studentId]
    );
    setFamilyClaimError("");
    setFamilyClaimResult(null);
    setFamilyClaimCopyMessage("");
  };

  const handleGenerateFamilyClaimLink = async () => {
    if (familyClaimStudentIds.length < 2) {
      setFamilyClaimError("Select at least two students for a family claim link.");
      return;
    }

    setFamilyClaimBusy(true);
    setFamilyClaimError("");
    setFamilyClaimResult(null);
    setFamilyClaimCopyMessage("");

    try {
      const response = await authFetch("/api/admin/online/family-claim-links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ student_ids: familyClaimStudentIds }),
      });
      const payload = (await response.json()) as FamilyClaimLinkResult & { error?: string };
      if (!response.ok) {
        throw new Error(extractError(payload, "Failed to generate family claim link"));
      }
      setFamilyClaimResult({
        student_ids: payload.student_ids ?? familyClaimStudentIds,
        student_names: payload.student_names ?? [],
        claim_url: payload.claim_url,
        expires_at: payload.expires_at,
      });
    } catch (claimError) {
      setFamilyClaimError(
        claimError instanceof Error ? claimError.message : "Failed to generate family claim link"
      );
    } finally {
      setFamilyClaimBusy(false);
    }
  };

  const handleCopyFamilyClaimLink = async () => {
    if (!familyClaimResult?.claim_url) return;
    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error("Clipboard API unavailable");
      }
      await navigator.clipboard.writeText(familyClaimResult.claim_url);
      setFamilyClaimCopyMessage("Family claim link copied.");
    } catch {
      const input = familyClaimInputRef.current;
      if (input) {
        input.focus();
        input.select();
        input.setSelectionRange(0, input.value.length);
      }

      try {
        const copied = document.execCommand("copy");
        setFamilyClaimCopyMessage(
          copied
            ? "Family claim link copied."
            : "Copy is blocked here. The link is selected for manual copy."
        );
      } catch {
        setFamilyClaimCopyMessage("Copy is blocked here. The link is selected for manual copy.");
      }
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#f8fafc] via-[#e2e8f0] to-[#f1f5f9]">
      <AdminNavbar />
      <div className="relative p-4 sm:p-6">
        <header className="mb-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-800">Online Student Management</h1>
              <p className="text-gray-600">
                Manage students, teacher assignment, and CRM progress.
              </p>
            </div>
            <AdminScopeSwitch />
          </div>
        </header>

        {error && (
          <Card className="mb-4 border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</Card>
        )}
        {success && (
          <Card className="mb-4 border border-green-200 bg-green-50 p-4 text-sm text-green-700">{success}</Card>
        )}

        <Card className="mb-4 border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900">
          Create one-time signup links from the <span className="font-semibold">Portal Access</span> column.
          Only rows marked <span className="font-semibold">Unclaimed</span> can generate a new link.
        </Card>

        <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-6">
          <Card className="p-4">
            <div className="text-2xl font-bold">{students.length}</div>
            <div className="text-sm text-gray-600">Total Online Students</div>
          </Card>
          <Card className="p-4">
            <div className="text-2xl font-bold text-green-600">{assignedTeacherCount}</div>
            <div className="text-sm text-gray-600">Assigned to Teacher</div>
          </Card>
          <Card className="p-4">
            <div className="text-2xl font-bold text-orange-600">{teachersWithStudentsCount}</div>
            <div className="text-sm text-gray-600">Teachers with Online Students</div>
          </Card>
          <Card className="p-4">
            <div className="text-2xl font-bold text-purple-600">{activeCrmCount}</div>
            <div className="text-sm text-gray-600">CRM Active</div>
          </Card>
          <Card className="p-4">
            <div className="text-2xl font-bold text-sky-600">{claimedPortalCount}</div>
            <div className="text-sm text-gray-600">Claimed Portals</div>
          </Card>
          {filteredStudents.length !== students.length ? (
            <Card className="p-4">
              <div className="text-2xl font-bold text-blue-600">{filteredStudents.length}</div>
              <div className="text-sm text-gray-600">Filtered Results</div>
            </Card>
          ) : (
            <Card className="p-4">
              <div className="text-2xl font-bold text-indigo-600">{requiresFollowUpCount || unassignedTeacherCount}</div>
              <div className="text-sm text-gray-600">Need Follow-up</div>
            </Card>
          )}
        </div>

        <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card className="p-6">
            <h3 className="mb-4 text-lg font-semibold text-gray-800">Online CRM Stage Distribution</h3>
            <ClassDistributionChart students={stageChartStudents} onSelectClass={handleStageChartSelect} />
          </Card>
          <Card className="p-6">
            <h3 className="mb-4 text-lg font-semibold text-gray-800">Online Teacher Assignment</h3>
            <TeacherAssignmentChart
              students={teacherChartStudents}
              teachers={teacherChartTeachers}
              onSelectTeacher={handleTeacherChartSelect}
            />
          </Card>
        </div>

        <div className="mb-6 flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={clearFilters}
            disabled={!searchTerm && !filterTeacher && !filterStage}
            className="inline-flex items-center justify-center gap-2 rounded-full border border-gray-200 bg-white px-5 py-3 text-sm font-semibold text-gray-800 shadow-md transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RotateCcw className="h-4 w-4 text-gray-700" />
            Reset Filters
          </button>
          <button
            type="button"
            onClick={() => setIsAddStudentModalOpen(true)}
            className="inline-flex items-center justify-center gap-2 rounded-full bg-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-md transition hover:bg-blue-700"
          >
            <Plus className="h-4 w-4 text-white" />
            Add Student
          </button>
        </div>

        <Card className="p-4" ref={studentListRef}>
          <div className="mb-4 flex items-baseline justify-between">
            <h2 className="text-xl font-semibold text-gray-900">Online Students List</h2>
            {filteredStudents.length !== students.length ? (
              <span className="text-sm text-gray-500">
                {filteredStudents.length} of {students.length} students
              </span>
            ) : (
              <span className="text-sm text-gray-500">{students.length} students</span>
            )}
          </div>

          <div className="mb-4 grid grid-cols-1 gap-4 md:grid-cols-3">
            <input
              type="text"
              placeholder="Search by student or parent..."
              className="w-full rounded-md border border-gray-300 p-2 shadow-sm"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
            />
            <select
              className="w-full rounded-md border border-gray-300 p-2 shadow-sm"
              value={filterTeacher}
              onChange={(event) => setFilterTeacher(event.target.value)}
            >
              <option value="">All Teachers</option>
              <option value="unassigned">Unassigned</option>
              {teachers.map((teacher) => (
                <option key={teacher.id} value={teacher.id}>
                  {teacher.name}
                </option>
              ))}
            </select>
            <select
              className="w-full rounded-md border border-gray-300 p-2 shadow-sm"
              value={filterStage}
              onChange={(event) => setFilterStage(event.target.value)}
            >
              <option value="">All CRM Stages</option>
              {stageOptions.map((stage) => (
                <option key={stage} value={stage}>
                  {formatStageLabel(stage)}
                </option>
              ))}
            </select>
          </div>

          <div className="overflow-x-auto rounded-lg border">
            <div className="border-b border-slate-200 bg-slate-50 p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-slate-900">Family Claim Link</h2>
                  <p className="mt-1 text-sm text-slate-500">
                    Select 2+ existing students to generate one link for a Family Account.
                  </p>
                </div>
                <Button
                  type="button"
                  onClick={() => void handleGenerateFamilyClaimLink()}
                  disabled={familyClaimBusy || familyClaimStudentIds.length < 2}
                  className="rounded-2xl bg-slate-900 text-white hover:bg-slate-800"
                >
                  {familyClaimBusy
                    ? "Creating..."
                    : `Create Family Link (${familyClaimStudentIds.length})`}
                </Button>
              </div>

              {familyClaimError ? (
                <p className="mt-3 text-sm text-rose-600" role="alert">
                  {familyClaimError}
                </p>
              ) : null}

              {familyClaimResult ? (
                <div className="mt-4 rounded-2xl border border-emerald-200 bg-white p-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">Family claim link ready</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {familyClaimResult.student_names.join(", ")}
                      </p>
                    </div>
                    <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
                      Expires {new Date(familyClaimResult.expires_at).toLocaleDateString("en-MY")}
                    </span>
                  </div>
                  <div className="mt-3 flex flex-col gap-2 md:flex-row">
                    <input
                      ref={familyClaimInputRef}
                      type="text"
                      readOnly
                      value={familyClaimResult.claim_url}
                      className="h-10 flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 font-mono text-xs text-slate-700"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      className="h-10 rounded-xl bg-white"
                      onClick={() => void handleCopyFamilyClaimLink()}
                    >
                      <Copy className="size-4" />
                      Copy
                    </Button>
                  </div>
                  {familyClaimCopyMessage ? (
                    <p className="mt-2 text-sm text-slate-500">{familyClaimCopyMessage}</p>
                  ) : null}
                </div>
              ) : null}
            </div>
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Family
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Student Name
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Parent
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Teacher
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    CRM Stage
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Status Reason
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Packages
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Portal Access
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {filteredStudents.map((student) => {
                  const claimResult = claimLinkResultsByStudentId[student.id] ?? null;
                  const claimError = claimErrorsByStudentId[student.id] ?? null;
                  const isClaimPanelOpen =
                    activeClaimStudentId === student.id &&
                    !student.account_owner_user_id &&
                    (Boolean(claimResult) || Boolean(claimError));

                  return (
                    <React.Fragment key={student.id}>
                    <tr>
                      {editStudentId === student.id ? (
                        <td className="px-4 py-3" colSpan={9}>
                          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                            <div>
                              <label className="mb-1 block text-xs font-medium text-gray-700">Student Name</label>
                              <input
                                type="text"
                                className="w-full rounded-md border border-gray-300 p-2 text-sm shadow-sm"
                                value={editStudentForm.name}
                                onChange={(event) =>
                                  setEditStudentForm((prev) => ({ ...prev, name: event.target.value }))
                                }
                              />
                            </div>
                            <div>
                              <label className="mb-1 block text-xs font-medium text-gray-700">Teacher</label>
                              <select
                                className="w-full rounded-md border border-gray-300 p-2 text-sm shadow-sm"
                                value={editStudentForm.assigned_teacher_id}
                                onChange={(event) =>
                                  setEditStudentForm((prev) => ({
                                    ...prev,
                                    assigned_teacher_id: event.target.value,
                                  }))
                                }
                              >
                                <option value="">No teacher assigned</option>
                                {teachers.map((teacher) => (
                                  <option key={teacher.id} value={teacher.id}>
                                    {teacher.name}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className="mb-1 block text-xs font-medium text-gray-700">Parent Name</label>
                              <input
                                type="text"
                                className="w-full rounded-md border border-gray-300 p-2 text-sm shadow-sm"
                                value={editStudentForm.parent_name}
                                onChange={(event) =>
                                  setEditStudentForm((prev) => ({ ...prev, parent_name: event.target.value }))
                                }
                              />
                            </div>
                            <div>
                              <label className="mb-1 block text-xs font-medium text-gray-700">Parent Contact</label>
                              <input
                                type="text"
                                className="w-full rounded-md border border-gray-300 p-2 text-sm shadow-sm"
                                value={editStudentForm.parent_contact_number}
                                onChange={(event) =>
                                  setEditStudentForm((prev) => ({
                                    ...prev,
                                    parent_contact_number: event.target.value,
                                  }))
                                }
                              />
                            </div>
                            <div>
                              <label className="mb-1 block text-xs font-medium text-gray-700">CRM Stage</label>
                              <select
                                className="w-full rounded-md border border-gray-300 p-2 text-sm shadow-sm"
                                value={editStudentForm.crm_stage}
                                onChange={(event) =>
                                  setEditStudentForm((prev) => ({ ...prev, crm_stage: event.target.value }))
                                }
                              >
                                {stageOptions.map((stage) => (
                                  <option key={stage} value={stage}>
                                    {formatStageLabel(stage)}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className="mb-1 block text-xs font-medium text-gray-700">Status Reason</label>
                              <input
                                type="text"
                                className="w-full rounded-md border border-gray-300 p-2 text-sm shadow-sm"
                                value={editStudentForm.crm_status_reason}
                                onChange={(event) =>
                                  setEditStudentForm((prev) => ({
                                    ...prev,
                                    crm_status_reason: event.target.value,
                                  }))
                                }
                              />
                            </div>
                          </div>
                          <div className="mt-4 flex flex-col items-start gap-2">
                            <button
                              type="button"
                              onClick={() => handleSaveEditStudent(student.id)}
                              disabled={busy}
                              className="rounded bg-blue-600 px-3 py-1 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
                            >
                              {busy ? "Saving..." : "Save"}
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditStudentId(null)}
                              className="rounded bg-gray-500 px-3 py-1 text-sm text-white hover:bg-gray-600"
                            >
                              Cancel
                            </button>
                          </div>
                        </td>
                      ) : (
                        <>
                          <td className="px-4 py-3">
                            <input
                              type="checkbox"
                              checked={familyClaimStudentIds.includes(student.id)}
                              onChange={() => toggleFamilyClaimStudent(student.id)}
                              aria-label={`Select ${student.name} for family claim`}
                              className="size-4 rounded border-slate-300 text-slate-900"
                            />
                            {student.parent_id ? (
                              <p className="mt-1 text-[11px] text-amber-600">Linked</p>
                            ) : null}
                          </td>
                          <td className="px-4 py-3 font-medium text-gray-900">{student.name}</td>
                          <td className="px-4 py-3 text-gray-600">
                            {student.parent_name || "-"}
                            {student.parent_contact_number ? ` (${student.parent_contact_number})` : ""}
                          </td>
                          <td className="px-4 py-3 text-gray-600">
                            {student.assigned_teacher_id ? teacherById.get(student.assigned_teacher_id) ?? "-" : "-"}
                          </td>
                          <td className="px-4 py-3 text-gray-600">
                            {formatStageLabel(normalizeStageKey(student.crm_stage))}
                          </td>
                          <td className="px-4 py-3 text-gray-600">{student.crm_status_reason ?? "-"}</td>
                          <td className="px-4 py-3 text-gray-600">
                            <div className="flex flex-wrap gap-2">
                              {(student.package_assignments ?? []).slice(0, 2).map((assignment) => (
                                <span
                                  key={assignment.id}
                                  className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-medium text-slate-700"
                                >
                                  {assignment.course_name} • {scheduleStateLabel(assignment.schedule_state)}
                                </span>
                              ))}
                              {(student.package_assignments ?? []).length === 0 ? (
                                <span className="text-xs text-gray-400">No package assigned</span>
                              ) : null}
                              {(student.package_assignments ?? []).length > 2 ? (
                                <span className="rounded-full border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600">
                                  +{(student.package_assignments ?? []).length - 2} more
                                </span>
                              ) : null}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-gray-600">
                            <AdminOnlineClaimAccessCell
                              studentId={student.id}
                              studentName={student.name}
                              claimed={Boolean(student.account_owner_user_id)}
                              hasLink={Boolean(claimResult)}
                              isExpanded={isClaimPanelOpen}
                              isGenerating={claimBusyStudentId === student.id}
                              error={isClaimPanelOpen ? null : claimError}
                              onGenerate={handleGenerateClaimLink}
                              onToggleExpanded={handleToggleClaimPanel}
                            />
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex min-w-[150px] flex-col gap-2">
                              <Button
                                type="button"
                                onClick={() => handleStartEditStudent(student)}
                                disabled={busy}
                                variant="outline"
                                size="sm"
                                className="justify-start rounded-2xl border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                              >
                                Edit
                              </Button>
                              <Button
                                type="button"
                                onClick={() => void openPackageManager(student)}
                                disabled={packageBusy}
                                variant="ghost"
                                size="sm"
                                className="justify-start rounded-2xl text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                              >
                                {packageStudentId === student.id ? "Hide Packages" : "Show Packages"}
                              </Button>
                              <Button
                                type="button"
                                onClick={() => handleDeleteStudent(student.id)}
                                disabled={busy}
                                variant="destructive"
                                size="sm"
                                className="justify-start rounded-2xl"
                              >
                                Delete
                              </Button>
                            </div>
                          </td>
                        </>
                      )}
                    </tr>
                    {isClaimPanelOpen && editStudentId !== student.id ? (
                      <tr>
                        <td colSpan={9} className="bg-slate-50 px-4 pb-4 pt-0">
                          <AdminOnlineClaimPanel
                            studentName={student.name}
                            result={claimResult}
                            error={claimError}
                            isGenerating={claimBusyStudentId === student.id}
                            onGenerate={() => void handleGenerateClaimLink(student.id)}
                          />
                        </td>
                      </tr>
                    ) : null}
                    {packageStudentId === student.id && editStudentId !== student.id ? (
                      <tr>
                        <td colSpan={9} className="bg-slate-50 px-4 py-4">
                          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                              <div>
                                <h3 className="text-lg font-semibold text-slate-900">Package Assignments</h3>
                                <p className="text-sm text-slate-500">
                                  Assign course and teacher here. Slot scheduling happens later.
                                </p>
                              </div>
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
                                  {student.name}
                                </span>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleAddPackageAssignment(student)}
                                  disabled={packageBusy || packageLoading}
                                >
                                  Add Package
                                </Button>
                              </div>
                            </div>

                            {packageError && (
                              <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                                {packageError}
                              </div>
                            )}
                            {packageSuccess && (
                              <div className="mt-4 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
                                {packageSuccess}
                              </div>
                            )}

                            <div className="mt-5">
                              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                                Current Assignments
                              </p>
                              {packageLoading ? (
                                <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">
                                  Loading package assignments...
                                </div>
                              ) : packageAssignments.length === 0 ? (
                                <div className="mt-3 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">
                                  No package assignments yet.
                                </div>
                              ) : (
                                <div className="mt-3 grid gap-3 md:grid-cols-2">
                                  {packageAssignments.map((assignment) => (
                                    <div
                                      key={assignment.id}
                                      className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4"
                                    >
                                      <div className="flex flex-wrap items-center gap-2">
                                        <span className="text-sm font-semibold text-slate-900">
                                          {assignment.course_name}
                                        </span>
                                        <span className="rounded-full bg-white px-2 py-1 text-[11px] font-semibold text-slate-600">
                                          {packageStatusLabel(assignment.status)}
                                        </span>
                                        <span className="rounded-full bg-white px-2 py-1 text-[11px] font-semibold text-rose-600">
                                          {scheduleStateLabel(assignment.schedule_state)}
                                        </span>
                                      </div>
                                      <p className="mt-2 text-sm text-slate-600">
                                        Teacher: <span className="font-medium text-slate-900">{assignment.teacher_name}</span>
                                      </p>
                                      <p className="mt-1 text-sm text-slate-600">
                                        Start: <span className="font-medium text-slate-900">{assignment.effective_from}</span>
                                      </p>
                                      <p className="mt-1 text-sm text-slate-600">
                                        Weekly Slots:{" "}
                                        <span className="font-medium text-slate-900">
                                          {assignment.sessions_per_week_snapshot}
                                        </span>
                                      </p>
                                      {assignment.notes ? (
                                        <p className="mt-1 text-sm text-slate-600">{assignment.notes}</p>
                                      ) : null}
                                      <div className="mt-4 flex gap-2">
                                        <Button
                                          type="button"
                                          variant="outline"
                                          onClick={() => handleEditPackageAssignment(student, assignment)}
                                          disabled={packageBusy}
                                        >
                                          Edit Details
                                        </Button>
                                        <Button
                                          type="button"
                                          className="bg-rose-600 text-white hover:bg-rose-700"
                                          onClick={() => void deletePackageAssignment(assignment.id)}
                                          disabled={packageBusy}
                                        >
                                          Cancel Package
                                        </Button>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>

                            {packageFormMode !== "hidden" ? (
                              <div ref={packageFormRef} className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                                  <div>
                                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                                      {packageFormMode === "edit" ? "Edit Package" : "Add Package"}
                                    </p>
                                    <h4 className="mt-1 text-base font-semibold text-slate-900">
                                      {packageFormMode === "edit"
                                        ? "Update this assignment"
                                        : "Create a new package assignment"}
                                    </h4>
                                    <p className="mt-1 text-sm text-slate-500">
                                      {packageFormMode === "edit"
                                        ? "Change the course, teacher, or status for the selected assignment."
                                        : "Use this form only when you need to add another package for this student."}
                                    </p>
                                  </div>
                                  {packageAssignments.length > 0 ? (
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      onClick={() => handleDismissPackageForm(student)}
                                      disabled={packageBusy}
                                    >
                                      {packageFormMode === "edit" ? "Cancel Edit" : "Hide Form"}
                                    </Button>
                                  ) : null}
                                </div>

                                <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                                  <div>
                                    <label className="mb-1 block text-xs font-medium text-slate-700">Course / Offer</label>
                                    <select
                                      className="w-full rounded-md border border-gray-300 p-2 text-sm shadow-sm"
                                      value={packageForm.course_id}
                                      onChange={(event) =>
                                        setPackageForm((prev) => ({ ...prev, course_id: event.target.value }))
                                      }
                                    >
                                      <option value="">Select course</option>
                                      {courses
                                        .filter((course) => course.is_active !== false || course.id === packageForm.course_id)
                                        .map((course) => (
                                          <option key={course.id} value={course.id}>
                                            {course.name}{course.is_active === false ? " (inactive)" : ""}
                                          </option>
                                        ))}
                                    </select>
                                  </div>
                                  <div>
                                    <label className="mb-1 block text-xs font-medium text-slate-700">Teacher</label>
                                    <select
                                      className="w-full rounded-md border border-gray-300 p-2 text-sm shadow-sm"
                                      value={packageForm.teacher_id}
                                      onChange={(event) =>
                                        setPackageForm((prev) => ({ ...prev, teacher_id: event.target.value }))
                                      }
                                    >
                                      <option value="">Select teacher</option>
                                      {teachers.map((teacher) => (
                                        <option key={teacher.id} value={teacher.id}>
                                          {teacher.name}
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                  <div>
                                    <label className="mb-1 block text-xs font-medium text-slate-700">Status</label>
                                    <select
                                      className="w-full rounded-md border border-gray-300 p-2 text-sm shadow-sm"
                                      value={packageForm.status}
                                      onChange={(event) =>
                                        setPackageForm((prev) => ({ ...prev, status: event.target.value }))
                                      }
                                    >
                                      {PACKAGE_STATUS_OPTIONS.map((status) => (
                                        <option key={status} value={status}>
                                          {packageStatusLabel(status)}
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                  <div>
                                    <label className="mb-1 block text-xs font-medium text-slate-700">Start Month</label>
                                    <input
                                      type="month"
                                      className="w-full rounded-md border border-gray-300 p-2 text-sm shadow-sm"
                                      value={packageForm.effective_from}
                                      onChange={(event) =>
                                        setPackageForm((prev) => ({ ...prev, effective_from: event.target.value }))
                                      }
                                    />
                                  </div>
                                  <div className="md:col-span-2">
                                    <label className="mb-1 block text-xs font-medium text-slate-700">Notes</label>
                                    <textarea
                                      className="w-full rounded-md border border-gray-300 p-2 text-sm shadow-sm"
                                      rows={3}
                                      value={packageForm.notes}
                                      onChange={(event) =>
                                        setPackageForm((prev) => ({ ...prev, notes: event.target.value }))
                                      }
                                    />
                                  </div>
                                </div>

                                <div className="mt-4 flex flex-wrap gap-2">
                                  <Button
                                    type="button"
                                    onClick={() => void submitPackageAssignment()}
                                    disabled={packageBusy}
                                    className="bg-emerald-600 text-white hover:bg-emerald-700"
                                  >
                                    {packageBusy ? "Saving..." : packageFormMode === "edit" ? "Update Package" : "Save Package"}
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => resetPackageForm(student, null, "create")}
                                    disabled={packageBusy}
                                  >
                                    Reset Form
                                  </Button>
                                </div>
                              </div>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    ) : null}
                    </React.Fragment>
                  );
                })}
                {loading && (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-gray-500">
                      Loading online students...
                    </td>
                  </tr>
                )}
                {!loading && filteredStudents.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-gray-500">
                      No online students match the current filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>

        {isAddStudentModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="max-h-[85vh] w-full max-w-3xl overflow-hidden rounded-2xl bg-white shadow-xl">
              <div className="flex items-start justify-between border-b border-gray-100 p-6">
                <div>
                  <h2 className="text-xl font-semibold text-gray-900">Add Online Student</h2>
                  <p className="text-sm text-gray-500">Create a new online student record.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsAddStudentModalOpen(false)}
                  className="p-1 text-gray-400 hover:text-gray-600"
                  aria-label="Close add student modal"
                >
                  <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="max-h-[calc(85vh-96px)] space-y-4 overflow-y-auto p-6">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700">
                      Student Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      placeholder="Enter student name"
                      className="w-full rounded-md border border-gray-300 p-2 shadow-sm"
                      value={newStudentName}
                      onChange={(event) => setNewStudentName(event.target.value)}
                      required
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700">Teacher (Optional)</label>
                    <select
                      className="w-full rounded-md border border-gray-300 p-2 shadow-sm"
                      value={newStudentTeacherId}
                      onChange={(event) => setNewStudentTeacherId(event.target.value)}
                    >
                      <option value="">No teacher assigned</option>
                      {teachers.map((teacher) => (
                        <option key={teacher.id} value={teacher.id}>
                          {teacher.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700">Parent Name</label>
                    <input
                      type="text"
                      placeholder="Enter parent name"
                      className="w-full rounded-md border border-gray-300 p-2 shadow-sm"
                      value={newStudentParentName}
                      onChange={(event) => setNewStudentParentName(event.target.value)}
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700">Parent Contact Number</label>
                    <input
                      type="text"
                      placeholder="Enter contact number"
                      className="w-full rounded-md border border-gray-300 p-2 shadow-sm"
                      value={newStudentParentContactNumber}
                      onChange={(event) => setNewStudentParentContactNumber(event.target.value)}
                    />
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button
                    type="button"
                    onClick={handleAddStudent}
                    disabled={!newStudentName.trim() || busy}
                    className="bg-green-600 text-white hover:bg-green-700"
                  >
                    {busy ? "Adding..." : "Add Student"}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
