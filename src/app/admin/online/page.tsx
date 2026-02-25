"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Plus, RotateCcw } from "lucide-react";
import AdminNavbar from "@/components/admin/AdminNavbar";
import AdminScopeSwitch from "@/components/admin/AdminScopeSwitch";
import ClassDistributionChart from "@/components/admin/ClassDistributionChart";
import TeacherAssignmentChart from "@/components/admin/TeacherAssignmentChart";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { authFetch } from "@/lib/authFetch";

type OnlineStudent = {
  id: string;
  name: string;
  assigned_teacher_id: string | null;
  parent_name?: string | null;
  parent_contact_number?: string | null;
  crm_stage?: string | null;
  crm_status_reason?: string | null;
};

type Teacher = {
  id: string;
  name: string;
};

type RegistryPayload = {
  students?: OnlineStudent[];
  teachers?: Teacher[];
};

type EditStudentForm = {
  name: string;
  assigned_teacher_id: string;
  parent_name: string;
  parent_contact_number: string;
  crm_stage: string;
  crm_status_reason: string;
};

const FALLBACK_STAGES = ["interested", "active", "pending_payment", "paused", "discontinued"];

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
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
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

  const studentListRef = useRef<HTMLDivElement | null>(null);

  const refreshData = useCallback(
    async (withLoading = true) => {
      if (withLoading) setLoading(true);
      setError("");

      try {
        const [studentsRes, registryRes] = await Promise.all([
          authFetch("/api/admin/online/students"),
          authFetch("/api/admin/online/registry"),
        ]);

        const [studentsPayload, registryPayload] = await Promise.all([
          studentsRes.json(),
          registryRes.json(),
        ]);

        const failures: string[] = [];
        const registry = registryPayload as RegistryPayload;

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

  const scrollToStudentList = useCallback(() => {
    studentListRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

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
      setSuccess("Online student deleted successfully.");
      clearSuccessSoon();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Failed to delete online student");
    } finally {
      setBusy(false);
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
              <p className="text-gray-600">Manage students, assign teachers, and track CRM progress.</p>
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

        <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-5">
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
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
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
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {filteredStudents.map((student) => (
                  <tr key={student.id}>
                    {editStudentId === student.id ? (
                      <td className="px-4 py-3" colSpan={6}>
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
                        <td className="px-4 py-3 font-medium text-gray-900">{student.name}</td>
                        <td className="px-4 py-3 text-gray-600">
                          {student.parent_name || "-"}
                          {student.parent_contact_number ? ` (${student.parent_contact_number})` : ""}
                        </td>
                        <td className="px-4 py-3 text-gray-600">
                          {student.assigned_teacher_id ? teacherById.get(student.assigned_teacher_id) ?? "-" : "-"}
                        </td>
                        <td className="px-4 py-3 text-gray-600">{formatStageLabel(normalizeStageKey(student.crm_stage))}</td>
                        <td className="px-4 py-3 text-gray-600">{student.crm_status_reason ?? "-"}</td>
                        <td className="px-4 py-3">
                          <div className="flex flex-col gap-2">
                            <button
                              type="button"
                              onClick={() => handleStartEditStudent(student)}
                              disabled={busy}
                              className="rounded bg-blue-600 px-3 py-1 text-xs text-white hover:bg-blue-700 disabled:opacity-50"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteStudent(student.id)}
                              disabled={busy}
                              className="rounded bg-red-600 px-3 py-1 text-xs text-white hover:bg-red-700 disabled:opacity-50"
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
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
