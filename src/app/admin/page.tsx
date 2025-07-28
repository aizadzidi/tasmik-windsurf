"use client";
import React, { useState, useEffect, useMemo } from "react";
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
  const [parents, setParents] = useState<Parent[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Form states
  const [newStudentName, setNewStudentName] = useState("");
  const [newStudentParentSearch, setNewStudentParentSearch] = useState("");
  const [newStudentParentId, setNewStudentParentId] = useState("");
  const [newStudentClassId, setNewStudentClassId] = useState("");
  
  // Filter states
  const [searchTerm, setSearchTerm] = useState("");
  const [filterClass, setFilterClass] = useState("");
  const [filterParent, setFilterParent] = useState("");
  
  // Edit states
  const [editStudentId, setEditStudentId] = useState<string | null>(null);
  const [editStudentForm, setEditStudentForm] = useState<{ name: string; parent_id: string; parentSearch: string }>({ name: '', parent_id: '', parentSearch: '' });
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState("");

  useEffect(() => {
    async function fetchData() {
      const { data: studentsData } = await supabase.from("students").select("*").order("name");
      if (studentsData) setStudents(studentsData);

      const { data: parentsData } = await supabase.from("users").select("id, name, email").eq("role", "parent");
      if (parentsData) setParents(parentsData);

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
      class_id: newStudentClassId || null
    }]).select().single();
    
    if (insertError) {
      setError("Failed to add student: " + insertError.message);
    } else if (newStudent) {
      setStudents([...students, newStudent].sort((a, b) => a.name.localeCompare(b.name)));
      setNewStudentName("");
      setNewStudentParentSearch("");
      setNewStudentParentId("");
      setNewStudentClassId("");
      setSuccess("Student added successfully!");
      setTimeout(() => setSuccess(""), 3000);
    }
    setLoading(false);
  };

  const handleEditStudent = (student: Student) => {
    setEditStudentId(student.id);
    const parent = parents.find(p => p.id === student.parent_id);
    setEditStudentForm({
      name: student.name,
      parent_id: student.parent_id || '',
      parentSearch: parent ? `${parent.name} (${parent.email})` : ''
    });
  };

  const handleSaveEditStudent = async (studentId: string) => {
    if (!editStudentForm.name.trim()) return;
    setEditLoading(true);
    setEditError("");
    const { data: updatedStudent, error: updateError } = await supabase.from("students").update({ 
      name: editStudentForm.name.trim(),
      parent_id: editStudentForm.parent_id || null
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
    (filterClass === "" || s.class_id === filterClass) &&
    (filterParent === "" || s.parent_id === filterParent)
  ), [students, searchTerm, filterClass, filterParent]);

  const groupedStudents = useMemo(() => filteredStudents.reduce((acc, student) => {
    const classInfo = classes.find(c => c.id === student.class_id);
    const className = classInfo ? classInfo.name : 'Unassigned';
    if (!acc[className]) acc[className] = [];
    acc[className].push(student);
    return acc;
  }, {} as Record<string, Student[]>), [filteredStudents, classes]);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col p-4 sm:p-6">
      <header className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Admin Dashboard</h1>
          <p className="text-gray-600">Manage students, classes, and parents.</p>
        </div>
        <SignOutButton />
      </header>

      <Card className="p-4"><h2 className="text-xl font-semibold text-gray-900 mb-4">Students Management</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
          <input type="text" placeholder="Search by name..." className="lg:col-span-1 w-full border-gray-300 rounded-md shadow-sm" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
          <select className="w-full border-gray-300 rounded-md shadow-sm" value={filterClass} onChange={e => setFilterClass(e.target.value)}>
            <option value="">All Classes</option>
            {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select className="w-full border-gray-300 rounded-md shadow-sm" value={filterParent} onChange={e => setFilterParent(e.target.value)}>
            <option value="">All Parents</option>
            {parents.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>

        <div className="overflow-x-auto border rounded-lg">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Student Name</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Parent</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {Object.keys(groupedStudents).sort().map(className => (
                <React.Fragment key={className}>
                  <tr className="bg-gray-100">
                    <td colSpan={3} className="px-4 py-2 text-sm font-bold text-gray-800">
                      {className} ({groupedStudents[className].length} students)
                    </td>
                  </tr>
                  {groupedStudents[className].map(s => (
                    <tr key={s.id}>
                      {editStudentId === s.id ? (
                        <td className="px-4 py-2" colSpan={3}>
                          <div className="space-y-2">
                            <input type="text" className="w-full border-gray-300 rounded-md shadow-sm" value={editStudentForm.name} onChange={e => setEditStudentForm({ ...editStudentForm, name: e.target.value })} />
                            <input type="text" className="w-full border-gray-300 rounded-md shadow-sm" placeholder="Search parent..." value={editStudentForm.parentSearch} onChange={e => setEditStudentForm({ ...editStudentForm, parentSearch: e.target.value })} list={`edit-parent-list-${s.id}`} onBlur={() => {
                              const match = parents.find(p => `${p.name} (${p.email})` === editStudentForm.parentSearch);
                              setEditStudentForm({ ...editStudentForm, parent_id: match ? match.id : '' });
                            }} />
                            <datalist id={`edit-parent-list-${s.id}`}>
                              {parents.map(p => <option key={p.id} value={`${p.name} (${p.email})`} />)}
                            </datalist>
                            {editError && <p className="text-red-500 text-xs">{editError}</p>}
                            <div className="flex gap-2 items-center">
                              <button onClick={() => handleSaveEditStudent(s.id)} disabled={editLoading} className="text-blue-600 hover:underline text-xs">{editLoading ? 'Saving...' : 'Save'}</button>
                              <button onClick={() => setEditStudentId(null)} className="text-gray-600 hover:underline text-xs">Cancel</button>
                            </div>
                          </div>
                        </td>
                      ) : (
                        <>
                          <td className="px-4 py-2 font-medium text-gray-900">{s.name}</td>
                          <td className="px-4 py-2 text-gray-600">{parents.find(p => p.id === s.parent_id)?.name || '-'}</td>
                          <td className="px-4 py-2">
                            <div className="flex gap-3">
                              <button onClick={() => handleEditStudent(s)} className="text-blue-600 hover:underline text-xs">Edit</button>
                              <button onClick={() => handleDeleteStudent(s.id)} className="text-red-600 hover:underline text-xs">Delete</button>
                            </div>
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                </React.Fragment>
              ))}
              {filteredStudents.length === 0 && (
                <tr>
                  <td colSpan={3} className="text-center py-6 text-gray-500">
                    No students match the current filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-4"><div className="text-2xl font-bold">{students.length}</div><div className="text-sm text-gray-600">Total Students</div></Card>
        <Card className="p-4"><div className="text-2xl font-bold text-green-600">{students.filter(s => s.class_id).length}</div><div className="text-sm text-gray-600">In a Class</div></Card>
        <Card className="p-4"><div className="text-2xl font-bold text-orange-600">{students.filter(s => s.assigned_teacher_id).length}</div><div className="text-sm text-gray-600">With a Teacher</div></Card>
        {filteredStudents.length !== students.length && <Card className="p-4"><div className="text-2xl font-bold text-blue-600">{filteredStudents.length}</div><div className="text-sm text-gray-600">Filtered Results</div></Card>}
      </div>
    </div>
  );
}
