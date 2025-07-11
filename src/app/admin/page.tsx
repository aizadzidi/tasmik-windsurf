"use client";
import { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";
import SignOutButton from "@/components/SignOutButton";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

interface Student {
  id: string;
  name: string;
  parent_id: string;
  assigned_teacher_id: string | null;
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

export default function AdminPage() {
  const [editStudentId, setEditStudentId] = useState<string | null>(null);
  const [editStudentForm, setEditStudentForm] = useState<{ name: string; parent_id: string; parentSearch: string }>({ name: '', parent_id: '', parentSearch: '' });
  const [form, setForm] = useState({ name: "", parent_id: "", parentSearch: "" });
  const [students, setStudents] = useState<Student[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [parents, setParents] = useState<Parent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [assignLoading, setAssignLoading] = useState<string | null>(null);
  const [assignError, setAssignError] = useState<string>("");

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
    fetchStudents();
    fetchTeachers();
    fetchParents();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccess("");
    if (!form.name) {
      setError("Please fill in the student name.");
      setLoading(false);
      return;
    }
    const { error } = await supabase
      .from("students")
      .insert([{ name: form.name, parent_id: form.parent_id || null }]);
    if (error) {
      setError("Failed to add student: " + error.message);
    } else {
      setSuccess("Student added!");
      setForm({ name: "", parent_id: "", parentSearch: "" });
      const { data } = await supabase
        .from("students")
        .select("*")
        .order("name");
      if (data) setStudents(data);
    }
    setLoading(false);
  }

  async function handleEditStudent(student: Student) {
    setEditStudentId(student.id);
    setEditStudentForm({
      name: student.name,
      parent_id: student.parent_id || '',
      parentSearch: parents.find(p => p.id === student.parent_id)?.name + (parents.find(p => p.id === student.parent_id) ? ' (' + parents.find(p => p.id === student.parent_id)?.email + ')' : '') || ''
    });
  }

  async function handleSaveEditStudent(id: string) {
    setLoading(true);
    const { error } = await supabase
      .from("students")
      .update({ name: editStudentForm.name, parent_id: editStudentForm.parent_id || null })
      .eq("id", id);
    if (error) {
      setError("Failed to update student: " + error.message);
    } else {
      setEditStudentId(null);
      setEditStudentForm({ name: '', parent_id: '', parentSearch: '' });
      const { data } = await supabase
        .from("students")
        .select("*")
        .order("name");
      if (data) setStudents(data);
    }
    setLoading(false);
  }

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
    <main className="min-h-screen bg-gradient-to-tr from-blue-100 via-blue-200 to-blue-100 py-8 px-2">
      <div className="max-w-3xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold text-gray-800">Admin Dashboard</h1>
          <SignOutButton />
        </div>
        <p className="mb-6">Welcome, Admin!</p>

      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-2">Add Student</h2>
        <form onSubmit={handleSubmit} className="space-y-3 border p-4 rounded">
          <div>
            <label className="block mb-1">Name</label>
            <input
              type="text"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              className="w-full border rounded px-3 py-2"
              required
            />
          </div>
          <div>
            <label className="block mb-1">Parent</label>
            <input
  type="text"
  className="w-full border rounded px-3 py-2"
  placeholder="Search or select a parent (optional)"
  value={form.parentSearch || ""}
  onChange={e => {
    setForm(f => ({ ...f, parentSearch: e.target.value }));
  }}
  onBlur={e => {
    const match = parents.find(p => (p.name + ' (' + p.email + ')') === form.parentSearch);
    setForm(f => ({ ...f, parent_id: match ? match.id : '' }));
  }}
  list="parent-list"
/>
<datalist id="parent-list">
  {parents.filter(p =>
    !form.parentSearch ||
    p.name.toLowerCase().includes(form.parentSearch.toLowerCase()) ||
    p.email.toLowerCase().includes(form.parentSearch.toLowerCase())
  ).map(p => (
    <option key={p.id} value={p.name + ' (' + p.email + ')'} data-id={p.id} />
  ))}
</datalist>
<button type="button" className="text-xs ml-2 underline" onClick={() => setForm(f => ({ ...f, parent_id: "", parentSearch: "" }))}>Clear</button>
{/* Hidden input for parent_id, set on blur or selection */}
<input type="hidden" value={form.parent_id || ""} />
{/* TODO: For production, consider using a UI library (e.g. react-select) for better searchable dropdown UX */}
          </div>
          {error && <div className="text-red-500 text-sm">{error}</div>}
          {success && <div className="text-green-600 text-sm">{success}</div>}
          <button
            type="submit"
            disabled={loading}
            className="bg-blue-600 text-white py-2 px-4 rounded hover:bg-blue-700"
          >
            {loading ? "Adding..." : "Add Student"}
          </button>
        </form>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-2">All Students</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full border mt-6">
            <thead>
              <tr>
                <th className="border px-2 py-1">Name</th>
                <th className="border px-2 py-1">Parent</th>
                <th className="border px-2 py-1">Teacher</th>
<th className="border px-2 py-1">Actions</th>
              </tr>
            </thead>
            <tbody>
              {students.map(s => (
  <tr key={s.id}>
    {editStudentId === s.id ? (
  <>
    <td className="border px-2 py-1">
      <input
        type="text"
        className="w-full border rounded px-2 py-1"
        value={editStudentForm.name}
        onChange={e => setEditStudentForm((f: { name: string; parent_id: string; parentSearch: string }) => ({ ...f, name: e.target.value }))}
      />
    </td>
    <td className="border px-2 py-1">
      <input
        type="text"
        className="w-full border rounded px-2 py-1"
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
    <td className="border px-2 py-1">
      <span className="text-xs text-gray-400">-</span>
    </td>
    <td className="border px-2 py-1 flex gap-2">
      <button className="text-blue-600 underline text-xs" onClick={() => handleSaveEditStudent(s.id)}>Save</button>
      <button className="text-gray-500 underline text-xs" onClick={() => setEditStudentId(null)}>Cancel</button>
      <button className="text-red-600 underline text-xs" onClick={() => handleDeleteStudent(s.id)}>Delete</button>
    </td>
  </>
) : (
  <>
    <td className="border px-2 py-1">{s.name}</td>
    <td className="border px-2 py-1">{parents.find(p => p.id === s.parent_id)?.name || (s.parent_id ? s.parent_id : '-')}</td>
    <td className="border px-2 py-1">
      <select
        className="w-full border rounded px-2 py-1"
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
        <span className="text-xs text-blue-600 ml-2">Saving...</span>
      )}
    </td>
    <td className="border px-2 py-1 flex gap-2">
      <button className="text-blue-600 underline text-xs" onClick={() => handleEditStudent(s)}>Edit</button>
      <button className="text-red-600 underline text-xs" onClick={() => handleDeleteStudent(s.id)}>Delete</button>
    </td>
  </>
)}
  </tr>
))}
              {students.length === 0 && (
                <tr>
                  <td colSpan={3} className="text-center py-2">No students found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
      </div>
    </main>
  );
}
