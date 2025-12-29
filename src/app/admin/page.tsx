"use client";
import React, { useState, useEffect, useMemo, useCallback } from "react";
import AdminNavbar from "@/components/admin/AdminNavbar";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ChevronsUpDown, Check, Layers, UserPlus, Plus, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import ClassDistributionChart from "@/components/admin/ClassDistributionChart";
import TeacherAssignmentChart from "@/components/admin/TeacherAssignmentChart";

interface Student {
  id: string;
  name: string;
  parent_id: string;
  assigned_teacher_id: string | null;
  class_id: string | null;
  memorization_completed?: boolean;
  memorization_completed_date?: string;
}

interface Teacher {
  id: string;
  name: string;
  email: string;
}

interface Parent {
  id: string;
  name: string;
  email: string;
}

interface Class {
  id: string;
  name: string;
  level?: string | null;
}


export default function AdminPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [parents, setParents] = useState<Parent[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [loading, setLoading] = useState(false);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Form states
  const [isAddStudentModalOpen, setIsAddStudentModalOpen] = useState(false);
  const [newStudentName, setNewStudentName] = useState("");
  const [newStudentParentId, setNewStudentParentId] = useState("");
  const [newStudentTeacherId, setNewStudentTeacherId] = useState("");
  const [newStudentClassId, setNewStudentClassId] = useState("");
  const [addParentOpen, setAddParentOpen] = useState(false);
  const [newClassName, setNewClassName] = useState("");
  const [newClassLevel, setNewClassLevel] = useState("");
  const [classLoading, setClassLoading] = useState(false);
  const [classError, setClassError] = useState("");
  const [classSuccess, setClassSuccess] = useState("");
  const [editingClassId, setEditingClassId] = useState<string | null>(null);
  const [editingClassName, setEditingClassName] = useState("");
  const [editingClassLevel, setEditingClassLevel] = useState("");
  const [isClassesModalOpen, setIsClassesModalOpen] = useState(false);
  
  // Filter states
  const [searchTerm, setSearchTerm] = useState("");
  const [filterClass, setFilterClass] = useState("");
  const [filterTeacher, setFilterTeacher] = useState("");
  
  // Edit states
  const [editStudentId, setEditStudentId] = useState<string | null>(null);
  const [editStudentForm, setEditStudentForm] = useState<{ name: string; parent_id: string; assigned_teacher_id: string; class_id: string }>({ name: '', parent_id: '', assigned_teacher_id: '', class_id: '' });
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState("");
  const [editParentOpen, setEditParentOpen] = useState(false);

  // Dev log helper
  const isDev = useMemo(() => process.env.NODE_ENV !== 'production', []);

  // Safe error parsing helper
  const parseError = useCallback(async (res: Response) => {
    try {
      const ct = res.headers.get('content-type') || '';
      if (ct.includes('application/json')) {
        const j = await res.json();
        return j?.error || res.statusText || 'Request failed';
      }
      const t = await res.text();
      return t || res.statusText || 'Request failed';
    } catch {
      return res.statusText || 'Unknown error';
    }
  }, []);

  useEffect(() => {
    async function fetchData() {
      try {
        if (isDev) console.log('Admin page: Starting parallel data fetch...');
        const [studentsRes, parentsRes, teachersRes, classesRes] = await Promise.all([
          fetch('/api/admin/students'),
          fetch('/api/admin/users?role=parent'),
          fetch('/api/admin/users?role=teacher'),
          fetch('/api/admin/classes'),
        ]);

        if (studentsRes.ok) {
          const studentsData = await studentsRes.json();
          if (isDev) console.log('Students data received:', studentsData.length);
          setStudents(studentsData);
        } else {
          const err = await parseError(studentsRes);
          if (isDev) console.error('Students fetch failed:', studentsRes.status, err);
          setError(`Failed to load students: ${err}`);
        }

        if (parentsRes.ok) {
          const parentsData = await parentsRes.json();
          if (isDev) console.log('Parents data received:', parentsData.length);
          setParents(parentsData);
        } else if (isDev) {
          console.error('Parents fetch failed:', parentsRes.status, await parseError(parentsRes));
        }

        if (teachersRes.ok) {
          const teachersData = await teachersRes.json();
          if (isDev) console.log('Teachers data received:', teachersData.length);
          setTeachers(teachersData);
        } else if (isDev) {
          console.error('Teachers fetch failed:', teachersRes.status, await parseError(teachersRes));
        }

        if (classesRes.ok) {
          const classesData = await classesRes.json();
          if (isDev) console.log('Classes data received:', classesData.length);
          setClasses(classesData);
        } else if (isDev) {
          console.error('Classes fetch failed:', classesRes.status, await parseError(classesRes));
        }
      } catch (error) {
        console.error('Failed to fetch admin data:', error);
        setError('Failed to load admin data. Please refresh the page.');
      } finally {
        setIsInitialLoading(false);
      }
    }
    fetchData();
  }, [isDev, parseError]);

  const classStudentCounts = useMemo(() => {
    const counts = new Map<string, number>();
    students.forEach((student) => {
      if (!student.class_id) return;
      counts.set(student.class_id, (counts.get(student.class_id) || 0) + 1);
    });
    return counts;
  }, [students]);

  const handleAddStudent = async () => {
    if (!newStudentName.trim()) return;
    setLoading(true);
    setError("");
    
    try {
      const response = await fetch('/api/admin/students', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newStudentName.trim(),
          parent_id: newStudentParentId || null,
          assigned_teacher_id: newStudentTeacherId || null,
          class_id: newStudentClassId || null
        })
      });

      if (response.ok) {
        const newStudent = await response.json();
        setStudents([...students, newStudent].sort((a, b) => a.name.localeCompare(b.name)));
        setNewStudentName("");
        setNewStudentParentId("");
        setNewStudentTeacherId("");
        setNewStudentClassId("");
        setSuccess("Student added successfully!");
        setTimeout(() => setSuccess(""), 3000);
      } else {
        const err = await parseError(response);
        setError("Failed to add student: " + err);
      }
    } catch {
      setError("Failed to add student: Network error");
    }
    setLoading(false);
  };

  const handleAddClass = async () => {
    const name = newClassName.trim();
    if (!name) return;
    setClassLoading(true);
    setClassError("");
    setClassSuccess("");

    try {
      const response = await fetch('/api/admin/classes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, level: newClassLevel || null })
      });

      if (response.ok) {
        const newClass = await response.json();
        setClasses(prev => [...prev, newClass].sort((a, b) => a.name.localeCompare(b.name)));
        setNewClassName("");
        setNewClassLevel("");
        setClassSuccess("Class added successfully!");
        setTimeout(() => setClassSuccess(""), 3000);
      } else {
        const err = await parseError(response);
        setClassError("Failed to add class: " + err);
      }
    } catch {
      setClassError("Failed to add class: Network error");
    }

    setClassLoading(false);
  };

  const handleStartEditClass = (classItem: Class) => {
    setEditingClassId(classItem.id);
    setEditingClassName(classItem.name);
    setEditingClassLevel(classItem.level ?? "");
    setClassError("");
    setClassSuccess("");
  };

  const handleCancelEditClass = () => {
    setEditingClassId(null);
    setEditingClassName("");
    setEditingClassLevel("");
  };

  const handleSaveClass = async (classId: string) => {
    const name = editingClassName.trim();
    if (!name) return;
    setClassLoading(true);
    setClassError("");
    setClassSuccess("");

    try {
      const response = await fetch('/api/admin/classes', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: classId, name, level: editingClassLevel || null })
      });

      if (response.ok) {
        const updatedClass = await response.json();
        setClasses(prev =>
          prev
            .map(c => (c.id === classId ? updatedClass : c))
            .sort((a, b) => a.name.localeCompare(b.name))
        );
        setEditingClassId(null);
        setEditingClassName("");
        setEditingClassLevel("");
        setClassSuccess("Class updated successfully!");
        setTimeout(() => setClassSuccess(""), 3000);
      } else {
        const err = await parseError(response);
        setClassError("Failed to update class: " + err);
      }
    } catch {
      setClassError("Failed to update class: Network error");
    }

    setClassLoading(false);
  };

  const handleDeleteClass = async (classItem: Class) => {
    const confirmed = window.confirm(
      `Delete class "${classItem.name}"? Students in this class will become unassigned.`
    );
    if (!confirmed) return;

    setClassLoading(true);
    setClassError("");
    setClassSuccess("");

    try {
      const response = await fetch(`/api/admin/classes?id=${classItem.id}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        setClasses(prev => prev.filter(c => c.id !== classItem.id));
        setStudents(prev =>
          prev.map(student =>
            student.class_id === classItem.id
              ? { ...student, class_id: null }
              : student
          )
        );
        if (newStudentClassId === classItem.id) setNewStudentClassId("");
        if (filterClass === classItem.id) setFilterClass("");
        if (editStudentForm.class_id === classItem.id) {
          setEditStudentForm(prev => ({ ...prev, class_id: "" }));
        }
        if (editingClassId === classItem.id) handleCancelEditClass();
        setClassSuccess("Class deleted successfully!");
        setTimeout(() => setClassSuccess(""), 3000);
      } else {
        const err = await parseError(response);
        setClassError("Failed to delete class: " + err);
      }
    } catch {
      setClassError("Failed to delete class: Network error");
    }

    setClassLoading(false);
  };

  const classLevels = [
    "Lower Primary",
    "Upper Primary",
    "Lower Secondary",
    "Upper Secondary"
  ];

  const handleEditStudent = (student: Student) => {
    setEditStudentId(student.id);
    setEditStudentForm({
      name: student.name,
      parent_id: student.parent_id || '',
      assigned_teacher_id: student.assigned_teacher_id || '',
      class_id: student.class_id || ''
    });
  };

  const handleSaveEditStudent = async (studentId: string) => {
    if (!editStudentForm.name.trim()) return;
    setEditLoading(true);
    setEditError("");
    
    try {
      const response = await fetch('/api/admin/students', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: studentId,
          name: editStudentForm.name.trim(),
          parent_id: editStudentForm.parent_id || null,
          assigned_teacher_id: editStudentForm.assigned_teacher_id || null,
          class_id: editStudentForm.class_id || null
        })
      });

      if (response.ok) {
        const updatedStudent = await response.json();
        setStudents(
          students
            .map(s => s.id === studentId ? updatedStudent : s)
            .sort((a, b) => a.name.localeCompare(b.name))
        );
        setEditStudentId(null);
      } else {
        const err = await parseError(response);
        setEditError("Failed to update student: " + err);
      }
  } catch {
      setEditError("Failed to update student: Network error");
    }
    setEditLoading(false);
  };

  const handleDeleteStudent = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this student?')) return;
    
    try {
      const response = await fetch(`/api/admin/students?id=${id}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        setStudents(students.filter(s => s.id !== id));
        setSuccess("Student deleted successfully!");
        setTimeout(() => setSuccess(""), 3000);
      } else {
        const err = await parseError(response);
        setError("Failed to delete student: " + err);
      }
    } catch {
      setError("Failed to delete student: Network error");
    }
  };

  const handleToggleCompletion = async (studentId: string, completed: boolean) => {
    const action = completed ? 'mark as completed' : 'mark as incomplete';
    if (!window.confirm(`Are you sure you want to ${action} this student's memorization?`)) return;
    
    setLoading(true);
    setError("");
    
    try {
      const response = await fetch('/api/admin/students/completion', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          student_id: studentId,
          completed: completed
        })
      });

      if (response.ok) {
        const result = await response.json();
        setStudents(result.students);
        setSuccess(`Student ${completed ? 'marked as completed' : 'marked as incomplete'} successfully!`);
        setTimeout(() => setSuccess(""), 3000);
      } else {
        const err = await parseError(response);
        setError("Failed to update completion status: " + err);
      }
    } catch {
      setError("Failed to update completion status: Network error");
    } finally {
      setLoading(false);
    }
  };

  const filteredStudents = useMemo(() => students.filter(s => 
    s.name.toLowerCase().includes(searchTerm.toLowerCase()) &&
    (filterClass === "" || 
     (filterClass === "unassigned" && !s.class_id) || 
     s.class_id === filterClass) &&
    (filterTeacher === "" || 
     (filterTeacher === "unassigned" && !s.assigned_teacher_id) || 
     s.assigned_teacher_id === filterTeacher)
  ).sort((a, b) => a.name.localeCompare(b.name)), [students, searchTerm, filterClass, filterTeacher]);

  // Precompute quick lookups
  const parentById = useMemo(() => new Map(parents.map((p) => [p.id, p])), [parents]);
  const teacherById = useMemo(() => new Map(teachers.map((t) => [t.id, t])), [teachers]);
  const classById = useMemo(() => new Map(classes.map((c) => [c.id, c])), [classes]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#f8fafc] via-[#e2e8f0] to-[#f1f5f9]">
      <AdminNavbar />
      <div className="relative p-4 sm:p-6">
        <header className="mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">Student Management</h1>
            <p className="text-gray-600">Manage students, assign parents, teachers, and classes.</p>
          </div>
        </header>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
          <Card className="p-4">
            <div className="text-2xl font-bold">{students.length}</div>
            <div className="text-sm text-gray-600">Total Students</div>
          </Card>
          <Card className="p-4">
            <div className="text-2xl font-bold text-green-600">{students.filter(s => s.class_id).length}</div>
            <div className="text-sm text-gray-600">In a Class</div>
          </Card>
          <Card className="p-4">
            <div className="text-2xl font-bold text-orange-600">{students.filter(s => s.assigned_teacher_id).length}</div>
            <div className="text-sm text-gray-600">With a Teacher</div>
          </Card>
          <Card className="p-4">
            <div className="text-2xl font-bold text-purple-600">{students.filter(s => s.memorization_completed).length}</div>
            <div className="text-sm text-gray-600">Completed Memorization</div>
          </Card>
          {filteredStudents.length !== students.length ? (
            <Card className="p-4">
              <div className="text-2xl font-bold text-blue-600">{filteredStudents.length}</div>
              <div className="text-sm text-gray-600">Filtered Results</div>
            </Card>
          ) : (
            <Card className="p-4">
              <div className="text-2xl font-bold text-purple-600">{students.filter(s => !s.memorization_completed).length}</div>
              <div className="text-sm text-gray-600">Still Memorizing</div>
            </Card>
          )}
        </div>

        {/* Charts Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <Card className="p-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">Class Distribution</h3>
            <ClassDistributionChart students={students} classes={classes} />
          </Card>
          <Card className="p-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">Teacher Assignments</h3>
            <TeacherAssignmentChart students={students} teachers={teachers} />
          </Card>
        </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <button
          type="button"
          onClick={() => setIsClassesModalOpen(true)}
          className="inline-flex items-center justify-center gap-2 rounded-full border border-gray-200 bg-white px-5 py-3 text-sm font-semibold text-gray-800 shadow-md transition hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40"
        >
          <Settings className="h-4 w-4 text-gray-700" />
          Manage Classes
        </button>
        <button
          type="button"
          onClick={() => setIsAddStudentModalOpen(true)}
          className="inline-flex items-center justify-center gap-2 rounded-full bg-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-md transition hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40"
        >
          <Plus className="h-4 w-4 text-white" />
          Add Student
        </button>
      </div>

      {/* Students List Section */}
      <Card className="p-4">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Students List</h2>
        
        {/* Filters */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <input 
            type="text" 
            placeholder="Search by name..." 
            className="w-full border-gray-300 rounded-md shadow-sm p-2 border" 
            value={searchTerm} 
            onChange={e => setSearchTerm(e.target.value)} 
          />
          <select 
            className="w-full border-gray-300 rounded-md shadow-sm p-2 border" 
            value={filterClass} 
            onChange={e => setFilterClass(e.target.value)}
          >
            <option value="">All Classes</option>
            <option value="unassigned">Unassigned</option>
            {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select 
            className="w-full border-gray-300 rounded-md shadow-sm p-2 border" 
            value={filterTeacher} 
            onChange={e => setFilterTeacher(e.target.value)}
          >
            <option value="">All Teachers</option>
            <option value="unassigned">Unassigned</option>
            {teachers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>

        <div className="overflow-x-auto border rounded-lg">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Student Name</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Parent</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Teacher</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Class</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Memorization</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredStudents.map(s => (
                <tr key={s.id}>
                  {editStudentId === s.id ? (
                    <td className="px-4 py-3" colSpan={6}>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">Student Name</label>
                          <input 
                            type="text" 
                            className="w-full border-gray-300 rounded-md shadow-sm p-2 border text-sm" 
                            value={editStudentForm.name} 
                            onChange={e => setEditStudentForm({ ...editStudentForm, name: e.target.value })} 
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">Parent</label>
                          <Popover open={editParentOpen} onOpenChange={setEditParentOpen}>
                            <PopoverTrigger asChild>
                              <Button
                                variant="outline"
                                role="combobox"
                                aria-expanded={editParentOpen}
                                className="w-full justify-between"
                              >
                                {editStudentForm.parent_id
                                  ? `${parentById.get(editStudentForm.parent_id)?.name || ""} (${parentById.get(editStudentForm.parent_id)?.email || ""})`
                                  : "No parent assigned"}
                                <ChevronsUpDown className="opacity-50" />
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-[420px] p-0">
                              <Command>
                                <CommandInput placeholder="Search parent..." className="h-9" />
                                <CommandList>
                                  <CommandEmpty>No parent found.</CommandEmpty>
                                  <CommandGroup>
                                    <CommandItem
                                      value="none"
                                      onSelect={() => {
                                        setEditStudentForm({ ...editStudentForm, parent_id: "" });
                                        setEditParentOpen(false);
                                      }}
                                    >
                                      No parent assigned
                                      <Check className={cn("ml-auto", editStudentForm.parent_id === "" ? "opacity-100" : "opacity-0")} />
                                    </CommandItem>
                                    {parents.map(p => (
                                      <CommandItem
                                        key={p.id}
                                        value={p.name + " " + p.email}
                                        onSelect={() => {
                                          setEditStudentForm({ ...editStudentForm, parent_id: p.id });
                                          setEditParentOpen(false);
                                        }}
                                      >
                                        {p.name} ({p.email})
                                        <Check className={cn("ml-auto", editStudentForm.parent_id === p.id ? "opacity-100" : "opacity-0")} />
                                      </CommandItem>
                                    ))}
                                  </CommandGroup>
                                </CommandList>
                              </Command>
                            </PopoverContent>
                          </Popover>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">Teacher</label>
                          <select
                            className="w-full border-gray-300 rounded-md shadow-sm p-2 border text-sm"
                            value={editStudentForm.assigned_teacher_id}
                            onChange={e => setEditStudentForm({ ...editStudentForm, assigned_teacher_id: e.target.value })}
                          >
                            <option value="">No teacher assigned</option>
                            {teachers.map(t => (
                              <option key={t.id} value={t.id}>{t.name} ({t.email})</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">Class</label>
                          <select
                            className="w-full border-gray-300 rounded-md shadow-sm p-2 border text-sm"
                            value={editStudentForm.class_id}
                            onChange={e => setEditStudentForm({ ...editStudentForm, class_id: e.target.value })}
                          >
                            <option value="">No class assigned</option>
                            {classes.map(c => (
                              <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                      {editError && <p className="text-red-500 text-sm mt-2">{editError}</p>}
                      <div className="flex gap-2 items-center mt-4">
                        <button 
                          onClick={() => handleSaveEditStudent(s.id)} 
                          disabled={editLoading} 
                          className="bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700 disabled:opacity-50"
                        >
                          {editLoading ? 'Saving...' : 'Save'}
                        </button>
                        <button 
                          onClick={() => setEditStudentId(null)} 
                          className="bg-gray-500 text-white px-3 py-1 rounded text-sm hover:bg-gray-600"
                        >
                          Cancel
                        </button>
                      </div>
                    </td>
                  ) : (
                    <>
                      <td className="px-4 py-3 font-medium text-gray-900">{s.name}</td>
                      <td className="px-4 py-3 text-gray-600">
                        {s.parent_id ? parentById.get(s.parent_id)?.name || '-' : '-'}
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {s.assigned_teacher_id ? teacherById.get(s.assigned_teacher_id)?.name || '-' : '-'}
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {s.class_id ? classById.get(s.class_id)?.name || '-' : '-'}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex flex-col items-center gap-2">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                            s.memorization_completed 
                              ? 'bg-purple-100 text-purple-800' 
                              : 'bg-gray-100 text-gray-800'
                          }`}>
                            {s.memorization_completed ? 'Completed' : 'In Progress'}
                          </span>
                          {s.memorization_completed_date && (
                            <span className="text-xs text-gray-500">
                              {new Date(s.memorization_completed_date).toLocaleDateString()}
                            </span>
                          )}
                          <button
                            onClick={() => handleToggleCompletion(s.id, !s.memorization_completed)}
                            className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                              s.memorization_completed
                                ? 'bg-red-100 hover:bg-red-200 text-red-700'
                                : 'bg-purple-100 hover:bg-purple-200 text-purple-700'
                            }`}
                            disabled={loading}
                          >
                            {s.memorization_completed ? 'Mark Incomplete' : 'Mark Complete'}
                          </button>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          <button 
                            onClick={() => handleEditStudent(s)} 
                            className="bg-blue-600 text-white px-3 py-1 rounded text-xs hover:bg-blue-700"
                          >
                            Edit
                          </button>
                          <button 
                            onClick={() => handleDeleteStudent(s.id)} 
                            className="bg-red-600 text-white px-3 py-1 rounded text-xs hover:bg-red-700"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </>
                  )}
                </tr>
              ))}
              {isInitialLoading && (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-gray-500">
                    Loading students...
                  </td>
                </tr>
              )}
              {!isInitialLoading && filteredStudents.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-gray-500">
                    No students match the current filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
      {isClassesModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-5xl max-h-[85vh] overflow-hidden">
            <div className="flex items-start justify-between border-b border-gray-100 p-6">
              <div>
                <h2 className="text-xl font-semibold text-gray-900">Classes</h2>
                <p className="text-sm text-gray-500">{classes.length} total</p>
              </div>
              <button
                onClick={() => setIsClassesModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 p-1"
                aria-label="Close classes modal"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-6 space-y-4 overflow-y-auto max-h-[calc(85vh-96px)]">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Class Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="Enter class name"
                    className="w-full border-gray-300 rounded-md shadow-sm p-2 border"
                    value={newClassName}
                    onChange={e => setNewClassName(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Level (Optional)
                  </label>
                  <select
                    className="w-full border-gray-300 rounded-md shadow-sm p-2 border"
                    value={newClassLevel}
                    onChange={e => setNewClassLevel(e.target.value)}
                  >
                    <option value="">Select level</option>
                    {classLevels.map(level => (
                      <option key={level} value={level}>{level}</option>
                    ))}
                  </select>
                </div>
                <div className="flex items-end">
                  <button
                    onClick={handleAddClass}
                    disabled={!newClassName.trim() || classLoading}
                    className="w-full bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {classLoading ? 'Saving...' : 'Add Class'}
                  </button>
                </div>
              </div>

              {classError && <p className="text-red-500 text-sm">{classError}</p>}
              {classSuccess && <p className="text-green-500 text-sm">{classSuccess}</p>}

              <div className="overflow-x-auto border rounded-lg">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Class Name
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Level
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Students
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {classes.map((classItem) => {
                      const isEditing = editingClassId === classItem.id;
                      const studentCount = classStudentCounts.get(classItem.id) || 0;
                      return (
                      <tr key={classItem.id}>
                        <td className="px-4 py-3 text-sm text-gray-900">
                          {isEditing ? (
                            <input
                              type="text"
                              className="w-full border-gray-300 rounded-md shadow-sm p-2 border"
                              value={editingClassName}
                              onChange={e => setEditingClassName(e.target.value)}
                            />
                          ) : (
                            classItem.name
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-700">
                          {isEditing ? (
                            <select
                              className="w-full border-gray-300 rounded-md shadow-sm p-2 border"
                              value={editingClassLevel}
                              onChange={e => setEditingClassLevel(e.target.value)}
                            >
                              <option value="">Select level</option>
                              {classLevels.map(level => (
                                <option key={level} value={level}>{level}</option>
                              ))}
                            </select>
                          ) : (
                            classItem.level || "—"
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-700">
                          {studentCount}
                        </td>
                          <td className="px-4 py-3 text-sm text-gray-700">
                            {isEditing ? (
                              <div className="flex gap-2">
                                <button
                                  onClick={() => handleSaveClass(classItem.id)}
                                  disabled={!editingClassName.trim() || classLoading}
                                  className="bg-blue-600 text-white px-3 py-1 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                >
                                  Save
                                </button>
                                <button
                                  onClick={handleCancelEditClass}
                                  className="bg-gray-200 text-gray-700 px-3 py-1 rounded-md hover:bg-gray-300 transition-colors"
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <div className="flex gap-2">
                                <button
                                  onClick={() => handleStartEditClass(classItem)}
                                  className="bg-blue-100 text-blue-700 px-3 py-1 rounded-md hover:bg-blue-200 transition-colors"
                                >
                                  Edit
                                </button>
                                <button
                                  onClick={() => handleDeleteClass(classItem)}
                                  disabled={classLoading}
                                  className="bg-red-100 text-red-700 px-3 py-1 rounded-md hover:bg-red-200 disabled:opacity-50 transition-colors"
                                >
                                  Delete
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                    {classes.length === 0 && (
                      <tr>
                        <td className="px-4 py-3 text-sm text-gray-500" colSpan={4}>
                          No classes found.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
      {isAddStudentModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[85vh] overflow-hidden">
            <div className="flex items-start justify-between border-b border-gray-100 p-6">
              <div>
                <h2 className="text-xl font-semibold text-gray-900">Add Student</h2>
                <p className="text-sm text-gray-500">Create a new student record</p>
              </div>
              <button
                onClick={() => setIsAddStudentModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 p-1"
                aria-label="Close add student modal"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-6 space-y-4 overflow-y-auto max-h-[calc(85vh-96px)]">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Student Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="Enter student name"
                    className="w-full border-gray-300 rounded-md shadow-sm p-2 border"
                    value={newStudentName}
                    onChange={e => setNewStudentName(e.target.value)}
                    required
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Parent (Optional)
                  </label>
                  <Popover open={addParentOpen} onOpenChange={setAddParentOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={addParentOpen}
                        className="w-full justify-between"
                     >
                        {newStudentParentId
                          ? `${parentById.get(newStudentParentId)?.name || ""} (${parentById.get(newStudentParentId)?.email || ""})`
                          : "Select parent (optional)"}
                        <ChevronsUpDown className="opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[420px] p-0">
                      <Command>
                        <CommandInput placeholder="Search parent..." className="h-9" />
                        <CommandList>
                          <CommandEmpty>No parent found.</CommandEmpty>
                          <CommandGroup>
                            <CommandItem
                              value="none"
                              onSelect={() => {
                                setNewStudentParentId("");
                                setAddParentOpen(false);
                              }}
                            >
                              No parent assigned
                              <Check className={cn("ml-auto", newStudentParentId === "" ? "opacity-100" : "opacity-0")} />
                            </CommandItem>
                            {parents.map(p => (
                              <CommandItem
                                key={p.id}
                                value={p.name + " " + p.email}
                                onSelect={() => {
                                  setNewStudentParentId(p.id);
                                  setAddParentOpen(false);
                                }}
                              >
                                {p.name} ({p.email})
                                <Check className={cn("ml-auto", newStudentParentId === p.id ? "opacity-100" : "opacity-0")} />
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Teacher (Optional)
                  </label>
                  <select
                    className="w-full border-gray-300 rounded-md shadow-sm p-2 border"
                    value={newStudentTeacherId}
                    onChange={e => setNewStudentTeacherId(e.target.value)}
                  >
                    <option value="">Select teacher (optional)</option>
                    {teachers.map(t => (
                      <option key={t.id} value={t.id}>{t.name} ({t.email})</option>
                    ))}
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Class (Optional)
                  </label>
                  <select
                    className="w-full border-gray-300 rounded-md shadow-sm p-2 border"
                    value={newStudentClassId}
                    onChange={e => setNewStudentClassId(e.target.value)}
                  >
                    <option value="">Select class (optional)</option>
                    {classes.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              
              {error && <p className="text-red-500 text-sm">{error}</p>}
              {success && <p className="text-green-500 text-sm">{success}</p>}
              
              <div className="flex gap-2">
                <button
                  onClick={handleAddStudent}
                  disabled={!newStudentName.trim() || loading}
                  className="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {loading ? 'Adding...' : 'Add Student'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
