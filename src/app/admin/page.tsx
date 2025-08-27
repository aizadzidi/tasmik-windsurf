"use client";
import React, { useState, useEffect, useMemo } from "react";
import AdminNavbar from "@/components/admin/AdminNavbar";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ChevronsUpDown, Check } from "lucide-react";
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
}


export default function AdminPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [parents, setParents] = useState<Parent[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Form states
  const [showAddForm, setShowAddForm] = useState(false);
  const [newStudentName, setNewStudentName] = useState("");
  const [newStudentParentId, setNewStudentParentId] = useState("");
  const [newStudentTeacherId, setNewStudentTeacherId] = useState("");
  const [newStudentClassId, setNewStudentClassId] = useState("");
  const [addParentOpen, setAddParentOpen] = useState(false);
  
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

  useEffect(() => {
    async function fetchData() {
      console.log('Admin page: Starting data fetch...');
      try {
        // Fetch students via secure API
        const studentsResponse = await fetch('/api/admin/students');
        console.log('Students response:', studentsResponse.status, studentsResponse.ok);
        if (studentsResponse.ok) {
          const studentsData = await studentsResponse.json();
          console.log('Students data received:', studentsData.length);
          setStudents(studentsData);
        } else {
          const errorData = await studentsResponse.text();
          console.error('Students fetch failed:', studentsResponse.status, errorData);
          setError(`Failed to load students: ${studentsResponse.status}`);
        }

        // Fetch parents via secure API
        const parentsResponse = await fetch('/api/admin/users?role=parent');
        console.log('Parents response:', parentsResponse.status, parentsResponse.ok);
        if (parentsResponse.ok) {
          const parentsData = await parentsResponse.json();
          console.log('Parents data received:', parentsData.length);
          setParents(parentsData);
        } else {
          const errorData = await parentsResponse.text();
          console.error('Parents fetch failed:', parentsResponse.status, errorData);
        }

        // Fetch teachers via secure API
        const teachersResponse = await fetch('/api/admin/users?role=teacher');
        console.log('Teachers response:', teachersResponse.status, teachersResponse.ok);
        if (teachersResponse.ok) {
          const teachersData = await teachersResponse.json();
          console.log('Teachers data received:', teachersData.length);
          setTeachers(teachersData);
        } else {
          const errorData = await teachersResponse.text();
          console.error('Teachers fetch failed:', teachersResponse.status, errorData);
        }

        // Fetch classes via secure API
        const classesResponse = await fetch('/api/admin/classes');
        console.log('Classes response:', classesResponse.status, classesResponse.ok);
        if (classesResponse.ok) {
          const classesData = await classesResponse.json();
          console.log('Classes data received:', classesData.length);
          setClasses(classesData);
        } else {
          const errorData = await classesResponse.text();
          console.error('Classes fetch failed:', classesResponse.status, errorData);
        }

      } catch (error) {
        console.error('Failed to fetch admin data:', error);
        setError('Failed to load admin data. Please refresh the page.');
      }
    }
    fetchData();
  }, []);

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
        setShowAddForm(false);
        setSuccess("Student added successfully!");
        setTimeout(() => setSuccess(""), 3000);
      } else {
        const errorData = await response.json();
        setError("Failed to add student: " + (errorData.error || 'Unknown error'));
      }
    } catch (error) {
      setError("Failed to add student: Network error");
    }
    setLoading(false);
  };

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
        setStudents(students.map(s => s.id === studentId ? updatedStudent : s));
        setEditStudentId(null);
      } else {
        const errorData = await response.json();
        setEditError("Failed to update student: " + (errorData.error || 'Unknown error'));
      }
    } catch (error) {
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
        const errorData = await response.json();
        setError("Failed to delete student: " + (errorData.error || 'Unknown error'));
      }
    } catch (error) {
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
        const errorData = await response.json();
        setError("Failed to update completion status: " + (errorData.error || 'Unknown error'));
      }
    } catch (err) {
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

      {/* Add Student Section */}
      <Card className="p-4 mb-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold text-gray-900">Add Student</h2>
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition-colors"
          >
            {showAddForm ? 'Cancel' : 'Add Student'}
          </button>
        </div>

        {showAddForm && (
          <div className="space-y-4 border-t pt-4">
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
                        ? `${parents.find(p => p.id === newStudentParentId)?.name || ""} (${parents.find(p => p.id === newStudentParentId)?.email || ""})`
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
        )}
      </Card>

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
                                  ? `${parents.find(p => p.id === editStudentForm.parent_id)?.name || ""} (${parents.find(p => p.id === editStudentForm.parent_id)?.email || ""})`
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
                        {parents.find(p => p.id === s.parent_id)?.name || '-'}
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {teachers.find(t => t.id === s.assigned_teacher_id)?.name || '-'}
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {classes.find(c => c.id === s.class_id)?.name || '-'}
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
              {filteredStudents.length === 0 && (
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
      </div>
    </div>
  );
}
