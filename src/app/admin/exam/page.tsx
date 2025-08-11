"use client";
import React from "react";
import AdminNavbar from "@/components/admin/AdminNavbar";
import { Card } from "@/components/ui/Card";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar } from 'recharts';

// Mock data for initial state
const mockExamsData = [
  { id: "e1", name: "Midterm Exam", type: "Exam", subjects: ["Art", "B. Melayu"], classes: ["Bukhari", "Darimi"] },
  { id: "e2", name: "Final Exam", type: "Exam", subjects: ["Chemistry", "Biology"], classes: ["Bukhari"] },
  { id: "q1", name: "Quiz 1", type: "Quiz", subjects: ["English"], classes: ["Darimi"] },
];
const mockClasses = [
  "Bukhari", "Muslim", "Darimi", "Tirmidhi", "Abu Dawood", "Tabrani", "Bayhaqi", "Nasaie", "Ibn Majah"
];
const mockSubjects = [
  "Art", "B. Melayu", "Bahasa Arab SPM", "Biology", "Chemistry", "English", "Kitabah", "PAI", "PQS", "PSI", "Physic", "Qiraah", "Sejarah"
];

function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
}

const mockStudents = mockClasses.flatMap(cls => [
  { name: `${cls} Student 1`, class: cls },
  { name: `${cls} Student 2`, class: cls },
]);

const mockResults = mockStudents.flatMap(student =>
  mockSubjects.slice(0, 5).map(subject => {
    const seed = simpleHash(student.name + subject);
    const mark = 60 + (seed % 40);
    const grade = mark >= 85 ? "A" : mark >= 75 ? "A-" : mark >= 65 ? "B" : "C";
    return {
      student: student.name,
      class: student.class,
      subject,
      mark,
      grade,
      conduct: subject === "Art" ? undefined : { 
        leadership: 60 + ((seed + 1) % 40), 
        social: 60 + ((seed + 2) % 40), 
        akhlak: 60 + ((seed + 3) % 40) 
      } as Conduct
    };
  })
);

type Conduct = { [key: string]: number };
const conductAxes = ["leadership", "social", "akhlak"];

export default function AdminExamPage() {
  const [exams, setExams] = React.useState(mockExamsData);
  const [isCreateModalOpen, setCreateModalOpen] = React.useState(false);
  const [newExamName, setNewExamName] = React.useState("");
  const [newExamType, setNewExamType] = React.useState<"Exam"|"Quiz">("Exam");
  const [newExamClasses, setNewExamClasses] = React.useState<string[]>([]);
  const [newExamSubjects, setNewExamSubjects] = React.useState<string[]>([]);
  
  const [selectedExamId, setSelectedExamId] = React.useState<string>("e1");
  const [selectedClass, setSelectedClass] = React.useState<string>("");
  const [selectedSubject, setSelectedSubject] = React.useState<string>("");
  const [view, setView] = React.useState<"table"|"graph">("table");

  const selectedExam = exams.find(e => e.id === selectedExamId);
  const availableClasses = selectedExam ? selectedExam.classes : [];
  const availableSubjects = selectedExam ? selectedExam.subjects : [];
  
  const filteredResults = mockResults.filter(r =>
    (!selectedExamId || selectedExam?.subjects.includes(r.subject)) &&
    (!selectedExamId || selectedExam?.classes.includes(r.class)) &&
    (!selectedClass || r.class === selectedClass) &&
    (!selectedSubject || r.subject === selectedSubject)
  );

  const conductAverages = React.useMemo(() => {
    const results = filteredResults.filter(r => r.conduct);
    const data = conductAxes.map(axis => {
        const values = results.map(r => r.conduct![axis]);
        const average = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;
        return { subject: axis.charAt(0).toUpperCase() + axis.slice(1), A: average, fullMark: 100 };
    });
    return data;
  }, [filteredResults]);

  function handleCreateExam() {
    if (!newExamName.trim() || newExamClasses.length === 0 || newExamSubjects.length === 0) {
      alert("Please fill all fields");
      return;
    }
    const newExam = {
      id: `e${exams.length + 1}`,
      name: newExamName,
      type: newExamType,
      classes: newExamClasses,
      subjects: newExamSubjects,
    };
    setExams([...exams, newExam]);
    setCreateModalOpen(false);
    setNewExamName("");
    setNewExamType("Exam");
    setNewExamClasses([]);
    setNewExamSubjects([]);
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#f8fafc] via-[#e2e8f0] to-[#f1f5f9]">
      <AdminNavbar />
      <div className="relative p-4 sm:p-6">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold text-gray-800">Exam Monitoring</h1>
          <button onClick={() => setCreateModalOpen(true)} className="inline-flex items-center justify-center rounded-md text-sm font-medium h-10 px-4 py-2 bg-blue-600 text-white hover:bg-blue-700">
            Create Exam/Quiz
          </button>
        </div>

      {isCreateModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-40 flex justify-center items-center">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-2xl m-4">
            <h3 className="text-xl font-semibold mb-4">Create New Exam/Quiz</h3>
            <div className="space-y-4">
              <input type="text" placeholder="Exam/Quiz Name" value={newExamName} onChange={e => setNewExamName(e.target.value)} className="w-full border-gray-300 rounded-md" />
              <select value={newExamType} onChange={e => setNewExamType(e.target.value as "Exam"|"Quiz")} className="w-full border-gray-300 rounded-md">
                <option value="Exam">Exam</option>
                <option value="Quiz">Quiz</option>
              </select>
              <div>
                <h4 className="font-medium text-sm mb-2">Classes</h4>
                <div className="grid grid-cols-3 md:grid-cols-4 gap-2 max-h-32 overflow-y-auto p-2 border rounded-md">
                  {mockClasses.map(cls => (
                    <label key={cls} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={newExamClasses.includes(cls)} onChange={() => setNewExamClasses(prev => prev.includes(cls) ? prev.filter(c => c !== cls) : [...prev, cls])} />{cls}</label>
                  ))}
                </div>
              </div>
              <div>
                <h4 className="font-medium text-sm mb-2">Subjects</h4>
                <div className="grid grid-cols-3 md:grid-cols-4 gap-2 max-h-32 overflow-y-auto p-2 border rounded-md">
                  {mockSubjects.map(subj => (
                    <label key={subj} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={newExamSubjects.includes(subj)} onChange={() => setNewExamSubjects(prev => prev.includes(subj) ? prev.filter(s => s !== subj) : [...prev, subj])} />{subj}</label>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-4 mt-6">
              <button onClick={() => setCreateModalOpen(false)} className="text-gray-600">Cancel</button>
              <button onClick={handleCreateExam} className="bg-blue-600 text-white px-4 py-2 rounded-md">Create</button>
            </div>
          </div>
        </div>
      )}

      <Card className="p-4 mb-6">
        <div className="flex flex-col sm:flex-row items-center gap-4">
          <select value={selectedExamId} onChange={e => setSelectedExamId(e.target.value)} className="w-full sm:w-auto flex-grow border-gray-300 rounded-md">
            <option value="">Select Exam to Monitor</option>
            {exams.map(exam => <option key={exam.id} value={exam.id}>{exam.name} ({exam.type})</option>)}
          </select>
          {selectedExamId && (
            <>
              <select value={selectedClass} onChange={e => setSelectedClass(e.target.value)} className="w-full sm:w-auto border-gray-300 rounded-md">
                <option value="">All Classes</option>
                {availableClasses.map(cls => <option key={cls} value={cls}>{cls}</option>)}
              </select>
              <select value={selectedSubject} onChange={e => setSelectedSubject(e.target.value)} className="w-full sm:w-auto border-gray-300 rounded-md">
                <option value="">All Subjects</option>
                {availableSubjects.map(subj => <option key={subj} value={subj}>{subj}</option>)}
              </select>
            </>
          )}
        </div>
      </Card>

      <div className="flex gap-2 items-center mb-4">
        <button className={`px-3 py-1 text-sm rounded-md ${view === 'table' ? 'bg-blue-600 text-white' : 'bg-white'}`} onClick={() => setView('table')}>Table</button>
        <button className={`px-3 py-1 text-sm rounded-md ${view === 'graph' ? 'bg-blue-600 text-white' : 'bg-white'}`} onClick={() => setView('graph')}>Graph</button>
      </div>

      {view === 'table' && (
        <Card className="p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead className="bg-gray-100">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-600 uppercase">Student</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-600 uppercase">Subject</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-600 uppercase">Mark</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-600 uppercase">Grade</th>
                  {selectedExam?.type === "Exam" && <th className="px-4 py-2 text-left text-xs font-medium text-gray-600 uppercase">Conduct</th>}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {Object.entries(filteredResults.reduce((acc, r) => { (acc[r.class] = acc[r.class] || []).push(r); return acc; }, {} as Record<string, typeof filteredResults>)).map(([className, results]) => (
                  <React.Fragment key={className}>
                    <tr className="bg-gray-200"><td colSpan={selectedExam?.type === "Exam" ? 5 : 4} className="px-4 py-2 font-bold text-gray-800">{className}</td></tr>
                    {results.map((r, i) => (
                      <tr key={i}>
                        <td className="px-4 py-2 whitespace-nowrap">{r.student}</td>
                        <td className="px-4 py-2 whitespace-nowrap">{r.subject}</td>
                        <td className="px-4 py-2 whitespace-nowrap">{r.mark}</td>
                        <td className="px-4 py-2 whitespace-nowrap">{r.grade}</td>
                        {selectedExam?.type === "Exam" && <td className="px-4 py-2 whitespace-nowrap text-xs">{conductAxes.map(ax => `${ax.charAt(0).toUpperCase()}: ${r.conduct?.[ax] ?? '-'}`).join(", ")}</td>}
                      </tr>
                    ))}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {view === 'graph' && (
        <Card className="p-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div>
              <h4 className="font-semibold mb-4">Marks Overview</h4>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={filteredResults} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="student" tick={{fontSize: 10}} />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="mark" stroke="#8884d8" />
                </LineChart>
              </ResponsiveContainer>
            </div>
            {selectedExam?.type === "Exam" && (
              <div>
                <h4 className="font-semibold mb-4">Conduct Analysis</h4>
                <ResponsiveContainer width="100%" height={300}>
                    <RadarChart cx="50%" cy="50%" outerRadius="80%" data={conductAverages}>
                        <PolarGrid />
                        <PolarAngleAxis dataKey="subject" />
                        <PolarRadiusAxis angle={30} domain={[0, 100]}/>
                        <Radar name="Average" dataKey="A" stroke="#8884d8" fill="#8884d8" fillOpacity={0.6} />
                        <Legend />
                    </RadarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </Card>
      )}
      </div>
    </div>
  );
}
