"use client";

import React, { useEffect, useMemo, useState } from "react";
import AdminNavbar from "@/components/admin/AdminNavbar";
import AdminScopeSwitch from "@/components/admin/AdminScopeSwitch";
import { Card } from "@/components/ui/Card";
import { authFetch } from "@/lib/authFetch";

type Student = {
  id: string;
  name: string;
  assigned_teacher_id: string | null;
  record_type?: "student" | "prospect";
};

type Teacher = {
  id: string;
  name: string;
};

type OnlineRegistryPayload = {
  students?: Student[];
  teachers?: Teacher[];
};

export default function AdminOnlinePage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterTeacher, setFilterTeacher] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const load = async () => {
      try {
        const response = await authFetch("/api/admin/online/registry");
        if (response.ok) {
          const payload = (await response.json()) as OnlineRegistryPayload;
          if (isMounted) {
            setStudents(Array.isArray(payload.students) ? payload.students : []);
            setTeachers(Array.isArray(payload.teachers) ? payload.teachers : []);
          }
        } else if (isMounted) {
          setStudents([]);
          setTeachers([]);
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    load();

    return () => {
      isMounted = false;
    };
  }, []);

  const teacherById = useMemo(
    () => new Map(teachers.map((teacher) => [teacher.id, teacher])),
    [teachers]
  );

  const onlineStudents = useMemo(
    () =>
      students.filter((student) => student.record_type !== "prospect"),
    [students]
  );

  const uniqueTeacherIds = useMemo(() => {
    const ids = new Set<string>();
    onlineStudents.forEach((student) => {
      if (student.assigned_teacher_id) ids.add(student.assigned_teacher_id);
    });
    return ids;
  }, [onlineStudents]);

  const summaryCards = useMemo(() => [
    { label: "Total Online Students", tone: "text-blue-600", value: onlineStudents.length },
    { label: "Active Courses", tone: "text-emerald-600", value: "—" },
    { label: "Teachers On Duty", tone: "text-orange-600", value: uniqueTeacherIds.size },
    { label: "Attendance This Month", tone: "text-purple-600", value: "—" },
  ], [onlineStudents.length, uniqueTeacherIds.size]);

  const filteredStudents = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return onlineStudents.filter((student) => {
      if (term && !student.name.toLowerCase().includes(term)) return false;
      if (filterTeacher) {
        if (filterTeacher === "unassigned") return !student.assigned_teacher_id;
        return student.assigned_teacher_id === filterTeacher;
      }
      return true;
    });
  }, [filterTeacher, onlineStudents, searchTerm]);

  const teacherOptions = useMemo(() => {
    const seen = new Set<string>();
    const options: Teacher[] = [];
    onlineStudents.forEach((student) => {
      if (!student.assigned_teacher_id) return;
      if (seen.has(student.assigned_teacher_id)) return;
      const teacher = teacherById.get(student.assigned_teacher_id);
      if (teacher) {
        seen.add(student.assigned_teacher_id);
        options.push(teacher);
      }
    });
    return options.sort((a, b) => a.name.localeCompare(b.name));
  }, [onlineStudents, teacherById]);

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

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {summaryCards.map((card) => (
            <Card key={card.label} className="p-4">
              <div className={`text-2xl font-bold ${card.tone}`}>{card.value}</div>
              <div className="text-sm text-gray-600">{card.label}</div>
            </Card>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-3 mb-6">
          <span className="rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold uppercase text-slate-500 shadow-sm">
            Teacher-updated attendance
          </span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <Card className="p-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-2">Course Distribution</h3>
            <p className="text-sm text-gray-500 mb-4">
              This panel will show how online students are split across courses.
            </p>
            <div className="flex h-56 items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white/70">
              <span className="text-sm font-medium text-slate-400">Chart coming soon</span>
            </div>
          </Card>

          <Card className="p-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-2">Attendance Snapshot</h3>
            <p className="text-sm text-gray-500 mb-4">
              Read-only attendance summary reported by online teachers.
            </p>
            <div className="flex h-56 items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white/70">
              <span className="text-sm font-medium text-slate-400">Snapshot coming soon</span>
            </div>
          </Card>
        </div>

        <Card className="p-6">
          <div className="flex flex-col gap-2">
            <h3 className="text-lg font-semibold text-gray-800">Online Student Registry</h3>
            <p className="text-sm text-gray-500">
              Filter by teacher, course, or month to keep the list focused.
            </p>
          </div>
          <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-4">
            <input
              type="text"
              placeholder="Search student..."
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-400 focus:outline-none"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
            />
            <select
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-400 focus:outline-none"
              value={filterTeacher}
              onChange={(event) => setFilterTeacher(event.target.value)}
            >
              <option value="">All Teachers</option>
              <option value="unassigned">Unassigned</option>
              {teacherOptions.map((teacher) => (
                <option key={teacher.id} value={teacher.id}>
                  {teacher.name}
                </option>
              ))}
            </select>
            <select className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-400 focus:outline-none">
              <option value="">All Courses</option>
              <option value="5x">5x/week</option>
              <option value="3x">3x/week</option>
              <option value="2x">2x/week</option>
            </select>
            <select className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-400 focus:outline-none">
              <option value="">This Month</option>
              <option value="next">Next Month</option>
            </select>
          </div>

          <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200 bg-white">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3 text-left">Teacher</th>
                  <th className="px-4 py-3 text-left">Course</th>
                  <th className="px-4 py-3 text-left">Student</th>
                  <th className="px-4 py-3 text-left">Reg/Depo</th>
                  <th className="px-4 py-3 text-center">Jan</th>
                  <th className="px-4 py-3 text-center">Feb</th>
                  <th className="px-4 py-3 text-center">Mar</th>
                  <th className="px-4 py-3 text-center">Apr</th>
                  <th className="px-4 py-3 text-center">May</th>
                  <th className="px-4 py-3 text-center">Jun</th>
                  <th className="px-4 py-3 text-center">Jul</th>
                  <th className="px-4 py-3 text-center">Aug</th>
                  <th className="px-4 py-3 text-center">Sep</th>
                  <th className="px-4 py-3 text-center">Oct</th>
                  <th className="px-4 py-3 text-center">Nov</th>
                  <th className="px-4 py-3 text-center">Dec</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td className="px-4 py-3 text-slate-500" colSpan={16}>
                      Loading online students...
                    </td>
                  </tr>
                ) : filteredStudents.length === 0 ? (
                  <tr>
                    <td className="px-4 py-3 text-slate-500" colSpan={16}>
                      No online students found.
                    </td>
                  </tr>
                ) : (
                  filteredStudents.map((student) => {
                    const teacherName = student.assigned_teacher_id
                      ? teacherById.get(student.assigned_teacher_id)?.name ?? "Unknown"
                      : "Unassigned";
                    return (
                      <tr key={student.id}>
                        <td className="px-4 py-3 text-slate-700">{teacherName}</td>
                        <td className="px-4 py-3 text-slate-500">—</td>
                        <td className="px-4 py-3 font-medium text-slate-800">{student.name}</td>
                        <td className="px-4 py-3 text-slate-500">—</td>
                        {Array.from({ length: 12 }).map((_, idx) => (
                          <td key={`${student.id}-m-${idx}`} className="px-4 py-3 text-center text-slate-400">
                            —
                          </td>
                        ))}
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
