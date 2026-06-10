"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  Copy,
  EyeOff,
  GitMerge,
  MoreHorizontal,
  Package,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
  Users,
} from "lucide-react";
import AdminNavbar from "@/components/admin/AdminNavbar";
import AdminScopeSwitch from "@/components/admin/AdminScopeSwitch";
import ClassDistributionChart from "@/components/admin/ClassDistributionChart";
import TeacherAssignmentChart from "@/components/admin/TeacherAssignmentChart";
import {
  AdminOnlineClaimAccessCell,
  AdminOnlineClaimPanel,
  type ClaimLinkResult,
} from "@/components/admin/online/AdminOnlineClaimAccess";
import { Button } from "@/components/ui/Button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { authFetch } from "@/lib/authFetch";

type OnlineStudent = {
  id: string;
  name: string;
  parent_id?: string | null;
  assigned_teacher_id: string | null;
  account_owner_user_id?: string | null;
  online_family_linked?: boolean;
  parent_name?: string | null;
  parent_contact_number?: string | null;
  crm_stage?: string | null;
  crm_status_reason?: string | null;
  package_assignments?: PackageAssignmentSummary[];
  duplicate_candidates?: DuplicateCandidateSummary[];
};

type OnlineStudentDisplayRow = {
  student: OnlineStudent;
  familyGroupKey: string | null;
  familySize: number;
  isFamilyGroupStart: boolean;
  isFamilyGroupEnd: boolean;
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

type DuplicateCandidateSummary = {
  duplicate_group_id: string;
  canonical_student_id: string;
  duplicate_student_id: string;
  confidence: "high" | "medium";
  reason: string;
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

type FamilyRecoveryResult = {
  family_user_id: string;
  linked_student_ids: string[];
  unlinked_student_ids?: string[];
  promoted_user: boolean;
};

type FamilyRecoveryLearnerRow = {
  student: OnlineStudent;
  isMember: boolean;
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

const isOnlineFamilyLinked = (student: Pick<OnlineStudent, "online_family_linked">) =>
  Boolean(student.online_family_linked);

const getOnlineFamilyGroupKey = (
  student: Pick<OnlineStudent, "online_family_linked" | "parent_id">
) => (isOnlineFamilyLinked(student) && student.parent_id ? student.parent_id : null);

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
  const [showCharts, setShowCharts] = useState(false);
  const [familyMode, setFamilyMode] = useState(false);

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
  const [familyRecoveryStudentId, setFamilyRecoveryStudentId] = useState<string | null>(null);
  const [familyRecoverySearch, setFamilyRecoverySearch] = useState("");
  const [familyRecoveryBusy, setFamilyRecoveryBusy] = useState(false);
  const [familyRecoveryError, setFamilyRecoveryError] = useState("");

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
  const studentById = useMemo(() => new Map(students.map((student) => [student.id, student])), [students]);

  useEffect(() => {
    setFamilyClaimStudentIds((current) =>
      current.filter((studentId) => {
        const student = studentById.get(studentId);
        return student ? !isOnlineFamilyLinked(student) : false;
      })
    );
  }, [studentById]);

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

  const displayStudentRows = useMemo<OnlineStudentDisplayRow[]>(() => {
    const studentsByFamilyKey = new Map<string, OnlineStudent[]>();
    const familySizesByKey = new Map<string, number>();

    students.forEach((student) => {
      const familyGroupKey = getOnlineFamilyGroupKey(student);
      if (!familyGroupKey) return;
      familySizesByKey.set(familyGroupKey, (familySizesByKey.get(familyGroupKey) ?? 0) + 1);
    });

    filteredStudents.forEach((student) => {
      const familyGroupKey = getOnlineFamilyGroupKey(student);
      if (!familyGroupKey) return;
      const group = studentsByFamilyKey.get(familyGroupKey) ?? [];
      group.push(student);
      studentsByFamilyKey.set(familyGroupKey, group);
    });

    studentsByFamilyKey.forEach((group) => {
      group.sort((a, b) => a.name.localeCompare(b.name));
    });

    const renderedFamilyKeys = new Set<string>();
    const rows: OnlineStudentDisplayRow[] = [];

    filteredStudents.forEach((student) => {
      const familyGroupKey = getOnlineFamilyGroupKey(student);

      if (!familyGroupKey) {
        rows.push({
          student,
          familyGroupKey: null,
          familySize: 1,
          isFamilyGroupStart: false,
          isFamilyGroupEnd: false,
        });
        return;
      }

      if (renderedFamilyKeys.has(familyGroupKey)) return;
      renderedFamilyKeys.add(familyGroupKey);

      const familyStudents = studentsByFamilyKey.get(familyGroupKey) ?? [student];
      familyStudents.forEach((familyStudent, familyIndex) => {
        rows.push({
          student: familyStudent,
          familyGroupKey,
          familySize: familySizesByKey.get(familyGroupKey) ?? familyStudents.length,
          isFamilyGroupStart: familyIndex === 0,
          isFamilyGroupEnd: familyIndex === familyStudents.length - 1,
        });
      });
    });

    return rows;
  }, [filteredStudents, students]);

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

  const familyRecoveryStudent = useMemo(
    () => students.find((student) => student.id === familyRecoveryStudentId) ?? null,
    [familyRecoveryStudentId, students]
  );

  const familyRecoveryOwnerId =
    familyRecoveryStudent?.parent_id ?? familyRecoveryStudent?.account_owner_user_id ?? null;

  const familyRecoveryCurrentMembers = useMemo(() => {
    if (!familyRecoveryStudent) return [];
    const members = familyRecoveryOwnerId
      ? students.filter(
          (student) =>
            student.parent_id === familyRecoveryOwnerId || student.id === familyRecoveryStudent.id
        )
      : [familyRecoveryStudent];
    const uniqueMembers = new Map(members.map((student) => [student.id, student]));
    return Array.from(uniqueMembers.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [familyRecoveryOwnerId, familyRecoveryStudent, students]);

  const familyRecoveryCurrentMemberIds = useMemo(
    () => new Set(familyRecoveryCurrentMembers.map((student) => student.id)),
    [familyRecoveryCurrentMembers]
  );

  const familyRecoveryCandidates = useMemo(() => {
    if (!familyRecoveryStudent) return [];
    const term = familyRecoverySearch.trim().toLowerCase();
    return students
      .filter((student) => student.id !== familyRecoveryStudent.id)
      .filter((student) => !familyRecoveryCurrentMemberIds.has(student.id))
      .filter((student) => !isOnlineFamilyLinked(student))
      .filter((student) => {
        if (!term) return true;
        return (
          student.name.toLowerCase().includes(term) ||
          (student.parent_name ?? "").toLowerCase().includes(term) ||
          (student.parent_contact_number ?? "").toLowerCase().includes(term)
        );
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [familyRecoveryCurrentMemberIds, familyRecoverySearch, familyRecoveryStudent, students]);

  const familyRecoveryVisibleLearners = useMemo<FamilyRecoveryLearnerRow[]>(() => {
    if (!familyRecoveryStudent) return [];
    const term = familyRecoverySearch.trim().toLowerCase();
    const matchesTerm = (student: OnlineStudent) =>
      !term ||
      student.name.toLowerCase().includes(term) ||
      (student.parent_name ?? "").toLowerCase().includes(term) ||
      (student.parent_contact_number ?? "").toLowerCase().includes(term);
    const currentRows = familyRecoveryCurrentMembers
      .filter(matchesTerm)
      .map((student) => ({ student, isMember: true }));
    const candidateRows = familyRecoveryCandidates.map((student) => ({
      student,
      isMember: false,
    }));
    return [...currentRows, ...candidateRows];
  }, [
    familyRecoveryCandidates,
    familyRecoveryCurrentMembers,
    familyRecoverySearch,
    familyRecoveryStudent,
  ]);

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

  const handleDuplicateAction = async (
    candidate: DuplicateCandidateSummary,
    action: "ignore" | "merge"
  ) => {
    const describeDuplicateRecord = (
      studentId: string,
      portalLabel?: "receives login" | "login moves out"
    ) => {
      const record = studentById.get(studentId);
      if (!record) return studentId;

      const teacher = record.assigned_teacher_id
        ? teacherById.get(record.assigned_teacher_id) ?? "Teacher assigned"
        : "No teacher";
      const packageCount = record.package_assignments?.length ?? 0;
      const packages = packageCount > 0 ? `${packageCount} package` : "No package";
      const portal =
        portalLabel ??
        (record.account_owner_user_id ? "claimed portal" : "no portal");

      return `${record.name} · ${teacher} · ${packages} · ${portal}`;
    };
    const canonicalRecord = studentById.get(candidate.canonical_student_id);
    const duplicateRecord = studentById.get(candidate.duplicate_student_id);
    const loginMovesToKeptRecord =
      !canonicalRecord?.account_owner_user_id && Boolean(duplicateRecord?.account_owner_user_id);

    const confirmed = window.confirm(
      action === "ignore"
        ? `Ignore duplicate suggestion?\n\n${candidate.reason}\n\nNo records will be changed.`
        : [
            "Merge duplicate?",
            "",
            `Keep active record: ${describeDuplicateRecord(
              candidate.canonical_student_id,
              loginMovesToKeptRecord ? "receives login" : undefined
            )}`,
            `Archive duplicate record: ${describeDuplicateRecord(
              candidate.duplicate_student_id,
              loginMovesToKeptRecord ? "login moves out" : undefined
            )}`,
            "",
            "The claimed login stays active on the kept record.",
            "Only the duplicate student record is hidden for audit and recovery.",
          ].join("\n")
    );
    if (!confirmed) return;

    setBusy(true);
    setError("");
    setSuccess("");

    try {
      const response = await authFetch(
        `/api/admin/online/duplicates/${encodeURIComponent(candidate.duplicate_group_id)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action,
            canonical_student_id: candidate.canonical_student_id,
            duplicate_student_id: candidate.duplicate_student_id,
          }),
        }
      );
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(extractError(payload, "Failed to update duplicate records"));
      }

      await refreshData(false);
      setSuccess(
        action === "ignore"
          ? "Duplicate suggestion ignored."
          : "Duplicate merged and archived."
      );
      clearSuccessSoon();
    } catch (duplicateError) {
      setError(
        duplicateError instanceof Error
          ? duplicateError.message
          : "Failed to update duplicate records"
      );
    } finally {
      setBusy(false);
    }
  };

  const handleGenerateClaimLink = useCallback(async (studentId: string) => {
    const student = studentById.get(studentId);
    if (student && isOnlineFamilyLinked(student)) {
      setClaimErrorsByStudentId((prev) => ({
        ...prev,
        [studentId]: "This learner already uses a family account.",
      }));
      return;
    }

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
  }, [studentById]);

  const handleToggleClaimPanel = useCallback((studentId: string) => {
    setActiveClaimStudentId((current) => (current === studentId ? null : studentId));
  }, []);

  const toggleFamilyClaimStudent = (studentId: string) => {
    const student = studentById.get(studentId);
    if (student && isOnlineFamilyLinked(student)) {
      setFamilyClaimError("This learner is already in a family account.");
      return;
    }

    setFamilyClaimStudentIds((current) =>
      current.includes(studentId)
        ? current.filter((id) => id !== studentId)
        : [...current, studentId]
    );
    setFamilyClaimError("");
    setFamilyClaimResult(null);
    setFamilyClaimCopyMessage("");
  };

  const handleStartFamilyClaim = (studentId?: string) => {
    setFamilyMode(true);
    setFamilyClaimError("");
    setFamilyClaimResult(null);
    setFamilyClaimCopyMessage("");

    if (!studentId) return;

    const student = studentById.get(studentId);
    if (!student || isOnlineFamilyLinked(student)) {
      setFamilyClaimError("Choose learners without an existing family account.");
      return;
    }

    setFamilyClaimStudentIds((current) =>
      current.includes(studentId) ? current : [...current, studentId]
    );
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

  const handleOpenFamilyRecovery = (studentId: string) => {
    setFamilyRecoveryStudentId(studentId);
    setFamilyRecoverySearch("");
    setFamilyRecoveryError("");
  };

  const handleCloseFamilyRecovery = () => {
    if (familyRecoveryBusy) return;
    setFamilyRecoveryStudentId(null);
    setFamilyRecoverySearch("");
    setFamilyRecoveryError("");
  };

  const applyFamilyChange = async ({
    studentIds = [],
    removeStudentIds = [],
    successMessage,
  }: {
    studentIds?: string[];
    removeStudentIds?: string[];
    successMessage: string;
  }) => {
    if (!familyRecoveryStudent) return;
    if (studentIds.length === 0 && removeStudentIds.length === 0) {
      setFamilyRecoveryError("Choose at least one family change.");
      return;
    }

    setFamilyRecoveryBusy(true);
    setFamilyRecoveryError("");
    setError("");

    try {
      const response = await authFetch("/api/admin/online/family-recovery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          claimed_student_id: familyRecoveryStudent.id,
          student_ids: studentIds,
          remove_student_ids: removeStudentIds,
        }),
      });
      const payload = (await response.json()) as FamilyRecoveryResult & { error?: string };
      if (!response.ok) {
        throw new Error(extractError(payload, "Failed to recover family account"));
      }

      setSuccess(successMessage);
      clearSuccessSoon();
      await refreshData(false);
    } catch (recoveryError) {
      setFamilyRecoveryError(
        recoveryError instanceof Error ? recoveryError.message : "Failed to recover family account"
      );
    } finally {
      setFamilyRecoveryBusy(false);
    }
  };

  const handleAddFamilyMember = async (student: OnlineStudent) => {
    if (!familyRecoveryStudent) return;
    const confirmed = window.confirm(`Add ${student.name} to this family?`);
    if (!confirmed) return;
    await applyFamilyChange({
      studentIds: [student.id],
      successMessage: `${student.name} added to family.`,
    });
  };

  const handleRemoveFamilyMember = async (student: OnlineStudent) => {
    if (!familyRecoveryStudent || student.id === familyRecoveryStudent.id) return;
    const confirmed = window.confirm(
      `Remove ${student.name} from this family? Their student login stays active.`
    );
    if (!confirmed) return;
    await applyFamilyChange({
      removeStudentIds: [student.id],
      successMessage: `${student.name} removed from family.`,
    });
  };

  const hasActiveFilters = Boolean(searchTerm || filterTeacher || filterStage);
  const selectedFamilyNames = familyClaimStudentIds
    .map((studentId) => studentById.get(studentId)?.name)
    .filter((name): name is string => Boolean(name));

  return (
    <div className="min-h-screen bg-slate-50">
      <AdminNavbar />
      <div className="relative p-3 sm:p-5">
        <header className="mb-4">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-400">
                Admin
              </p>
              <h1 className="text-2xl font-semibold tracking-tight text-slate-950">
                Online dashboard
              </h1>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowCharts((current) => !current)}
                className="h-9 rounded-full border-slate-200 bg-white px-3 text-slate-700"
              >
                <BarChart3 className="size-4" />
                Charts
              </Button>
              <AdminScopeSwitch />
            </div>
          </div>
        </header>

        {error && (
          <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}
        {success && (
          <div className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            {success}
          </div>
        )}

        <div className="mb-4 grid grid-cols-2 overflow-hidden rounded-xl border border-slate-200 bg-white md:grid-cols-6">
          <div className="border-b border-r border-slate-100 p-3 md:border-b-0">
            <div className="text-xl font-semibold text-slate-950">{students.length}</div>
            <div className="text-xs text-slate-500">Students</div>
          </div>
          <div className="border-b border-slate-100 p-3 md:border-b-0 md:border-r">
            <div className="text-xl font-semibold text-slate-950">{assignedTeacherCount}</div>
            <div className="text-xs text-slate-500">Assigned</div>
          </div>
          <div className="border-b border-r border-slate-100 p-3 md:border-b-0">
            <div className="text-xl font-semibold text-slate-950">{teachersWithStudentsCount}</div>
            <div className="text-xs text-slate-500">Teachers</div>
          </div>
          <div className="border-b border-slate-100 p-3 md:border-b-0 md:border-r">
            <div className="text-xl font-semibold text-slate-950">{activeCrmCount}</div>
            <div className="text-xs text-slate-500">Active</div>
          </div>
          <div className="border-r border-slate-100 p-3">
            <div className="text-xl font-semibold text-slate-950">{claimedPortalCount}</div>
            <div className="text-xs text-slate-500">Portals</div>
          </div>
          {filteredStudents.length !== students.length ? (
            <div className="p-3">
              <div className="text-xl font-semibold text-slate-950">{filteredStudents.length}</div>
              <div className="text-xs text-slate-500">Shown</div>
            </div>
          ) : (
            <div className="p-3">
              <div className="text-xl font-semibold text-slate-950">
                {requiresFollowUpCount || unassignedTeacherCount}
              </div>
              <div className="text-xs text-slate-500">Follow-up</div>
            </div>
          )}
        </div>

        {showCharts ? (
          <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <h3 className="mb-3 text-sm font-semibold text-slate-900">CRM</h3>
              <ClassDistributionChart students={stageChartStudents} onSelectClass={handleStageChartSelect} />
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <h3 className="mb-3 text-sm font-semibold text-slate-900">Teachers</h3>
              <TeacherAssignmentChart
                students={teacherChartStudents}
                teachers={teacherChartTeachers}
                onSelectTeacher={handleTeacherChartSelect}
              />
            </div>
          </div>
        ) : null}

        <div
          className="rounded-xl border border-slate-200 bg-white shadow-sm"
          ref={studentListRef}
        >
          <div className="flex flex-col gap-3 border-b border-slate-100 p-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-base font-semibold text-slate-950">Students</h2>
              <p className="text-xs text-slate-500">
                {familyMode ? "Select 2+ unlinked learners." : "Manage records, packages, and portal access."}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {filteredStudents.length !== students.length ? (
                <span className="text-sm text-slate-500">
                  {filteredStudents.length} of {students.length} students
                </span>
              ) : (
                <span className="text-sm text-slate-500">{students.length} students</span>
              )}
              <Button
                type="button"
                variant={familyMode ? "default" : "outline"}
                onClick={() => handleStartFamilyClaim()}
                className={
                  familyMode
                    ? "h-8 rounded-full bg-slate-900 px-3 text-xs text-white hover:bg-slate-800"
                    : "h-8 rounded-full border-slate-200 bg-white px-3 text-xs text-slate-700"
                }
              >
                <Users className="size-3.5" />
                New family link
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-2 border-b border-slate-100 p-4 sm:grid-cols-2 xl:grid-cols-[minmax(220px,1fr)_180px_180px_auto_auto]">
            <input
              type="text"
              placeholder="Search"
              className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-slate-400"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
            />
            <select
              className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-slate-400"
              value={filterTeacher}
              onChange={(event) => setFilterTeacher(event.target.value)}
            >
              <option value="">All teachers</option>
              <option value="unassigned">Unassigned</option>
              {teachers.map((teacher) => (
                <option key={teacher.id} value={teacher.id}>
                  {teacher.name}
                </option>
              ))}
            </select>
            <select
              className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-slate-400"
              value={filterStage}
              onChange={(event) => setFilterStage(event.target.value)}
            >
              <option value="">All CRM</option>
              {stageOptions.map((stage) => (
                <option key={stage} value={stage}>
                  {formatStageLabel(stage)}
                </option>
              ))}
            </select>
            <Button
              type="button"
              variant="outline"
              onClick={clearFilters}
              disabled={!hasActiveFilters}
              className="h-9 rounded-full border-slate-200 bg-white px-3 text-slate-700"
            >
              <RotateCcw className="size-4" />
              Reset
            </Button>
            <Button
              type="button"
              onClick={() => setIsAddStudentModalOpen(true)}
              className="h-9 rounded-full bg-slate-900 px-4 text-white hover:bg-slate-800 sm:justify-self-start xl:justify-self-auto"
            >
              <Plus className="size-4" />
              Add
            </Button>
          </div>

          <div className="border-b border-slate-100 bg-slate-50/60 p-3">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant={familyMode ? "default" : "outline"}
                  onClick={() => handleStartFamilyClaim()}
                  className={
                    familyMode
                      ? "h-9 rounded-full bg-slate-900 px-4 text-white hover:bg-slate-800"
                      : "h-9 rounded-full border-slate-200 bg-white px-4 text-slate-700"
                  }
                >
                  <Users className="size-4" />
                  New family link
                </Button>
                {familyMode ? (
                  <span className="text-sm text-slate-500">
                    {familyClaimStudentIds.length} selected
                  </span>
                ) : null}
              </div>
              {familyMode ? (
                <Button
                  type="button"
                  onClick={() => void handleGenerateFamilyClaimLink()}
                  disabled={familyClaimBusy || familyClaimStudentIds.length < 2}
                  className="h-9 rounded-full bg-slate-900 px-4 text-white hover:bg-slate-800"
                >
                  {familyClaimBusy ? "Creating" : "Create family link"}
                </Button>
              ) : null}
            </div>

            {familyMode && selectedFamilyNames.length > 0 ? (
              <p className="mt-2 truncate text-xs text-slate-500">
                {selectedFamilyNames.join(", ")}
              </p>
            ) : null}

            {familyClaimError ? (
              <p className="mt-2 text-sm text-rose-600" role="alert">
                {familyClaimError}
              </p>
            ) : null}

            {familyClaimResult ? (
              <div className="mt-3 rounded-xl border border-emerald-200 bg-white p-3">
                <div className="mb-2 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm font-medium text-slate-900">Family link ready</p>
                  <span className="text-xs text-slate-500">
                    Expires {new Date(familyClaimResult.expires_at).toLocaleDateString("en-MY")}
                  </span>
                </div>
                <div className="flex flex-col gap-2 md:flex-row">
                  <input
                    ref={familyClaimInputRef}
                    type="text"
                    readOnly
                    value={familyClaimResult.claim_url}
                    className="h-9 flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 font-mono text-xs text-slate-700"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    className="h-9 rounded-full bg-white"
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

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-100">
              <thead className="bg-white">
                <tr>
                  <th className="min-w-[260px] px-4 py-3 text-left text-xs font-medium uppercase tracking-[0.14em] text-slate-400">
                    Student
                  </th>
                  <th className="min-w-[180px] px-4 py-3 text-left text-xs font-medium uppercase tracking-[0.14em] text-slate-400">
                    Teacher
                  </th>
                  <th className="min-w-[160px] px-4 py-3 text-left text-xs font-medium uppercase tracking-[0.14em] text-slate-400">
                    CRM
                  </th>
                  <th className="min-w-[240px] px-4 py-3 text-left text-xs font-medium uppercase tracking-[0.14em] text-slate-400">
                    Packages
                  </th>
                  <th className="min-w-[170px] px-4 py-3 text-left text-xs font-medium uppercase tracking-[0.14em] text-slate-400">
                    Portal
                  </th>
                  <th className="w-16 px-4 py-3 text-right text-xs font-medium uppercase tracking-[0.14em] text-slate-400">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {displayStudentRows.map(
                  ({
                    student,
                    familyGroupKey,
                    familySize,
                    isFamilyGroupStart,
                    isFamilyGroupEnd,
                  }) => {
                  const claimResult = claimLinkResultsByStudentId[student.id] ?? null;
                  const claimError = claimErrorsByStudentId[student.id] ?? null;
                  const isClaimPanelOpen =
                    activeClaimStudentId === student.id &&
                    !student.account_owner_user_id &&
                    !isOnlineFamilyLinked(student) &&
                    (Boolean(claimResult) || Boolean(claimError));
                  const isGroupedFamilyRow = Boolean(familyGroupKey);
                  const shouldShowPortalCell = !isGroupedFamilyRow || isFamilyGroupStart;
                  const primaryDuplicate = student.duplicate_candidates?.[0] ?? null;
                  const canUseExistingFamily =
                    isOnlineFamilyLinked(student) || Boolean(student.account_owner_user_id);

                  return (
                    <React.Fragment key={student.id}>
                    <tr className={isGroupedFamilyRow ? "bg-amber-50/[0.16]" : undefined}>
                      {editStudentId === student.id ? (
                        <td className="px-4 py-4" colSpan={6}>
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
                          <td className="px-4 py-3 align-middle">
                            <div className="flex items-start gap-2">
                              {familyMode && !isOnlineFamilyLinked(student) ? (
                                <input
                                  type="checkbox"
                                  checked={familyClaimStudentIds.includes(student.id)}
                                  onChange={() => toggleFamilyClaimStudent(student.id)}
                                  aria-label={`Select ${student.name} for family claim`}
                                  className="mt-1 size-4 rounded border-slate-300 text-slate-900"
                                />
                              ) : null}
                              <div
                                className={
                                  isGroupedFamilyRow
                                    ? "relative min-w-0 pl-4"
                                    : "min-w-0"
                                }
                              >
                                {isGroupedFamilyRow ? (
                                  <span
                                    aria-hidden="true"
                                    className={[
                                      "absolute left-0 w-px bg-amber-300/70",
                                      isFamilyGroupStart ? "top-2 rounded-t-full" : "top-0",
                                      isFamilyGroupEnd ? "bottom-2 rounded-b-full" : "bottom-0",
                                    ].join(" ")}
                                  />
                                ) : null}
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="font-medium text-slate-950">{student.name}</span>
                                  {isOnlineFamilyLinked(student) && isFamilyGroupStart ? (
                                    <span
                                      title="Already linked to a family account."
                                      className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700 ring-1 ring-amber-100"
                                    >
                                      <Users className="size-3" />
                                      In family{familySize > 1 ? ` · ${familySize}` : ""}
                                    </span>
                                  ) : null}
                                  {primaryDuplicate ? (
                                    <span
                                      title={primaryDuplicate.reason}
                                      className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-medium text-rose-700 ring-1 ring-rose-100"
                                    >
                                      <AlertTriangle className="size-3" />
                                      Possible duplicate
                                    </span>
                                  ) : null}
                                </div>
                                {(student.parent_name || student.parent_contact_number) ? (
                                  <div className="mt-1 text-xs text-slate-500">
                                    {[student.parent_name, student.parent_contact_number].filter(Boolean).join(" · ")}
                                  </div>
                                ) : null}
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3 align-middle text-sm text-slate-600">
                            {student.assigned_teacher_id ? teacherById.get(student.assigned_teacher_id) ?? "-" : "-"}
                          </td>
                          <td className="px-4 py-3 align-middle">
                            <div className="text-sm text-slate-700">
                              {formatStageLabel(normalizeStageKey(student.crm_stage))}
                            </div>
                            {student.crm_status_reason ? (
                              <div className="mt-1 max-w-[180px] truncate text-xs text-slate-400">
                                {student.crm_status_reason}
                              </div>
                            ) : null}
                          </td>
                          <td className="px-4 py-3 align-middle">
                            <div className="flex max-w-[300px] flex-wrap gap-1.5">
                              {(student.package_assignments ?? []).slice(0, 2).map((assignment) => (
                                <span
                                  key={assignment.id}
                                  className="rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700"
                                >
                                  {assignment.course_name} • {scheduleStateLabel(assignment.schedule_state)}
                                </span>
                              ))}
                              {(student.package_assignments ?? []).length === 0 ? (
                                <span className="text-xs text-slate-400">No package</span>
                              ) : null}
                              {(student.package_assignments ?? []).length > 2 ? (
                                <span className="rounded-full bg-white px-2 py-1 text-xs text-slate-500">
                                  +{(student.package_assignments ?? []).length - 2} more
                                </span>
                              ) : null}
                            </div>
                          </td>
                          <td className="px-4 py-3 align-middle">
                            {shouldShowPortalCell ? (
                              <AdminOnlineClaimAccessCell
                                studentId={student.id}
                                studentName={student.name}
                                claimed={Boolean(student.account_owner_user_id)}
                                familyLinked={isOnlineFamilyLinked(student)}
                                familySize={familySize}
                                hasLink={Boolean(claimResult)}
                                isExpanded={isClaimPanelOpen}
                                isGenerating={claimBusyStudentId === student.id}
                                error={isClaimPanelOpen ? null : claimError}
                                onGenerate={handleGenerateClaimLink}
                                onRecoverFamily={handleOpenFamilyRecovery}
                                onToggleExpanded={handleToggleClaimPanel}
                              />
                            ) : null}
                          </td>
                          <td className="px-4 py-3 text-right align-middle">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <button
                                  type="button"
                                  className="inline-flex size-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50"
                                  aria-label={`Actions for ${student.name}`}
                                >
                                  <MoreHorizontal className="size-4" />
                                </button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-44">
                                <DropdownMenuItem
                                  onSelect={() => handleStartEditStudent(student)}
                                  disabled={busy}
                                >
                                  <Pencil className="size-4" />
                                  Edit
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onSelect={() => void openPackageManager(student)}
                                  disabled={packageBusy}
                                >
                                  <Package className="size-4" />
                                  {packageStudentId === student.id ? "Hide packages" : "Packages"}
                                </DropdownMenuItem>
                                {canUseExistingFamily ? (
                                  <DropdownMenuItem
                                    onSelect={() => handleOpenFamilyRecovery(student.id)}
                                    disabled={busy}
                                  >
                                    <Users className="size-4" />
                                    {isOnlineFamilyLinked(student) ? "Edit family" : "Add siblings"}
                                  </DropdownMenuItem>
                                ) : (
                                  <DropdownMenuItem
                                    onSelect={() => handleStartFamilyClaim(student.id)}
                                    disabled={busy}
                                  >
                                    <Users className="size-4" />
                                    Start family link
                                  </DropdownMenuItem>
                                )}
                                {primaryDuplicate ? (
                                  <>
                                    <DropdownMenuItem
                                      onSelect={() =>
                                        void handleDuplicateAction(primaryDuplicate, "merge")
                                      }
                                      disabled={busy}
                                    >
                                      <GitMerge className="size-4" />
                                      Merge
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      onSelect={() =>
                                        void handleDuplicateAction(primaryDuplicate, "ignore")
                                      }
                                      disabled={busy}
                                    >
                                      <EyeOff className="size-4" />
                                      Ignore duplicate
                                    </DropdownMenuItem>
                                  </>
                                ) : null}
                                <DropdownMenuItem
                                  variant="destructive"
                                  onSelect={() => handleDeleteStudent(student.id)}
                                  disabled={busy}
                                >
                                  <Trash2 className="size-4" />
                                  Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </td>
                        </>
                      )}
                    </tr>
                    {isClaimPanelOpen && editStudentId !== student.id ? (
                      <tr>
                        <td colSpan={6} className="bg-slate-50 px-4 pb-4 pt-0">
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
                        <td colSpan={6} className="bg-slate-50 px-4 py-4">
                          <div className="rounded-xl border border-slate-200 bg-white p-4">
                            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                              <div>
                                <h3 className="text-base font-semibold text-slate-900">Packages</h3>
                                <p className="text-sm text-slate-500">Course, teacher, and slot status.</p>
                              </div>
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                                  {student.name}
                                </span>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleAddPackageAssignment(student)}
                                  disabled={packageBusy || packageLoading}
                                >
                                  Add
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
                              <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Current</p>
                              {packageLoading ? (
                                <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">
                                  Loading packages...
                                </div>
                              ) : packageAssignments.length === 0 ? (
                                <div className="mt-3 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">
                                  No packages yet.
                                </div>
                              ) : (
                                <div className="mt-3 grid gap-3 md:grid-cols-2">
                                  {packageAssignments.map((assignment) => (
                                    <div
                                      key={assignment.id}
                                      className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-4"
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
                    <td colSpan={6} className="py-8 text-center text-gray-500">
                      Loading online students...
                    </td>
                  </tr>
                )}
                {!loading && filteredStudents.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-gray-500">
                      No online students match the current filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {familyRecoveryStudent ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="max-h-[85vh] w-full max-w-3xl overflow-hidden rounded-2xl bg-white shadow-xl">
              <div className="flex items-start justify-between border-b border-gray-100 p-6">
                <div>
                  <h2 className="text-xl font-semibold text-gray-900">Edit family</h2>
                  <p className="text-sm text-gray-500">
                    Manage the family account for {familyRecoveryStudent.name}.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleCloseFamilyRecovery}
                  disabled={familyRecoveryBusy}
                  className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-50"
                  aria-label="Close family recovery modal"
                >
                  <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="max-h-[calc(85vh-96px)] space-y-4 overflow-y-auto p-6">
                <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-4 text-sm text-emerald-900">
                  <p className="font-semibold">Family account</p>
                  <p className="mt-1">
                    Add unlinked learners or remove members. Student logins stay active.
                  </p>
                </div>

                <input
                  type="text"
                  placeholder="Search learners..."
                  className="w-full rounded-md border border-gray-300 p-2 text-sm shadow-sm"
                  value={familyRecoverySearch}
                  onChange={(event) => setFamilyRecoverySearch(event.target.value)}
                />

                {familyRecoveryError ? (
                  <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                    {familyRecoveryError}
                  </p>
                ) : null}

                <div className="rounded-xl border border-slate-200">
                  <div className="border-b border-slate-100 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700">
                    Learners ({familyRecoveryCurrentMembers.length} in family)
                  </div>
                  <div className="max-h-[26rem] divide-y divide-slate-100 overflow-y-auto">
                    {familyRecoveryVisibleLearners.map(({ student, isMember }) => {
                      const isAnchorMember = student.id === familyRecoveryStudent.id;
                      return (
                        <label
                          key={student.id}
                          className={[
                            "flex items-start gap-3 px-4 py-3",
                            isAnchorMember || familyRecoveryBusy
                              ? "cursor-default"
                              : "cursor-pointer hover:bg-slate-50",
                          ].join(" ")}
                        >
                          <input
                            type="checkbox"
                            checked={isMember}
                            disabled={isAnchorMember || familyRecoveryBusy}
                            onChange={() => {
                              if (isMember) {
                                void handleRemoveFamilyMember(student);
                              } else {
                                void handleAddFamilyMember(student);
                              }
                            }}
                            className="mt-1 size-4 rounded border-slate-300 text-slate-900 disabled:opacity-40"
                          />
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-medium text-slate-900">
                              {student.name}
                            </span>
                            <span className="block text-xs text-slate-500">
                              {isAnchorMember
                                ? "Family owner"
                                : isMember
                                  ? "In family"
                                  : "Not in family"}
                              {student.account_owner_user_id ? " · Has login" : ""}
                              {!student.account_owner_user_id && !isMember ? " · No student login" : ""}
                              {student.parent_name ? ` · ${student.parent_name}` : ""}
                            </span>
                          </span>
                        </label>
                      );
                    })}
                    {familyRecoveryVisibleLearners.length === 0 ? (
                      <div className="px-4 py-6 text-sm text-slate-500">
                        No learners found.
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleCloseFamilyRecovery}
                    disabled={familyRecoveryBusy}
                  >
                    Close
                  </Button>
                </div>
              </div>
            </div>
          </div>
        ) : null}

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
