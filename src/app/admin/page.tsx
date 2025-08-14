"use client";
import React, { useState, useEffect, useMemo } from "react";
import { createClient } from "@supabase/supabase-js";
import AdminNavbar from "@/components/admin/AdminNavbar";
import { Card } from "@/components/ui/Card";
import ClassDistributionChart from "@/components/admin/ClassDistributionChart";
import TeacherAssignmentChart from "@/components/admin/TeacherAssignmentChart";

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
  
  // Filter states
  const [searchTerm, setSearchTerm] = useState("");
  const [filterClass, setFilterClass] = useState("");
  const [filterTeacher, setFilterTeacher] = useState("");
  
  // Edit states
  const [editStudentId, setEditStudentId] = useState<string | null>(null);
  const [editStudentForm, setEditStudentForm] = useState<{ name: string; parent_id: string; assigned_teacher_id: string; class_id: string }>({ name: '', parent_id: '', assigned_teacher_id: '', class_id: '' });
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState("");

  useEffect(() => {
    async function fetchData() {
      const { data: studentsData } = await supabase.from("students").select("*").order("name");
      if (studentsData) setStudents(studentsData);

      const { data: parentsData } = await supabase.from("users").select("id, name, email").eq("role", "parent");
      if (parentsData) setParents(parentsData);

      const { data: teachersData } = await supabase.from("users").select("id, name, email").eq("role", "teacher");
      if (teachersData) setTeachers(teachersData);

      const { data: classesData } = await supabase.from("classes").select("id, name").order("name");
      if (classesData) setClasses(classesData);
    }
    fetchData();
  }, []);

  const handleAddStudent = async () => {
    if (!newStudentName.trim()) return;
    setLoading(true);
    setError("");
    const { data: newStudent, error: insertError } = await supabase.from("students").insert([{ 
      name: newStudentName.trim(),
      parent_id: newStudentParentId || null,
      assigned_teacher_id: newStudentTeacherId || null,
      class_id: newStudentClassId || null
    }]).select().single();
    
    if (insertError) {
      setError("Failed to add student: " + insertError.message);
    } else if (newStudent) {
      setStudents([...students, newStudent].sort((a, b) => a.name.localeCompare(b.name)));
      setNewStudentName("");
      setNewStudentParentId("");
      setNewStudentTeacherId("");
      setNewStudentClassId("");
      setShowAddForm(false);
      setSuccess("Student added successfully!");
      setTimeout(() => setSuccess(""), 3000);
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
    const { data: updatedStudent, error: updateError } = await supabase.from("students").update({ 
      name: editStudentForm.name.trim(),
      parent_id: editStudentForm.parent_id || null,
      assigned_teacher_id: editStudentForm.assigned_teacher_id || null,
      class_id: editStudentForm.class_id || null
    }).eq("id", studentId).select().single();
    
    if (updateError) {
      setEditError("Failed to update student: " + updateError.message);
    } else if (updatedStudent) {
      setStudents(students.map(s => s.id === studentId ? updatedStudent : s));
      setEditStudentId(null);
    }
    setEditLoading(false);
  };

  const handleDeleteStudent = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this student?')) return;
    const { error } = await supabase.from("students").delete().eq("id", id);
    if (error) {
      setError("Failed to delete student: " + error.message);
    } else {
      setStudents(students.filter(s => s.id !== id));
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
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
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
          {filteredStudents.length !== students.length && (
            <Card className="p-4">
              <div className="text-2xl font-bold text-blue-600">{filteredStudents.length}</div>
              <div className="text-sm text-gray-600">Filtered Results</div>
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
                <select
                  className="w-full border-gray-300 rounded-md shadow-sm p-2 border"
                  value={newStudentParentId}
                  onChange={e => setNewStudentParentId(e.target.value)}
                >
                  <option value="">Select parent (optional)</option>
                  {parents.map(p => (
                    <option key={p.id} value={p.id}>{p.name} ({p.email})</option>
                  ))}
                </select>
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
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredStudents.map(s => (
                <tr key={s.id}>
                  {editStudentId === s.id ? (
                    <td className="px-4 py-3" colSpan={5}>
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
                          <select
                            className="w-full border-gray-300 rounded-md shadow-sm p-2 border text-sm"
                            value={editStudentForm.parent_id}
                            onChange={e => setEditStudentForm({ ...editStudentForm, parent_id: e.target.value })}
                          >
                            <option value="">No parent assigned</option>
                            {parents.map(p => (
                              <option key={p.id} value={p.id}>{p.name} ({p.email})</option>
                            ))}
                          </select>
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
                  <td colSpan={5} className="text-center py-8 text-gray-500">
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
