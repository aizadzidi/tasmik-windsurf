"use client";
import React from "react";
import { Card } from "@/components/ui/Card";

// Mock data for exams, classes, subjects, students, and results
const mockExams = [
  { id: "e1", name: "Midterm Exam", type: "Exam", subjects: ["Art", "B. Melayu"], classes: ["Bukhari", "Darimi"] },
  { id: "e2", name: "Final Exam", type: "Exam", subjects: ["Chemistry", "Biology"], classes: ["Bukhari"] },
  { id: "q1", name: "Quiz 1", type: "Quiz", subjects: ["English"], classes: ["Darimi"] },
];
const mockClasses = [
  "Bukhari",
  "Muslim",
  "Darimi",
  "Tirmidhi",
  "Abu Dawood",
  "Tabrani",
  "Bayhaqi",
  "Nasaie",
  "Ibn Majah"
];
const mockSubjects = [
  "Art",
  "B. Melayu",
  "Bahasa Arab SPM",
  "Biology",
  "Chemistry",
  "English",
  "Kitabah",
  "PAI",
  "PQS",
  "PSI",
  "Physic",
  "Qiraah",
  "Sejarah"
];
// Simple hash function for deterministic "random" values
function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash);
}

// Generate students: 2 per class
const mockStudents = mockClasses.flatMap(cls => [
  { name: `${cls} Student 1`, class: cls },
  { name: `${cls} Student 2`, class: cls },
]);

// Generate results: each student has 2 subjects, deterministic marks, conduct for exams
const mockResults = mockStudents.flatMap(student =>
  mockSubjects.slice(0,2).map(subject => {
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
  // State for exam/quiz selection/creation
  const [selectedExamId, setSelectedExamId] = React.useState<string>("");
  const [creatingExam, setCreatingExam] = React.useState(false);
  const [newExamName, setNewExamName] = React.useState("");
  const [newExamType, setNewExamType] = React.useState<"Exam"|"Quiz">("Exam");
  const [newExamClasses, setNewExamClasses] = React.useState<string[]>([]);
  const [newExamSubjects, setNewExamSubjects] = React.useState<string[]>([]);
  const [selectedClass, setSelectedClass] = React.useState<string>("");
  const [selectedSubject, setSelectedSubject] = React.useState<string>("");
  const [view, setView] = React.useState<"table"|"graph">("table");

  // Derived data
  const selectedExam = mockExams.find(e => e.id === selectedExamId);
  const availableClasses = selectedExam ? selectedExam.classes : mockClasses;
  const availableSubjects = selectedExam ? selectedExam.subjects : mockSubjects;
  const filteredResults = mockResults.filter(r =>
    (!selectedExam || selectedExam.subjects.includes(r.subject)) &&
    (!selectedClass || r.class === selectedClass) &&
    (!selectedSubject || r.subject === selectedSubject)
  );

  // Conduct averages for radar
  const conductAverages = React.useMemo(() => {
    const results = filteredResults;
    const avg: Record<string, number> = {};
    conductAxes.forEach(ax => {
      const vals = results.map(r => (r.conduct as Conduct)?.[ax] ?? 0);
      avg[ax] = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
    });
    return avg;
  }, [filteredResults]);

  // Handlers
  function handleCreateExam() {
    if (!newExamName.trim()) {
      alert("Please enter exam/quiz name");
      return;
    }
    if (newExamClasses.length === 0) {
      alert("Please select at least one class");
      return;
    }
    if (newExamSubjects.length === 0) {
      alert("Please select at least one subject");
      return;
    }
    // (Mock only) Add to mockExams array
    alert(`${newExamType} '${newExamName}' created for:\nClasses: ${newExamClasses.join(", ")}\nSubjects: ${newExamSubjects.join(", ")}`);
    setCreatingExam(false);
    setNewExamName("");
    setNewExamType("Exam");
    setNewExamClasses([]);
    setNewExamSubjects([]);
  }

  return (
    <div className="min-h-screen bg-muted flex flex-col p-6">
      <Card className="p-6 mb-6">
        {/* Exam/Quiz select/create */}
        <div className="flex flex-col md:flex-row md:items-end gap-4 md:gap-8">
          <div className="flex flex-col min-w-[200px]">
            <label className="text-xs font-medium mb-1">Select Exam/Quiz</label>
            <select
              value={selectedExamId}
              onChange={e => { setSelectedExamId(e.target.value); setSelectedClass(""); setSelectedSubject(""); }}
              className="border rounded px-3 py-2 text-sm focus:outline-primary"
            >
              <option value="">-- Select --</option>
              {mockExams.map(e => (
                <option key={e.id} value={e.id}>{e.name} ({e.type})</option>
              ))}
            </select>
            <button className="mt-2 text-xs text-primary underline w-fit" onClick={() => setCreatingExam(true)}>
              + Create New Exam/Quiz
            </button>
          </div>
          {creatingExam && (
            <div className="flex flex-col gap-2 bg-muted border rounded p-4">
              <label className="text-xs font-medium">Exam/Quiz Name</label>
              <input className="border rounded px-2 py-1" value={newExamName} onChange={e => setNewExamName(e.target.value)} />
              <label className="text-xs font-medium mt-2">Type</label>
              <select className="border rounded px-2 py-1" value={newExamType} onChange={e => setNewExamType(e.target.value as "Exam"|"Quiz")}> <option value="Exam">Exam</option> <option value="Quiz">Quiz</option> </select>
              <label className="text-xs font-medium mt-2">For Classes</label>
              <div className="border rounded px-2 py-2 max-h-32 overflow-y-auto bg-white">
                <label className="flex items-center gap-2 text-xs mb-1">
                  <input
                    type="checkbox"
                    checked={newExamClasses.length === mockClasses.length}
                    onChange={e => setNewExamClasses(e.target.checked ? [...mockClasses] : [])}
                  />
                  <span className="font-medium">All Classes</span>
                </label>
                <hr className="my-1" />
                {mockClasses.map(cls => (
                  <label key={cls} className="flex items-center gap-2 text-xs mb-1">
                    <input
                      type="checkbox"
                      checked={newExamClasses.includes(cls)}
                      onChange={e => {
                        if (e.target.checked) {
                          setNewExamClasses([...newExamClasses, cls]);
                        } else {
                          setNewExamClasses(newExamClasses.filter(c => c !== cls));
                        }
                      }}
                    />
                    {cls}
                  </label>
                ))}
              </div>
              <label className="text-xs font-medium mt-2">For Subjects</label>
              <div className="border rounded px-2 py-2 max-h-32 overflow-y-auto bg-white">
                <label className="flex items-center gap-2 text-xs mb-1">
                  <input
                    type="checkbox"
                    checked={newExamSubjects.length === mockSubjects.length}
                    onChange={e => setNewExamSubjects(e.target.checked ? [...mockSubjects] : [])}
                  />
                  <span className="font-medium">All Subjects</span>
                </label>
                <hr className="my-1" />
                {mockSubjects.map(subj => (
                  <label key={subj} className="flex items-center gap-2 text-xs mb-1">
                    <input
                      type="checkbox"
                      checked={newExamSubjects.includes(subj)}
                      onChange={e => {
                        if (e.target.checked) {
                          setNewExamSubjects([...newExamSubjects, subj]);
                        } else {
                          setNewExamSubjects(newExamSubjects.filter(s => s !== subj));
                        }
                      }}
                    />
                    {subj}
                  </label>
                ))}
              </div>
              <div className="flex gap-2 mt-2">
                <button className="px-3 py-1 rounded bg-primary text-white text-xs" onClick={handleCreateExam}>Create</button>
                <button className="px-3 py-1 rounded border text-xs" onClick={() => setCreatingExam(false)}>Cancel</button>
              </div>
            </div>
          )}
          {selectedExam && (
            <div className="flex flex-col min-w-[160px]">
              <label className="text-xs font-medium mb-1">Class</label>
              <select
                value={selectedClass}
                onChange={e => setSelectedClass(e.target.value)}
                className="border rounded px-3 py-2 text-sm focus:outline-primary"
              >
                <option value="">All Classes</option>
                {availableClasses.map(cls => (
                  <option key={cls} value={cls}>{cls}</option>
                ))}
              </select>
            </div>
          )}
          {selectedExam && (
            <div className="flex flex-col min-w-[160px]">
              <label className="text-xs font-medium mb-1">Subject</label>
              <select
                value={selectedSubject}
                onChange={e => setSelectedSubject(e.target.value)}
                className="border rounded px-3 py-2 text-sm focus:outline-primary"
              >
                <option value="">All Subjects</option>
                {availableSubjects.map(subj => (
                  <option key={subj} value={subj}>{subj}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      </Card>

      {/* Table/Graph toggle */}
      <div className="flex gap-4 items-center mb-4">
        <button className={`px-4 py-1 rounded-full text-xs font-semibold border ${view === 'table' ? 'bg-primary text-white' : 'bg-white text-gray-600'}`} onClick={() => setView('table')}>Table</button>
        <button className={`px-4 py-1 rounded-full text-xs font-semibold border ${view === 'graph' ? 'bg-primary text-white' : 'bg-white text-gray-600'}`} onClick={() => setView('graph')}>Graph</button>
      </div>

      {/* Table view */}
      {view === 'table' && (
        <Card className="p-4 mb-6">
          <div className="overflow-x-auto">
            <table className="min-w-full border bg-white rounded-md">
              <thead>
                <tr className="bg-muted">
                  <th className="px-3 py-2 text-left">Class</th>
                  <th className="px-3 py-2 text-left">Student</th>
                  <th className="px-3 py-2 text-left">Subject</th>
                  <th className="px-3 py-2 text-left">Mark</th>
                  <th className="px-3 py-2 text-left">Grade</th>
                  {selectedExam?.type === "Exam" && <th className="px-3 py-2 text-left">Conduct</th>}
                </tr>
              </thead>
              <tbody>
                {/* Group by class */}
                {(() => {
                  let lastClass = "";
                  return filteredResults.map((r, i) => {
                    const classHeader = r.class !== lastClass ? (
                      <tr key={r.class + "-header"} className="bg-gray-100">
                        <td colSpan={selectedExam?.type === "Exam" ? 6 : 5} className="font-semibold px-3 py-2 sticky left-0 bg-gray-100 z-10">{r.class}</td>
                      </tr>
                    ) : null;
                    lastClass = r.class;
                    return [
                      classHeader,
                      <tr key={i} className="border-b">
                        <td className="px-3 py-2">{r.class}</td>
                        <td className="px-3 py-2">{r.student}</td>
                        <td className="px-3 py-2">{r.subject}</td>
                        <td className="px-3 py-2">{r.mark}</td>
                        <td className="px-3 py-2">{r.grade}</td>
                        {selectedExam?.type === "Exam" && (
                          <td className="px-3 py-2">
                            {conductAxes.map(ax => `${ax}: ${r.conduct?.[ax] ?? '-'}%`).join(", ")}
                          </td>
                        )}
                      </tr>
                    ];
                  });
                })()}
              </tbody>
            </table>
          </div>
        </Card>
      )}


      {/* Graph view */}
      {view === 'graph' && (
        <Card className="p-4 mb-6 flex flex-col md:flex-row gap-6">
          <div className="flex-1">
            <h4 className="font-semibold mb-2">Marks Overview</h4>
            {/* Placeholder for line chart */}
            <div className="h-48 bg-muted flex items-center justify-center text-gray-400">[Line Chart Here]</div>
          </div>
          {selectedExam?.type === "Exam" && (
            <div className="flex-1 min-w-[200px]">
              <h4 className="font-semibold mb-2">Conduct Graph</h4>
              {/* Placeholder for radar chart */}
              <div className="h-48 bg-muted flex items-center justify-center text-gray-400">[Radar Chart Here]</div>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
