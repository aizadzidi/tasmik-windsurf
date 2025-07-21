"use client";
import React from "react";
import { Card, CardContent } from "@/components/ui/Card";

import { RadioGroup } from "@/components/ui/RadioGroup";
import { Select } from "@/components/ui/Select";
import { Switch } from "@/components/ui/Switch";
import { Button } from "@/components/ui/Button";
import { ChevronDown, ChevronUp } from "lucide-react";
import dynamic from "next/dynamic";

// Helper components for shadcn/ui minimal scaffolds
const RadioGroupItem = (props: { value: string; children: React.ReactNode; className?: string }) => (
  <label className={props.className}>
    <input
      type="radio"
      value={props.value}
      style={{ marginRight: 4 }}
      name="radio-group"
      onChange={() => {}}
    />
    {props.children}
  </label>
);
const SelectTrigger = (props: React.PropsWithChildren<{ className?: string }>) => (
  <div className={props.className}>{props.children}</div>
);
const SelectValue = (props: { placeholder?: string }) => <span>{props.placeholder}</span>;
const SelectContent = (props: React.PropsWithChildren<{}>) => <div>{props.children}</div>;
const SelectItem = (props: { value: string; children: React.ReactNode }) => (
  <div style={{ padding: '4px 8px', cursor: 'pointer' }}>{props.children}</div>
);

// Dynamically import charts to avoid SSR issues
const LineChart = dynamic(() => import("@/components/teacher/ExamLineChart"), { ssr: false });
const RadarChart = dynamic(() => import("@/components/teacher/ExamRadarChart"), { ssr: false });

// Mocked admin assignments for teacher
const teacherAssignments = [
  {
    className: "Bukhari",
    subjects: ["Math", "Science"],
    students: [
      { name: "Ahmad Zaki" },
      { name: "Fatimah Noor" },
      { name: "Siti Aminah" },
    ],
  },
  {
    className: "Darimi",
    subjects: ["English", "History"],
    students: [
      { name: "Ali Hassan" },
      { name: "Nur Iman" },
    ],
  },
];

// Mocked exam/quiz lists
const mockExams: Record<string, Record<string, string[]>> = {
  Bukhari: {
    Math: ["Midterm Exam", "Final Exam"],
    Science: ["Midterm Exam"],
  },
  Darimi: {
    English: ["Final Exam"],
    History: ["Midterm Exam"],
  },
};
const mockQuizzes: Record<string, Record<string, string[]>> = {
  Bukhari: {
    Math: ["Quiz 1", "Quiz 2"],
    Science: ["Quiz 1"],
  },
  Darimi: {
    English: ["Quiz 1"],
    History: ["Quiz 1"],
  },
};

const conductCategories = [
  "Discipline",
  "Effort",
  "Participation",
  "Motivational Level",
  "Character",
  "Leadership",
];

function getInitialStudentRows(className: string, subject: string) {
  const classInfo = teacherAssignments.find((c) => c.className === className);
  if (!classInfo) return [];
  return classInfo.students.map((stu) => ({
    name: stu.name,
    mark: "",
    grade: "",
    conduct: Object.fromEntries(conductCategories.map((cat) => [cat, ""])),
  }));
}

function calculateGrade(mark: number|string): string {
  if (mark === "TH" || mark === "th" || mark === "Absent" || mark === "absent") return "TH";
  const m = typeof mark === "string" ? parseFloat(mark) : mark;
  if (isNaN(m)) return "";
  if (m >= 90) return "A+";
  if (m >= 80) return "A";
  if (m >= 70) return "A-";
  if (m >= 65) return "B+";
  if (m >= 60) return "B";
  if (m >= 55) return "C+";
  if (m >= 50) return "C";
  if (m >= 45) return "D";
  if (m >= 40) return "E";
  if (m < 40) return "G";
  return "";
}

export default function TeacherExamDashboard() {
  // Section 1: Picker States
  const classOptions = teacherAssignments.map((c) => c.className);
  const [selectedClass, setSelectedClass] = React.useState(classOptions[0]);
  const subjectOptions = React.useMemo(() => {
    return teacherAssignments.find((c) => c.className === selectedClass)?.subjects || [];
  }, [selectedClass]);
  const [selectedSubject, setSelectedSubject] = React.useState("");
  const [assessmentType, setAssessmentType] = React.useState<"Exam" | "Quiz">("Exam");
  const assessmentList = React.useMemo(() => {
    if (!selectedSubject) return [];
    if (assessmentType === "Exam") {
      return mockExams[selectedClass]?.[selectedSubject] || [];
    } else {
      return mockQuizzes[selectedClass]?.[selectedSubject] || [];
    }
  }, [assessmentType, selectedClass, selectedSubject]);
  const [selectedAssessment, setSelectedAssessment] = React.useState("");
  // Section 2: Student Table State
  const [studentRows, setStudentRows] = React.useState(() => getInitialStudentRows(classOptions[0], subjectOptions[0] || ""));
  const [expandedRows, setExpandedRows] = React.useState<number[]>([]);

  // When class changes, reset subject and assessment to first valid
  React.useEffect(() => {
    const firstSubject = subjectOptions[0] || "";
    setSelectedSubject(firstSubject);
  }, [selectedClass, subjectOptions]);

  // When subject or assessment type changes, reset assessment
  React.useEffect(() => {
    setSelectedAssessment(assessmentList[0] || "");
  }, [assessmentList]);

  // When class or subject changes, update students
  React.useEffect(() => {
    setStudentRows(getInitialStudentRows(selectedClass, selectedSubject));
  }, [selectedClass, selectedSubject]);

  // Editable cell handlers
  const handleMarkChange = (idx: number, value: string) => {
    setStudentRows((prev) => {
      const updated = [...prev];
      updated[idx] = {
        ...updated[idx],
        mark: value,
        grade: calculateGrade(value),
      };
      return updated;
    });
  };
  const handleConductChange = (idx: number, cat: string, value: string) => {
    setStudentRows((prev) => {
      const updated = [...prev];
      updated[idx] = {
        ...updated[idx],
        conduct: { ...updated[idx].conduct, [cat]: value },
      };
      return updated;
    });
  };
  const handleExpand = (idx: number) => {
    setExpandedRows((prev) =>
      prev.includes(idx) ? prev.filter((i) => i !== idx) : [...prev, idx]
    );
  };

  // Section 3: Graph Data
  const marksData = studentRows.map((s) => ({ name: s.name, mark: parseFloat(s.mark) || 0 }));
  const avgConduct: Record<string, number> = {};
  conductCategories.forEach((cat) => {
    const vals = studentRows.map((s) => parseFloat(s.conduct[cat]) || 0);
    avgConduct[cat] = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
  });

  return (
    <div className="min-h-screen bg-muted flex flex-col">
      {/* Navbar */}
      <nav className="bg-white shadow flex items-center px-4 py-2 gap-4">
        <span className="font-bold text-lg">Teacher Dashboard</span>
        <div className="ml-4 flex gap-2">
          <a 
            href="/teacher" 
            className="px-3 py-1 rounded-md text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100"
          >
            Hafazan
          </a>
          <a 
            href="/teacher/exam" 
            className="px-3 py-1 rounded-md text-sm font-medium bg-blue-100 text-blue-700"
          >
            Exam
          </a>
        </div>
      </nav>
      {/* Main Content */}
      <main className="flex-1 p-4 flex flex-col gap-6 max-w-5xl mx-auto w-full">
        {/* Section 1: Pickers */}
        <Card>
          <CardContent className="py-6 flex flex-col gap-4">
            {/* Redesigned Picker Section */}
            <div className="bg-white rounded-lg shadow-sm px-6 py-4 flex flex-col md:flex-row md:items-end gap-4 md:gap-6 border mb-4">
              {/* Class Picker */}
              <div className="flex flex-col min-w-[120px]">
                <label className="text-xs font-medium mb-1" htmlFor="class-picker">Class</label>
                <select
                  id="class-picker"
                  value={selectedClass}
                  onChange={e => setSelectedClass(e.target.value)}
                  className="border rounded px-3 py-2 text-sm focus:outline-primary"
                >
                  {classOptions.map(cls => (
                    <option key={cls} value={cls}>{cls}</option>
                  ))}
                </select>
              </div>
              {/* Subject Picker */}
              <div className="flex flex-col min-w-[140px]">
                <label className="text-xs font-medium mb-1" htmlFor="subject-picker">Subject</label>
                <select
                  id="subject-picker"
                  value={selectedSubject}
                  onChange={e => setSelectedSubject(e.target.value)}
                  className="border rounded px-3 py-2 text-sm focus:outline-primary"
                  disabled={!selectedClass}
                >
                  {subjectOptions.map(subj => (
                    <option key={subj} value={subj}>{subj}</option>
                  ))}
                </select>
              </div>
              {/* Assessment Type Toggle */}
              <div className="flex flex-col min-w-[120px]">
                <label className="text-xs font-medium mb-1">Assessment Type</label>
                <div className="flex items-center bg-gray-100 rounded-full p-1 w-fit">
                  <button
                    type="button"
                    className={`px-4 py-1 rounded-full text-xs font-semibold transition-colors duration-150 ${assessmentType === 'Quiz' ? 'bg-primary text-white' : 'text-gray-600'}`}
                    onClick={() => setAssessmentType('Quiz')}
                    aria-pressed={assessmentType === 'Quiz'}
                  >
                    Quiz
                  </button>
                  <button
                    type="button"
                    className={`px-4 py-1 rounded-full text-xs font-semibold transition-colors duration-150 ${assessmentType === 'Exam' ? 'bg-primary text-white' : 'text-gray-600'}`}
                    onClick={() => setAssessmentType('Exam')}
                    aria-pressed={assessmentType === 'Exam'}
                  >
                    Exam
                  </button>
                </div>
              </div>
              {/* Assessment Dropdown */}
              <div className="flex flex-col min-w-[180px]">
                <label className="text-xs font-medium mb-1" htmlFor="assessment-picker">{assessmentType}</label>
                <div className="flex gap-2 items-center">
                  <select
                    id="assessment-picker"
                    value={selectedAssessment}
                    onChange={e => setSelectedAssessment(e.target.value)}
                    className="border rounded px-3 py-2 text-sm focus:outline-primary"
                    disabled={!selectedSubject}
                  >
                    {assessmentList.map(assess => (
                      <option key={assess} value={assess}>{assess}</option>
                    ))}
                  </select>
                  {assessmentType === 'Quiz' && (
                    <button
                      type="button"
                      className="ml-1 px-2 py-1 border rounded text-xs text-primary border-primary hover:bg-primary/10 transition"
                      onClick={() => alert('Create Quiz - not implemented')}
                    >
                      + Create Quiz
                    </button>
                  )}
                </div>
              </div>
            </div>
            {/* Section 2: Editable Table */}
            <div className="overflow-x-auto">
              <table className="min-w-full border mt-4 bg-white rounded-md">
                <thead>
                  <tr className="bg-muted">
                    <th className="px-3 py-2 text-left">No</th>
                    <th className="px-3 py-2 text-left">Name</th>
                    <th className="px-3 py-2 text-left">Mark (%)</th>
                    <th className="px-3 py-2 text-left">Grade</th>
                    <th className="px-3 py-2 text-left">Conduct</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {studentRows.map((student, idx) => {
                    const expanded = expandedRows.includes(idx);
                    const avgConduct = conductCategories.reduce((sum, cat) => sum + (parseFloat(student.conduct[cat]) || 0), 0) / conductCategories.length;
                    return (
                      <React.Fragment key={student.name}>
                        <tr className="border-b">
                          <td className="px-3 py-2">{idx + 1}</td>
                          <td className="px-3 py-2">{student.name}</td>
                          <td className="px-3 py-2">
                            <input
                              type="text"
                              className="w-16 border rounded px-2 py-1 text-right"
                              value={student.mark}
                              onChange={(e) => handleMarkChange(idx, e.target.value)}
                              placeholder="%"
                            />
                          </td>
                          <td className="px-3 py-2">{student.grade}</td>
                          <td className="px-3 py-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleExpand(idx)}
                              aria-label={expanded ? "Hide Conduct" : "Show Conduct"}
                            >
                              {expanded ? <ChevronUp /> : <ChevronDown />}
                            </Button>
                            <span className="ml-2">{avgConduct ? avgConduct.toFixed(1) : "-"}%</span>
                          </td>
                          <td></td>
                        </tr>
                        {expanded && (
                          <tr className="bg-muted/40">
                            <td colSpan={6} className="px-3 py-2">
                              <div className="flex flex-col md:flex-row gap-4">
                                <div className="flex-1">
                                  <h4 className="font-semibold mb-2">Conduct Breakdown</h4>
                                  <ul className="grid grid-cols-2 gap-x-8 gap-y-1 text-sm">
                                    {conductCategories.map((cat) => (
                                      <li key={cat} className="flex items-center gap-2">
                                        <span className="font-medium w-32">{cat}:</span>
                                        <input
                                          type="text"
                                          className="w-16 border rounded px-2 py-1 text-right"
                                          value={student.conduct[cat]}
                                          onChange={(e) => handleConductChange(idx, cat, e.target.value)}
                                          placeholder="%"
                                        />
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                                <div className="flex-1 min-w-[200px]">
                                  <RadarChart data={Object.fromEntries(
                                    Object.entries(student.conduct).map(([k, v]) => [k, parseFloat(v) || 0])
                                  )} />
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {/* Section 3: Graphs */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
              <Card>
                <CardContent className="p-4">
                  <h4 className="font-semibold mb-2">Marks Overview</h4>
                  <LineChart students={marksData} />
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <h4 className="font-semibold mb-2">Class Conduct Radar</h4>
                  <RadarChart data={avgConduct} />
                </CardContent>
              </Card>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
