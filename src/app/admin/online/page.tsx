"use client";

import React, { useEffect, useMemo, useState } from "react";
import AdminNavbar from "@/components/admin/AdminNavbar";
import AdminScopeSwitch from "@/components/admin/AdminScopeSwitch";
import { Card } from "@/components/ui/Card";
import { authFetch } from "@/lib/authFetch";
import { Button } from "@/components/ui/Button";
import { dayOfWeekLabel } from "@/lib/online/slots";

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

type OverviewPayload = {
  summary?: {
    total_online_students: number;
    active_courses: number;
    teachers_on_duty: number;
    attendance_rate_month_pct: number;
    pending_payment_claims: number;
    active_claims: number;
    claims_this_month: number;
    claims_prev_month: number;
    growth_delta: number;
    growth_rate_pct: number;
  };
  crm_pipeline?: Array<{ stage: string; count: number }>;
  teacher_loads?: Array<{ teacher_id: string; teacher_name: string; active_load: number }>;
  monthly_attendance?: Array<{
    month_start: string;
    present_count: number;
    absent_count: number;
    total_sessions: number;
  }>;
};

type Course = {
  id: string;
  name: string;
  description: string | null;
  monthly_fee_cents: number;
  sessions_per_week: number;
  is_active: boolean;
};

type SlotTemplate = {
  id: string;
  course_id: string;
  day_of_week: number;
  start_time: string;
  duration_minutes: number;
  is_active: boolean;
};

type TeacherAvailability = {
  slot_template_id: string;
  teacher_id: string;
  is_available: boolean;
  last_assigned_at: string | null;
};

type CoursesPayload = {
  courses?: Course[];
  templates?: SlotTemplate[];
  teachers?: Teacher[];
  teacher_availability?: TeacherAvailability[];
};

type CrmRow = {
  id: string;
  name: string;
  record_type: "prospect" | "student";
  crm_stage: string;
  crm_status_reason: string | null;
  teacher_name: string;
  parent_name: string | null;
  parent_contact_number: string | null;
  latest_claim_status: string | null;
  latest_claim_date: string | null;
  seat_hold_expires_at: string | null;
};

type CrmPayload = {
  stages?: Array<{ stage: string; count: number }>;
  rows?: CrmRow[];
};

const formatMoney = (value: number | null | undefined) =>
  typeof value === "number" ? `RM ${(value / 100).toFixed(2)}` : "RM 0.00";

const formatMonth = (value: string) =>
  new Date(`${value}T00:00:00`).toLocaleDateString("en-MY", {
    month: "short",
    year: "numeric",
  });

const dateLabel = (value: string | null) => {
  if (!value) return "—";
  return new Date(`${value}T00:00:00`).toLocaleDateString("en-MY", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

export default function AdminOnlinePage() {
  const [overview, setOverview] = useState<OverviewPayload>({});
  const [students, setStudents] = useState<OnlineStudent[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [templates, setTemplates] = useState<SlotTemplate[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [teacherAvailability, setTeacherAvailability] = useState<TeacherAvailability[]>([]);
  const [crmStages, setCrmStages] = useState<Array<{ stage: string; count: number }>>([]);
  const [crmRows, setCrmRows] = useState<CrmRow[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedStage, setSelectedStage] = useState("");
  const [selectedCourseId, setSelectedCourseId] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [newCourseName, setNewCourseName] = useState("");
  const [newCourseDescription, setNewCourseDescription] = useState("");
  const [newCourseFee, setNewCourseFee] = useState("0");
  const [newCourseSessions, setNewCourseSessions] = useState("3");
  const [newSlotCourseId, setNewSlotCourseId] = useState("");
  const [newSlotDay, setNewSlotDay] = useState("1");
  const [newSlotTime, setNewSlotTime] = useState("09:00");
  const [newStudentName, setNewStudentName] = useState("");
  const [newStudentParentName, setNewStudentParentName] = useState("");
  const [newStudentParentContact, setNewStudentParentContact] = useState("");

  const refreshData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [overviewRes, coursesRes, crmRes, studentsRes] = await Promise.all([
        authFetch("/api/admin/online/overview"),
        authFetch("/api/admin/online/courses"),
        authFetch("/api/admin/online/crm"),
        authFetch("/api/admin/online/students"),
      ]);

      const [overviewData, coursesData, crmData, studentsData] = await Promise.all([
        overviewRes.json(),
        coursesRes.json(),
        crmRes.json(),
        studentsRes.json(),
      ]);

      if (!overviewRes.ok) {
        throw new Error((overviewData as { error?: string }).error || "Failed to load overview");
      }
      if (!coursesRes.ok) {
        throw new Error((coursesData as { error?: string }).error || "Failed to load courses");
      }
      if (!crmRes.ok) {
        throw new Error((crmData as { error?: string }).error || "Failed to load CRM");
      }
      if (!studentsRes.ok) {
        throw new Error((studentsData as { error?: string }).error || "Failed to load students");
      }

      const typedCourses = coursesData as CoursesPayload;
      const typedCrm = crmData as CrmPayload;

      setOverview(overviewData as OverviewPayload);
      setCourses(Array.isArray(typedCourses.courses) ? typedCourses.courses : []);
      setTemplates(Array.isArray(typedCourses.templates) ? typedCourses.templates : []);
      setTeachers(Array.isArray(typedCourses.teachers) ? typedCourses.teachers : []);
      setTeacherAvailability(
        Array.isArray(typedCourses.teacher_availability) ? typedCourses.teacher_availability : []
      );
      setCrmStages(Array.isArray(typedCrm.stages) ? typedCrm.stages : []);
      setCrmRows(Array.isArray(typedCrm.rows) ? typedCrm.rows : []);
      setStudents(Array.isArray(studentsData) ? (studentsData as OnlineStudent[]) : []);
      setNewSlotCourseId((current) => {
        if (current && (typedCourses.courses ?? []).some((course) => course.id === current)) return current;
        return typedCourses.courses?.[0]?.id ?? "";
      });
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : "Failed to refresh online data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshData();
  }, []);

  const teacherById = useMemo(() => new Map(teachers.map((teacher) => [teacher.id, teacher.name])), [teachers]);

  const summaryCards = useMemo(() => {
    const summary = overview.summary;
    return [
      {
        label: "Total Online Students",
        tone: "text-blue-600",
        value: summary?.total_online_students ?? 0,
      },
      {
        label: "Active Courses",
        tone: "text-emerald-600",
        value: summary?.active_courses ?? 0,
      },
      {
        label: "Teachers On Duty",
        tone: "text-orange-600",
        value: summary?.teachers_on_duty ?? 0,
      },
      {
        label: "Attendance This Month",
        tone: "text-purple-600",
        value: `${summary?.attendance_rate_month_pct ?? 0}%`,
      },
    ];
  }, [overview.summary]);

  const filteredCrmRows = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return crmRows.filter((row) => {
      if (selectedStage && row.crm_stage !== selectedStage) return false;
      if (!term) return true;
      return (
        row.name.toLowerCase().includes(term) ||
        row.teacher_name.toLowerCase().includes(term) ||
        (row.parent_name ?? "").toLowerCase().includes(term) ||
        (row.parent_contact_number ?? "").toLowerCase().includes(term)
      );
    });
  }, [crmRows, searchTerm, selectedStage]);

  const templateByCourse = useMemo(() => {
    const map = new Map<string, SlotTemplate[]>();
    templates.forEach((template) => {
      const list = map.get(template.course_id) ?? [];
      list.push(template);
      map.set(template.course_id, list);
    });
    return map;
  }, [templates]);

  const filteredStudents = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return students.filter((student) => {
      if (!term) return true;
      return (
        student.name.toLowerCase().includes(term) ||
        (student.parent_name ?? "").toLowerCase().includes(term) ||
        (student.parent_contact_number ?? "").toLowerCase().includes(term)
      );
    });
  }, [searchTerm, students]);

  const createCourse = async () => {
    if (!newCourseName.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const response = await authFetch("/api/admin/online/courses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newCourseName.trim(),
          description: newCourseDescription.trim(),
          monthly_fee_cents: Number(newCourseFee) * 100,
          sessions_per_week: Number(newCourseSessions),
          is_active: true,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to create course");
      setNewCourseName("");
      setNewCourseDescription("");
      await refreshData();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Failed to create course");
    } finally {
      setBusy(false);
    }
  };

  const createTemplate = async () => {
    if (!newSlotCourseId) return;
    setBusy(true);
    setError(null);
    try {
      const response = await authFetch("/api/admin/online/slots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create_template",
          course_id: newSlotCourseId,
          day_of_week: Number(newSlotDay),
          start_time: newSlotTime,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to create slot template");
      await refreshData();
    } catch (templateError) {
      setError(templateError instanceof Error ? templateError.message : "Failed to create slot");
    } finally {
      setBusy(false);
    }
  };

  const toggleTeacher = async (slotTemplateId: string, teacherId: string, isAvailable: boolean) => {
    setBusy(true);
    setError(null);
    try {
      const response = await authFetch("/api/admin/online/slots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "toggle_teacher",
          slot_template_id: slotTemplateId,
          teacher_id: teacherId,
          is_available: !isAvailable,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to toggle teacher availability");
      await refreshData();
    } catch (toggleError) {
      setError(toggleError instanceof Error ? toggleError.message : "Failed to toggle teacher");
    } finally {
      setBusy(false);
    }
  };

  const addOnlineStudent = async () => {
    if (!newStudentName.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const response = await authFetch("/api/admin/online/students", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newStudentName.trim(),
          parent_name: newStudentParentName.trim(),
          parent_contact_number: newStudentParentContact.trim(),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to add online student");
      setNewStudentName("");
      setNewStudentParentName("");
      setNewStudentParentContact("");
      await refreshData();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Failed to add online student");
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
              <h1 className="text-2xl font-bold text-gray-800">Online Management</h1>
              <p className="text-gray-600">
                Dedicated workspace for online students, courses, and attendance.
              </p>
            </div>
            <AdminScopeSwitch />
          </div>
        </header>

        {error && (
          <Card className="mb-6 border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error}</Card>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {summaryCards.map((card) => (
            <Card key={card.label} className="p-4">
              <div className={`text-2xl font-bold ${card.tone}`}>{card.value}</div>
              <div className="text-sm text-gray-600">{card.label}</div>
            </Card>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <Card className="p-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-2">Online Growth Baseline</h3>
            <p className="text-sm text-gray-500 mb-4">Month-on-month claim movement.</p>
            <div className="space-y-3">
              <div className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3">
                <span className="text-sm text-slate-600">Claims This Month</span>
                <span className="text-lg font-semibold text-slate-900">
                  {overview.summary?.claims_this_month ?? 0}
                </span>
              </div>
              <div className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3">
                <span className="text-sm text-slate-600">Claims Previous Month</span>
                <span className="text-lg font-semibold text-slate-900">
                  {overview.summary?.claims_prev_month ?? 0}
                </span>
              </div>
              <div className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3">
                <span className="text-sm text-slate-600">Growth Delta</span>
                <span className="text-lg font-semibold text-slate-900">
                  {overview.summary?.growth_delta ?? 0}
                </span>
              </div>
              <div className="flex items-center justify-between rounded-xl bg-slate-900 px-4 py-3">
                <span className="text-sm text-white">Growth Rate</span>
                <span className="text-lg font-semibold text-white">
                  {overview.summary?.growth_rate_pct ?? 0}%
                </span>
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-2">Monthly Attendance Rollup</h3>
            <p className="text-sm text-gray-500 mb-4">
              Present/absent summary from teacher session-based marking.
            </p>
            <div className="space-y-2">
              {(overview.monthly_attendance ?? []).length === 0 ? (
                <p className="text-sm text-slate-500">No attendance data yet.</p>
              ) : (
                (overview.monthly_attendance ?? []).map((row) => (
                  <div key={row.month_start} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
                    <span className="text-sm text-slate-700">{formatMonth(row.month_start)}</span>
                    <span className="text-xs text-slate-500">
                      {row.present_count} present / {row.absent_count} absent
                    </span>
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2 mb-6">
          <Card className="p-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-2">Online CRM Pipeline</h3>
            <p className="text-sm text-gray-500 mb-4">
              Pipeline adapted from CRM flow, scoped to online prospects and students.
            </p>
            <div className="mb-4 flex flex-wrap gap-2">
              <button
                type="button"
                className={`rounded-full px-3 py-1 text-xs font-semibold ${
                  selectedStage
                    ? "bg-slate-100 text-slate-700"
                    : "bg-slate-900 text-white"
                }`}
                onClick={() => setSelectedStage("")}
              >
                All
              </button>
              {crmStages.map((stage) => (
                <button
                  key={stage.stage}
                  type="button"
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    selectedStage === stage.stage
                      ? "bg-slate-900 text-white"
                      : "bg-slate-100 text-slate-700"
                  }`}
                  onClick={() => setSelectedStage(stage.stage)}
                >
                  {stage.stage} ({stage.count})
                </button>
              ))}
            </div>
            <div className="max-h-[360px] space-y-2 overflow-y-auto pr-1">
              {filteredCrmRows.length === 0 ? (
                <p className="text-sm text-slate-500">No CRM records for this filter.</p>
              ) : (
                filteredCrmRows.map((row) => (
                  <div key={row.id} className="rounded-xl border border-slate-200 bg-white p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-slate-900">{row.name}</p>
                      <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-600">
                        {row.crm_stage}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      {row.record_type} • {row.teacher_name}
                    </p>
                    <p className="text-xs text-slate-500">
                      Claim: {row.latest_claim_status ?? "none"} • Date: {dateLabel(row.latest_claim_date)}
                    </p>
                  </div>
                ))
              )}
            </div>
          </Card>

          <Card className="p-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-2">Teacher Assignment Load</h3>
            <p className="text-sm text-gray-500 mb-4">
              Auto-assignment baseline: least-load with round-robin tie-break.
            </p>
            <div className="space-y-2">
              {(overview.teacher_loads ?? []).length === 0 ? (
                <p className="text-sm text-slate-500">No assigned online load yet.</p>
              ) : (
                (overview.teacher_loads ?? []).map((load) => (
                  <div key={load.teacher_id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
                    <span className="text-sm text-slate-700">{load.teacher_name}</span>
                    <span className="text-sm font-semibold text-slate-900">{load.active_load}</span>
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2 mb-6">
          <Card className="p-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-3">Add Online Course</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <input
                type="text"
                value={newCourseName}
                onChange={(event) => setNewCourseName(event.target.value)}
                placeholder="Course name"
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
              />
              <input
                type="number"
                value={newCourseFee}
                onChange={(event) => setNewCourseFee(event.target.value)}
                placeholder="Monthly fee (RM)"
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
              />
              <input
                type="number"
                value={newCourseSessions}
                onChange={(event) => setNewCourseSessions(event.target.value)}
                placeholder="Sessions/week"
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
              />
              <input
                type="text"
                value={newCourseDescription}
                onChange={(event) => setNewCourseDescription(event.target.value)}
                placeholder="Description"
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
              />
            </div>
            <Button
              type="button"
              className="mt-3 h-9 rounded-xl bg-slate-900 px-4 text-sm text-white hover:bg-slate-800"
              onClick={createCourse}
              disabled={busy}
            >
              Create Course
            </Button>
            <div className="mt-5 space-y-2">
              {courses.map((course) => (
                <div key={course.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <p className="text-sm font-semibold text-slate-900">{course.name}</p>
                  <p className="text-xs text-slate-500">
                    {course.sessions_per_week} sessions/week • {formatMoney(course.monthly_fee_cents)}
                  </p>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-3">Slot Templates & Teacher Toggles</h3>
            <div className="grid gap-3 sm:grid-cols-3">
              <select
                value={newSlotCourseId}
                onChange={(event) => setNewSlotCourseId(event.target.value)}
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
              >
                {courses.map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.name}
                  </option>
                ))}
              </select>
              <select
                value={newSlotDay}
                onChange={(event) => setNewSlotDay(event.target.value)}
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
              >
                {[1, 2, 3, 4, 5].map((day) => (
                  <option key={day} value={day}>
                    {dayOfWeekLabel(day)}
                  </option>
                ))}
              </select>
              <input
                type="time"
                value={newSlotTime}
                onChange={(event) => setNewSlotTime(event.target.value)}
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
              />
            </div>
            <Button
              type="button"
              className="mt-3 h-9 rounded-xl bg-slate-900 px-4 text-sm text-white hover:bg-slate-800"
              onClick={createTemplate}
              disabled={busy || !newSlotCourseId}
            >
              Add 30-Min Slot Template
            </Button>
            <div className="mt-5 max-h-[300px] space-y-2 overflow-y-auto pr-1">
              {courses
                .filter((course) => !selectedCourseId || course.id === selectedCourseId)
                .map((course) => (
                  <div key={course.id} className="rounded-lg border border-slate-200 bg-white p-3">
                    <p className="text-sm font-semibold text-slate-900">{course.name}</p>
                    {(templateByCourse.get(course.id) ?? []).map((template) => {
                      const availabilitySet = new Set(
                        teacherAvailability
                          .filter((row) => row.slot_template_id === template.id && row.is_available)
                          .map((row) => row.teacher_id)
                      );
                      return (
                        <div key={template.id} className="mt-2 rounded-lg bg-slate-50 p-2">
                          <p className="text-xs font-semibold text-slate-700">
                            {dayOfWeekLabel(template.day_of_week)} • {template.start_time.slice(0, 5)} • {template.duration_minutes}m
                          </p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {teachers.map((teacher) => {
                              const isAvailable = availabilitySet.has(teacher.id);
                              return (
                                <button
                                  key={`${template.id}-${teacher.id}`}
                                  type="button"
                                  className={`rounded-full px-2 py-1 text-[11px] font-semibold ${
                                    isAvailable
                                      ? "bg-emerald-100 text-emerald-700"
                                      : "bg-slate-100 text-slate-600"
                                  }`}
                                  onClick={() => toggleTeacher(template.id, teacher.id, isAvailable)}
                                  disabled={busy}
                                >
                                  {teacher.name}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))}
            </div>
          </Card>
        </div>

        <Card className="p-6">
          <div className="flex flex-col gap-2">
            <h3 className="text-lg font-semibold text-gray-800">Online Student Registry</h3>
            <p className="text-sm text-gray-500">
              Add students directly into online pending-payment workflow.
            </p>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-4">
            <input
              type="text"
              placeholder="Student name"
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
              value={newStudentName}
              onChange={(event) => setNewStudentName(event.target.value)}
            />
            <input
              type="text"
              placeholder="Parent name"
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
              value={newStudentParentName}
              onChange={(event) => setNewStudentParentName(event.target.value)}
            />
            <input
              type="text"
              placeholder="Parent contact"
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
              value={newStudentParentContact}
              onChange={(event) => setNewStudentParentContact(event.target.value)}
            />
            <Button
              type="button"
              className="h-10 rounded-xl bg-slate-900 text-sm text-white hover:bg-slate-800"
              onClick={addOnlineStudent}
              disabled={busy}
            >
              Add Online Student
            </Button>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2">
            <input
              type="text"
              placeholder="Search CRM/student..."
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-400 focus:outline-none"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
            />
            <select
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-400 focus:outline-none"
              value={selectedCourseId}
              onChange={(event) => setSelectedCourseId(event.target.value)}
            >
              <option value="">All Courses</option>
              {courses.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.name}
                </option>
              ))}
            </select>
          </div>

          <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200 bg-white">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3 text-left">Student</th>
                  <th className="px-4 py-3 text-left">Teacher</th>
                  <th className="px-4 py-3 text-left">Parent</th>
                  <th className="px-4 py-3 text-left">CRM Stage</th>
                  <th className="px-4 py-3 text-left">Status Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td className="px-4 py-3 text-slate-500" colSpan={5}>
                      Loading online students...
                    </td>
                  </tr>
                ) : filteredStudents.length === 0 ? (
                  <tr>
                    <td className="px-4 py-3 text-slate-500" colSpan={5}>
                      No online students found.
                    </td>
                  </tr>
                ) : (
                  filteredStudents.map((student) => {
                    const teacherName = student.assigned_teacher_id ? teacherById.get(student.assigned_teacher_id) : null;
                    return (
                      <tr key={student.id}>
                        <td className="px-4 py-3 font-medium text-slate-800">{student.name}</td>
                        <td className="px-4 py-3 text-slate-700">{teacherName ?? "Unassigned"}</td>
                        <td className="px-4 py-3 text-slate-500">
                          {student.parent_name || "Unknown"} {student.parent_contact_number ? `(${student.parent_contact_number})` : ""}
                        </td>
                        <td className="px-4 py-3 text-slate-500">{student.crm_stage ?? "active"}</td>
                        <td className="px-4 py-3 text-slate-500">{student.crm_status_reason ?? "—"}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}
