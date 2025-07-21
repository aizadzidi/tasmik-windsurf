"use client";
import { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";
import SignOutButton from "@/components/SignOutButton";
import { Card } from "@/components/ui/Card";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

interface Student {
  id: string;
  name: string;
  parent_id: string;
  assigned_teacher_id: string | null;
  class_id: string | null;
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
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [parents, setParents] = useState<Parent[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [assignLoading, setAssignLoading] = useState<string | null>(null);
  const [assignError, setAssignError] = useState<string>("");

  // New student form states
  const [newStudentName, setNewStudentName] = useState("");
  const [newStudentParentSearch, setNewStudentParentSearch] = useState("");
  const [newStudentParentId, setNewStudentParentId] = useState("");
  const [newStudentClassId, setNewStudentClassId] = useState("");
  const [newStudentTeacherId, setNewStudentTeacherId] = useState("");
  
  // Search and filter states
  const [searchTerm, setSearchTerm] = useState("");
  const [filterClass, setFilterClass] = useState("");
  const [filterTeacher, setFilterTeacher] = useState("");
  const [filterParent, setFilterParent] = useState("");
  
  // Edit student states
  const [editStudentId, setEditStudentId] = useState<string | null>(null);
  const [editStudentForm, setEditStudentForm] = useState<{ name: string; parent_id: string; parentSearch: string }>({ name: '', parent_id: '', parentSearch: '' });
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState("");

  useEffect(() => {
    async function fetchStudents() {
      const { data, error } = await supabase
        .from("students")
        .select("*")
        .order("name");
      if (!error && data) setStudents(data);
    }
    async function fetchTeachers() {
      const { data, error } = await supabase
        .from("users")
        .select("id, name, email")
        .eq("role", "teacher");
      if (!error && data) setTeachers(data);
    }
    async function fetchParents() {
      const { data, error } = await supabase
        .from("users")
        .select("id, name, email")
        .eq("role", "parent");
      if (!error && data) setParents(data);
    }
    async function fetchClasses() {
      const { data, error } = await supabase
        .from("classes")
        .select("id, name")
        .order("name");
      if (!error && data) {
        console.log('Classes fetched:', data);
        setClasses(data);
      } else {
        console.error('Error fetching classes:', error);
      }
    }
    fetchStudents();
    fetchTeachers();
    fetchParents();
    fetchClasses();
  }, []);

  const handleAddStudent = async () => {
    if (!newStudentName.trim()) return;
    
    setLoading(true);
    setError("");
    
    const { error } = await supabase
      .from("students")
      .insert([{ 
        name: newStudentName.trim(),
        parent_id: newStudentParentId || null,
        class_id: newStudentClassId || null,
        assigned_teacher_id: newStudentTeacherId || null
      }]);
    
    if (error) {
      setError("Failed to add student: " + error.message);
    } else {
      setNewStudentName("");
      setNewStudentParentSearch("");
      setNewStudentParentId("");
      setNewStudentClassId("");
      setNewStudentTeacherId("");
      // Refresh students
      const { data } = await supabase
        .from("students")
        .select("*")
        .order("name");
      if (data) setStudents(data);
    }
    
    setLoading(false);
  };

  async function handleEditStudent(student: Student) {
    setEditStudentId(student.id);
    setEditStudentForm({
      name: student.name,
      parent_id: student.parent_id || '',
      parentSearch: parents.find(p => p.id === student.parent_id)?.name + (parents.find(p => p.id === student.parent_id) ? ' (' + parents.find(p => p.id === student.parent_id)?.email + ')' : '') || ''
    });
  }

  const handleSaveEditStudent = async (studentId: string) => {
    if (!editStudentForm.name.trim()) return;
    
    setEditLoading(true);
    setEditError("");
    
    const { error } = await supabase
      .from("students")
      .update({ 
        name: editStudentForm.name.trim(),
        parent_id: editStudentForm.parent_id || null
      })
      .eq("id", studentId);
    
    if (error) {
      setEditError("Failed to update student: " + error.message);
    } else {
      setEditStudentId(null);
      // Refresh students
      const { data } = await supabase
        .from("students")
        .select("*")
        .order("name");
      if (data) setStudents(data);
    }
    
    setEditLoading(false);
  };

  // Filter students based on search and filters
  const filteredStudents = students.filter(student => {
    const matchesSearch = !searchTerm || 
      student.name.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesClass = !filterClass || student.class_id === filterClass;
    
    const matchesTeacher = !filterTeacher || student.assigned_teacher_id === filterTeacher;
    
    const matchesParent = !filterParent || student.parent_id === filterParent;
    
    return matchesSearch && matchesClass && matchesTeacher && matchesParent;
  });

  async function handleDeleteStudent(id: string) {
    if (!window.confirm('Are you sure you want to delete this student?')) return;
    setLoading(true);
    const { error } = await supabase
      .from("students")
      .delete()
      .eq("id", id);
    if (error) {
      setError("Failed to delete student: " + error.message);
    } else {
      const { data } = await supabase
        .from("students")
        .select("*")
        .order("name");
      if (data) setStudents(data);
    }
    setLoading(false);
  }

  return (
    <div className="min-h-screen bg-muted flex flex-col p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold mb-2">Admin Dashboard</h1>
          <p className="text-gray-600">Manage students, assign classes and teachers</p>
        </div>
        <SignOutButton />
      </div>

      {/* Add Student Section */}
      <Card className="p-6 mb-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
            <svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
          </div>
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Add New Student</h2>
            <p className="text-sm text-gray-600">Create a new student profile with optional assignments</p>
          </div>
        </div>
        
        <form onSubmit={(e) => { e.preventDefault(); handleAddStudent(); }} className="space-y-6">
          {/* Student Name - Required */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Student Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors"
              placeholder="Enter student's full name"
              value={newStudentName}
              onChange={e => setNewStudentName(e.target.value)}
              required
            />
          </div>

          {/* Optional Assignments Grid */}
          <div className="bg-gray-50 rounded-lg p-4">
            <h3 className="text-sm font-medium text-gray-700 mb-4">Optional Assignments</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Parent Assignment */}
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-2">Parent</label>
                <input
                  type="text"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors"
                  placeholder="Search parent..."
                  value={newStudentParentSearch || ""}
                  onChange={e => setNewStudentParentSearch(e.target.value)}
                  list="parent-list"
                  onBlur={e => {
                    const match = parents.find(p => (p.name + ' (' + p.email + ')') === newStudentParentSearch);
                    setNewStudentParentId(match ? match.id : '');
                  }}
                />
                <datalist id="parent-list">
                  {parents.filter(p =>
                    !newStudentParentSearch ||
                    p.name.toLowerCase().includes(newStudentParentSearch.toLowerCase()) ||
                    p.email.toLowerCase().includes(newStudentParentSearch.toLowerCase())
                  ).map(p => (
                    <option key={p.id} value={p.name + ' (' + p.email + ')'} data-id={p.id} />
                  ))}
                </datalist>
              </div>
              
              {/* Class Assignment */}
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-2">Class</label>
                <select
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors"
                  value={newStudentClassId}
                  onChange={e => setNewStudentClassId(e.target.value)}
                >
                  <option value="">Select class...</option>
                  {classes.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                {classes.length === 0 && (
                  <p className="text-xs text-red-500 mt-1">No classes available</p>
                )}
              </div>
              
              {/* Teacher Assignment */}
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-2">Teacher</label>
                <select
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors"
                  value={newStudentTeacherId}
                  onChange={e => setNewStudentTeacherId(e.target.value)}
                >
                  <option value="">Select teacher...</option>
                  {teachers.map(t => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Error/Success Messages */}
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
                {error}
              </div>
            </div>
          )}
          {success && (
            <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg text-sm">
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                {success}
              </div>
            </div>
          )}

          {/* Submit Button */}
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={loading || !newStudentName.trim()}
              className="bg-primary text-white px-6 py-3 rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium flex items-center gap-2"
            >
              {loading ? (
                <>
                  <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Adding Student...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                  Add Student
                </>
              )}
            </button>
          </div>
        </form>
      </Card>

      {/* Students Management */}
      <Card className="p-6">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Students</h2>
            <p className="text-sm text-gray-600">Manage student assignments and information</p>
          </div>
        </div>
        
        {/* Search and Filters */}
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
              <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <div>
              <h3 className="text-lg font-medium text-gray-900">Search & Filter</h3>
              <p className="text-sm text-gray-600">Find students quickly using search and filters</p>
            </div>
          </div>
          
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Search Input */}
              <div className="md:col-span-2 lg:col-span-1">
                <label className="block text-sm font-medium text-gray-700 mb-2">Search Students</label>
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Search by name..."
                    className="w-full border border-gray-300 rounded-lg px-4 py-2 pl-10 focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors"
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                  />
                  <svg className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
              </div>
              
              {/* Class Filter */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Class</label>
                <select
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors"
                  value={filterClass}
                  onChange={e => setFilterClass(e.target.value)}
                >
                  <option value="">All Classes</option>
                  {classes.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              
              {/* Teacher Filter */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Teacher</label>
                <select
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors"
                  value={filterTeacher}
                  onChange={e => setFilterTeacher(e.target.value)}
                >
                  <option value="">All Teachers</option>
                  {teachers.map(t => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>
              
              {/* Parent Filter */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Parent</label>
                <select
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors"
                  value={filterParent}
                  onChange={e => setFilterParent(e.target.value)}
                >
                  <option value="">All Parents</option>
                  {parents.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
            </div>
            
            {/* Clear Filters Button */}
            {(searchTerm || filterClass || filterTeacher || filterParent) && (
              <div className="mt-4 flex justify-end">
                <button
                  onClick={() => {
                    setSearchTerm("");
                    setFilterClass("");
                    setFilterTeacher("");
                    setFilterParent("");
                  }}
                  className="text-sm text-gray-600 hover:text-gray-800 underline flex items-center gap-1"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  Clear all filters
                </button>
              </div>
            )}
          </div>
        </div>
        
        {/* Results count */}
        <div className="mb-4 text-sm text-gray-600">
          Showing {filteredStudents.length} of {students.length} students
        </div>
        {assignError && <div className="text-red-500 text-sm mb-4 bg-red-50 p-3 rounded">{assignError}</div>}
        <div className="overflow-x-auto">
          <table className="min-w-full border bg-white rounded-md">
            <thead>
              <tr className="bg-muted">
                <th className="px-3 py-2 text-left">Name</th>
                <th className="px-3 py-2 text-left">Parent</th>
                <th className="px-3 py-2 text-left">Class</th>
                <th className="px-3 py-2 text-left">Teacher</th>
                <th className="px-3 py-2 text-left">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredStudents.map(s => (
                <tr key={s.id}>
                  {editStudentId === s.id ? (
                    <>
                      <td className="px-3 py-2">
                        <input
                          type="text"
                          className="w-full border rounded px-2 py-1 focus:outline-primary"
                          value={editStudentForm.name}
                          onChange={e => setEditStudentForm((f: { name: string; parent_id: string; parentSearch: string }) => ({ ...f, name: e.target.value }))}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="text"
                          className="w-full border rounded px-2 py-1 focus:outline-primary"
                          placeholder="Search or select a parent (optional)"
                          value={editStudentForm.parentSearch || ""}
                          onChange={e => setEditStudentForm((f: { name: string; parent_id: string; parentSearch: string }) => ({ ...f, parentSearch: e.target.value }))}
                          list={`edit-parent-list-${s.id}`}
                          onBlur={e => {
                            const match = parents.find(p => (p.name + ' (' + p.email + ')') === editStudentForm.parentSearch);
                            setEditStudentForm((f: { name: string; parent_id: string; parentSearch: string }) => ({ ...f, parent_id: match ? match.id : '' }));
                          }}
                        />
                        <datalist id={`edit-parent-list-${s.id}`}>
                          {parents.filter(p =>
                            !editStudentForm.parentSearch ||
                            p.name.toLowerCase().includes(editStudentForm.parentSearch.toLowerCase()) ||
                            p.email.toLowerCase().includes(editStudentForm.parentSearch.toLowerCase())
                          ).map(p => (
                            <option key={p.id} value={p.name + ' (' + p.email + ')'} data-id={p.id} />
                          ))}
                        </datalist>
                      </td>
                      <td className="px-3 py-2">
                        <span className="text-xs text-gray-400">-</span>
                      </td>
                      <td className="px-3 py-2">
                        <span className="text-xs text-gray-400">-</span>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex gap-2">
                          <button className="text-primary underline text-xs hover:no-underline" onClick={() => handleSaveEditStudent(s.id)}>Save</button>
                          <button className="text-gray-500 underline text-xs hover:no-underline" onClick={() => setEditStudentId(null)}>Cancel</button>
                          <button className="text-red-600 underline text-xs hover:no-underline" onClick={() => handleDeleteStudent(s.id)}>Delete</button>
                        </div>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-3 py-2 font-medium">{s.name}</td>
                      <td className="px-3 py-2">{parents.find(p => p.id === s.parent_id)?.name || (s.parent_id ? s.parent_id : '-')}</td>
                      <td className="px-3 py-2">
                        <select
                          className="w-full border rounded px-2 py-1 text-sm focus:outline-primary"
                          value={s.class_id || ""}
                          onChange={async (e) => {
                            setAssignError("");
                            setAssignLoading(s.id);
                            const newClassId = e.target.value || null;
                            const { error } = await supabase
                              .from("students")
                              .update({ class_id: newClassId })
                              .eq("id", s.id);
                            if (error) {
                              setAssignError("Failed to assign class: " + error.message);
                            } else {
                              // Refresh students
                              const { data } = await supabase
                                .from("students")
                                .select("*")
                                .order("name");
                              if (data) setStudents(data);
                            }
                            setAssignLoading(null);
                          }}
                          disabled={assignLoading === s.id}
                        >
                          <option value="">Unassigned</option>
                          {classes.map(c => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                        </select>
                        {assignLoading === s.id && (
                          <span className="text-xs text-primary ml-2">Saving...</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <select
                          className="w-full border rounded px-2 py-1 text-sm focus:outline-primary"
                          value={s.assigned_teacher_id || ""}
                          onChange={async (e) => {
                            setAssignError("");
                            setAssignLoading(s.id);
                            const newTeacherId = e.target.value || null;
                            const { error } = await supabase
                              .from("students")
                              .update({ assigned_teacher_id: newTeacherId })
                              .eq("id", s.id);
                            if (error) {
                              setAssignError("Failed to assign teacher: " + error.message);
                            } else {
                              // Refresh students
                              const { data } = await supabase
                                .from("students")
                                .select("*")
                                .order("name");
                              if (data) setStudents(data);
                            }
                            setAssignLoading(null);
                          }}
                          disabled={assignLoading === s.id}
                        >
                          <option value="">Unassigned</option>
                          {teachers.map(t => (
                            <option key={t.id} value={t.id}>{t.name}</option>
                          ))}
                        </select>
                        {assignLoading === s.id && (
                          <span className="text-xs text-primary ml-2">Saving...</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex gap-2">
                          <button className="text-primary underline text-xs hover:no-underline" onClick={() => handleEditStudent(s)}>Edit</button>
                          <button className="text-red-600 underline text-xs hover:no-underline" onClick={() => handleDeleteStudent(s.id)}>Delete</button>
                        </div>
                      </td>
                    </>
                  )}
                </tr>
              ))}
              {filteredStudents.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-center py-8 text-gray-500">
                    {students.length === 0 ? "No students found." : "No students match the current filters."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Summary Stats */}
      <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-4">
          <div className="text-2xl font-bold text-primary">{students.length}</div>
          <div className="text-sm text-gray-600">Total Students</div>
        </Card>
        <Card className="p-4">
          <div className="text-2xl font-bold text-green-600">
            {students.filter(s => s.class_id).length}
          </div>
          <div className="text-sm text-gray-600">Assigned to Classes</div>
        </Card>
        <Card className="p-4">
          <div className="text-2xl font-bold text-orange-600">
            {students.filter(s => s.assigned_teacher_id).length}
          </div>
          <div className="text-sm text-gray-600">Assigned to Teachers</div>
        </Card>
        {searchTerm || filterClass || filterTeacher || filterParent ? (
          <Card className="p-4">
            <div className="text-2xl font-bold text-blue-600">{filteredStudents.length}</div>
            <div className="text-sm text-gray-600">Filtered Results</div>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
