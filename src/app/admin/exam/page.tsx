"use client";
import React, { useState, useEffect, useMemo } from "react";
import AdminNavbar from "@/components/admin/AdminNavbar";
import HeaderToolbar from "@/components/admin/exam/HeaderToolbar";
import StudentTable, { StudentData } from "@/components/admin/exam/StudentTable";
import StudentDetailsPanel from "@/components/exam/StudentDetailsPanelShared";
import CreateExamModal, { ExamFormData } from "@/components/admin/exam/CreateExamModal";
import EditExamModal from "@/components/admin/exam/EditExamModal";
import ManageExamsModal from "@/components/admin/exam/ManageExamsModal";
import ManageSubjectsModal from "@/components/admin/exam/ManageSubjectsModal";
import ManageConductCriteriasModal from "@/components/admin/exam/ManageConductCriteriasModal";
import ManageGradingModal from "@/components/admin/exam/ManageGradingModal";
import { Plus } from "lucide-react";
import ManageActionsMenu from "@/components/admin/exam/ManageActionsMenu";
import { parseJsonSafe } from "@/lib/fetchUtils";
import { authFetch } from "@/lib/authFetch";

// Types
interface ClassData {
  id: string;
  name: string;
}


// Types for exam metadata
// Exam with nested classes/subjects for filtering
interface ExamItem {
  id: string;
  name: string;
  type: string;
  created_at?: string;
  exam_classes?: { conduct_weightage?: number; classes?: { id: string; name?: string } }[];
  exam_subjects?: { subjects?: { id: string; name?: string } }[];
  exam_class_subjects?: Array<{ classes?: { id: string; name?: string }; subjects?: { id: string; name?: string } }>;
}

interface ExamMetadata {
  exams: ExamItem[];
  classes: Array<{ id: string; name: string }>;
  subjects: Array<{ id: string; name: string }>;
  success: boolean;
}

interface ExamDataResponse {
  students: StudentData[];
  subjects: string[];
  success: boolean;
  rosterSource?: 'snapshot' | 'current';
}

export default function AdminExamPage() {
  // State
  const [classes, setClasses] = useState<ClassData[]>([]);
  const [exams, setExams] = useState<ExamItem[]>([]);
  const [subjects, setSubjects] = useState<string[]>([]);
  const [students, setStudents] = useState<StudentData[]>([]);
  const [loading, setLoading] = useState(true);
  const [rosterSource, setRosterSource] = useState<'snapshot' | 'current'>('current');
  const [selectedStudent, setSelectedStudent] = useState<StudentData | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isManageModalOpen, setIsManageModalOpen] = useState(false);
  const [isManageSubjectsModalOpen, setIsManageSubjectsModalOpen] = useState(false);
  const [isManageCriteriasModalOpen, setIsManageCriteriasModalOpen] = useState(false);
  const [isManageGradingModalOpen, setIsManageGradingModalOpen] = useState(false);
  const [selectedExamForEdit, setSelectedExamForEdit] = useState<ExamItem | null>(null);
  
  // Filters
  const [selectedClass, setSelectedClass] = useState('');
  const [selectedSubject, setSelectedSubject] = useState('');
  const [selectedExam, setSelectedExam] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [isMobile, setIsMobile] = useState(false);

  // Fetch exam metadata (exams, classes, subjects) - with safety checks
  const fetchExamMetadata = async () => {
    try {
      const response = await authFetch('/api/admin/exam-metadata');
      const data: ExamMetadata = await parseJsonSafe(response);
      
      if (data.success) {
        // Safety checks before setting state
        setClasses(Array.isArray(data.classes) ? data.classes : []);
        setExams(Array.isArray(data.exams) ? data.exams : []);
        setSubjects(Array.isArray(data.subjects) ? data.subjects.map((s) => (typeof s?.name === 'string' ? s.name : '')).filter(Boolean) : []);
        
        // Auto-select the first exam if available
        if (Array.isArray(data.exams) && data.exams.length > 0 && data.exams[0]?.id) {
          setSelectedExam(data.exams[0].id);
        }
      }
    } catch (error) {
      console.error('Error fetching exam metadata:', error);
      // Set empty arrays on error to prevent undefined issues
      setClasses([]);
      setExams([]);
      setSubjects([]);
    }
  };
  
  // Fetch exam student data - memoized to prevent infinite re-renders
  const fetchExamData = React.useCallback(async () => {
    try {
      setLoading(true);
      
      const params = new URLSearchParams();
      if (selectedExam) params.append('examId', selectedExam);
      if (selectedClass) params.append('classId', selectedClass);
      
      const response = await authFetch(`/api/admin/exams?${params}`);
      const data: ExamDataResponse = await parseJsonSafe(response);
      
      if (data.success) {
        // Optionally enforce exclusion on client as a safeguard
        let studentsList = Array.isArray(data.students) ? data.students : [];
        setRosterSource(data.rosterSource === 'snapshot' ? 'snapshot' : 'current');
        if (selectedExam) {
          try {
            const exclParams = new URLSearchParams({ examId: selectedExam });
            if (selectedClass) exclParams.append('classId', selectedClass);
            const exclRes = await fetch(`/api/teacher/exam-exclusions?${exclParams.toString()}`);
            const exclJson = await exclRes.json();
            const excludedIds: string[] = Array.isArray(exclJson.excludedStudentIds) ? exclJson.excludedStudentIds : [];
            if (excludedIds.length > 0) {
              const excludedSet = new Set(excludedIds.map(String));
              studentsList = studentsList.filter((s) => s && !excludedSet.has(String(s.id)));
            }
          } catch (e) {
            console.error('Client-side exclusion fetch failed', e);
          }
        }
        // Safety check before setting students data
        setStudents(studentsList);
      } else {
        console.error('Error fetching exam data:', data);
        setStudents([]);
        setRosterSource('current');
      }
    } catch (error) {
      console.error('Error fetching exam data:', error);
      setStudents([]);
      setRosterSource('current');
    } finally {
      setLoading(false);
    }
  }, [selectedExam, selectedClass]);

  // Check if mobile
  const checkMobile = () => {
    setIsMobile(window.innerWidth < 1024);
  };

  // No global outside-click handlers needed after simplifying actions UI

  // Initial load - fetch metadata and setup mobile detection
  useEffect(() => {
    fetchExamMetadata();
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);
  
  // Fetch exam data when filters change - only after metadata is loaded
  useEffect(() => {
    if (exams.length > 0) {
      fetchExamData();
    } else if (Array.isArray(exams)) {
      // If exams array is loaded but empty, stop loading state
      setLoading(false);
      setStudents([]);
    }
  }, [selectedExam, selectedClass, exams.length, exams, fetchExamData]);

  // Optimized class name lookup with safety check
  const selectedClassName = useMemo(() => {
    if (!Array.isArray(classes) || !selectedClass) return undefined;
    return classes.find(c => c && c.id === selectedClass)?.name;
  }, [classes, selectedClass]);

  // Selected exam name for display in details panel header
  const selectedExamName = useMemo(() => {
    if (!Array.isArray(exams) || !selectedExam) return undefined;
    return exams.find(e => e && e.id === selectedExam)?.name;
  }, [exams, selectedExam]);

  // Filter UI lists by selected exam
  const classesForUI = useMemo(() => {
    if (!selectedExam) return classes;
    const ex = exams.find(e => e && e.id === selectedExam);
    const list = (ex?.exam_classes || [])
      .map(ec => ec?.classes)
      .filter((c): c is { id: string; name: string } => Boolean(c?.id) && Boolean(c?.name));
    return list.length ? list : classes;
  }, [selectedExam, exams, classes]);

  const subjectsForUI = useMemo(() => {
    if (!selectedExam) return subjects;
    const ex = exams.find(e => e && e.id === selectedExam);
    // If per-class mapping exists
    const ecs = Array.isArray(ex?.exam_class_subjects) ? ex.exam_class_subjects : undefined;
    if (ecs && ecs.length > 0) {
      if (selectedClass) {
        const names = ecs
          .filter(row => row?.classes?.id === selectedClass)
          .map(row => row?.subjects?.name)
          .filter((n): n is string => !!n);
        if (names.length > 0) return names;
      } else {
        const names = Array.from(new Set(ecs.map(row => row?.subjects?.name).filter((n): n is string => !!n)));
        if (names.length > 0) return names;
      }
    }
    const list = (ex?.exam_subjects || [])
      .map((es) => es?.subjects?.name)
      .filter((n): n is string => typeof n === 'string' && n.length > 0);
    return list.length ? list : subjects;
  }, [selectedExam, selectedClass, exams, subjects]);

  // Keep chosen class/subject valid for the selected exam
  useEffect(() => {
    if (!selectedExam) return;
    // Fix class if not allowed
    if (selectedClass && !classesForUI.some(c => c.id === selectedClass)) {
      setSelectedClass('');
    }
    // Fix subject if not allowed
    if (selectedSubject && !subjectsForUI.includes(selectedSubject)) {
      setSelectedSubject('');
    }
  }, [selectedExam, classesForUI, subjectsForUI, selectedClass, selectedSubject]);
  
  // Filter students based on current filters - optimized with safety checks
  const filteredStudents = useMemo(() => {
    // Safety check to prevent undefined array errors
    if (!Array.isArray(students) || students.length === 0) return [];
    
    return students.filter(student => {
      // Skip invalid students
      if (!student || typeof student.name !== 'string') return false;

      // Subject filter: hide students marked as N/A (opted-out) for selected subject
      if (selectedSubject && student.subjects?.[selectedSubject]?.optedOut) {
        return false;
      }
      
      // Class filter - use pre-computed class name
      if (selectedClass && student.class !== selectedClassName) {
        return false;
      }
      // Search filter - case insensitive, trimmed
      const trimmedQuery = (searchQuery || '').trim().toLowerCase();
      if (trimmedQuery && !student.name.toLowerCase().includes(trimmedQuery)) {
        return false;
      }
      return true;
    });
  }, [students, selectedClass, selectedClassName, selectedSubject, searchQuery]);

  // Class averages used inside the details panel (per-subject, academic only)
  // Still computed for fallback/display purposes, but we will also compute a blended class overall average
  const classAverages = useMemo(() => {
    if (!Array.isArray(students) || !Array.isArray(subjects) || students.length === 0 || subjects.length === 0) {
      return {} as { [subject: string]: number };
    }

    const targetClassName = selectedStudent?.class || selectedClassName;
    const baseStudents = targetClassName
      ? students.filter((s) => s && s.class === targetClassName)
      : students;

    if (baseStudents.length === 0) return {} as { [subject: string]: number };

    const averages: { [subject: string]: number } = {};

    subjects.forEach((subject) => {
      if (!subject) return;
      let total = 0;
      let count = 0;
      baseStudents.forEach((stu) => {
        const s = stu?.subjects?.[subject];
        if (!s) return;
        const grade = String(s.grade || '').toUpperCase();
        if (grade === 'TH') return;
        if (typeof s.score === 'number') {
          total += s.score;
          count += 1;
        }
      });
      averages[subject] = count > 0 ? Math.round(total / count) : 0;
    });

    return averages;
  }, [students, subjects, selectedStudent, selectedClassName]);

  // New: Class overall average (blended academic + conduct), comparable to the student's Current Average
  const classOverallAvg = useMemo(() => {
    if (!Array.isArray(students) || students.length === 0) return null as number | null;
    const targetClassName = selectedStudent?.class || selectedClassName;
    const baseStudents = targetClassName
      ? students.filter((s) => s && s.class === targetClassName)
      : students;
    const list = baseStudents
      .map((s) => (typeof s?.overall?.average === 'number' ? s.overall.average : null))
      .filter((n): n is number => n != null && Number.isFinite(n));
    if (list.length === 0) return null;
    const avg = list.reduce((a, b) => a + b, 0) / list.length;
    return avg;
  }, [students, selectedStudent, selectedClassName]);

  // Handler functions
  const handleCreateExam = async (examData: ExamFormData) => {
    try {
      // Convert DateRange to the format expected by the backend
      const processedExamData = {
        ...examData,
        dateRange: {
          from: examData.dateRange?.from ? examData.dateRange.from.toISOString().split('T')[0] : '',
          to: examData.dateRange?.to ? examData.dateRange.to.toISOString().split('T')[0] : examData.dateRange?.from ? examData.dateRange.from.toISOString().split('T')[0] : ''
        }
      };

      const response = await authFetch('/api/admin/exam-metadata', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(processedExamData),
      });

      const result = await parseJsonSafe(response);
      
      if (result.success) {
        // Refresh the exam metadata to include the new exam
        await fetchExamMetadata();
        // Auto-select the newly created exam
        setSelectedExam(result.examId);
      } else {
        console.error('Failed to create exam:', result.error);
        alert(`Failed to create exam: ${result?.error || 'Please try again.'}`);
      }
    } catch (error) {
      console.error('Error creating exam:', error);
      const message = error instanceof Error ? error.message : 'Please try again.';
      alert(`Error creating exam: ${message}`);
    }
  };

  const handleStudentClick = (student: StudentData) => {
    setSelectedStudent(student);
  };

  const handleCloseDetailsPanel = () => {
    setSelectedStudent(null);
  };

  const handleEditExam = async (examId: string, examData: ExamFormData) => {
    try {
      // Convert DateRange to the format expected by the backend
      const processedExamData = {
        ...examData,
        dateRange: {
          from: examData.dateRange?.from ? examData.dateRange.from.toISOString().split('T')[0] : '',
          to: examData.dateRange?.to ? examData.dateRange.to.toISOString().split('T')[0] : examData.dateRange?.from ? examData.dateRange.from.toISOString().split('T')[0] : ''
        }
      };

      const response = await authFetch(`/api/admin/exam-metadata?id=${examId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(processedExamData),
      });

      const result = await parseJsonSafe(response);
      
      if (result.success) {
        // Refresh the exam metadata to show updated exam
        await fetchExamMetadata();
        // Keep the same exam selected if it was the one being edited
        if (selectedExam === examId) {
          // Trigger a refresh of exam data
          await fetchExamData();
        }
        alert('Exam updated successfully!');
      } else {
        console.error('Failed to update exam:', result.error);
        alert(`Failed to update exam: ${result.error}`);
      }
    } catch (error) {
      console.error('Error updating exam:', error);
      const message = error instanceof Error ? error.message : 'Please try again.';
      alert(`Error updating exam: ${message}`);
    }
  };

  const handleDeleteExam = async (examId: string, examName: string) => {
    if (confirm(`Are you sure you want to delete the exam "${examName}"? This action cannot be undone.`)) {
      try {
        // First attempt: try to delete without cascade
        let response = await authFetch(`/api/admin/exam-metadata?id=${examId}`, {
          method: 'DELETE',
        });
        let result = await parseJsonSafe(response);
        
        if (result.success) {
          // Refresh the exam metadata to remove deleted exam
          await fetchExamMetadata();
          // Clear selected exam if it was the deleted one
          if (selectedExam === examId) {
            setSelectedExam('');
          }
          alert('Exam deleted successfully!');
        } else if (result.hasResults) {
          // Exam has results, ask for cascade deletion
          const cascadeConfirm = confirm(
            `The exam "${examName}" has ${result.resultsCount || 'existing'} student result(s). ` +
            `Deleting the exam will also permanently remove all associated student results. ` +
            `Do you want to proceed with deletion?`
          );
          
          if (cascadeConfirm) {
            // Attempt cascade deletion
            response = await authFetch(`/api/admin/exam-metadata?id=${examId}&cascade=true`, {
              method: 'DELETE',
            });
            result = await parseJsonSafe(response);
            
            if (result.success) {
              await fetchExamMetadata();
              if (selectedExam === examId) {
                setSelectedExam('');
              }
              alert('Exam and all associated results deleted successfully!');
            } else {
              console.error('Failed to delete exam with cascade:', result.error);
              alert(`Failed to delete exam: ${result.error}`);
            }
          }
        } else {
          console.error('Failed to delete exam:', result.error);
          alert(`Failed to delete exam: ${result.error}`);
        }
      } catch (error) {
        console.error('Error deleting exam:', error);
        alert('Error deleting exam. Please try again.');
      }
    }
  };

  const openEditModal = (exam: ExamItem) => {
    setSelectedExamForEdit(exam);
    setIsEditModalOpen(true);
  };

  const closeEditModal = () => {
    setIsEditModalOpen(false);
    setSelectedExamForEdit(null);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#f8fafc] via-[#e2e8f0] to-[#f1f5f9]">
        <AdminNavbar />
        <div className="max-w-7xl p-6 mx-auto">
          <div className="animate-pulse space-y-6">
            <div className="h-16 bg-white/50 rounded-2xl"></div>
            <div className="h-32 bg-white/50 rounded-2xl"></div>
            <div className="h-96 bg-white/50 rounded-2xl"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#f8fafc] via-[#e2e8f0] to-[#f1f5f9]">
      <AdminNavbar />
      
      <div className="relative p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto transition-opacity duration-300">
        {/* Page Header */}
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Student Performance Dashboard</h1>
            <p className="text-gray-600 mt-1">
              {selectedExamName ? `${selectedExamName} • ` : ''}{filteredStudents.length} students • {classesForUI.length} classes
              {selectedExamName && (
                <span className="ml-2 inline-flex items-center rounded-full border border-gray-200 bg-white px-2 py-0.5 text-[10px] text-gray-600">
                  Roster: {rosterSource === 'snapshot' ? 'Historical' : 'Current'}
                </span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setIsCreateModalOpen(true)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors shadow-sm"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">Create Exam</span>
            </button>
            <ManageActionsMenu
              onOpenSubjects={() => setIsManageSubjectsModalOpen(true)}
              onOpenConduct={() => setIsManageCriteriasModalOpen(true)}
              onOpenExams={() => setIsManageModalOpen(true)}
              onOpenGrading={() => setIsManageGradingModalOpen(true)}
            />
          </div>
        </div>


        {/* Header Toolbar */}
        <HeaderToolbar
          selectedClass={selectedClass}
          onClassChange={setSelectedClass}
          selectedSubject={selectedSubject}
          onSubjectChange={setSelectedSubject}
          selectedExam={selectedExam}
          onExamChange={setSelectedExam}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          classes={classesForUI}
          exams={exams.map(e => ({ id: e.id, name: e.name, type: e.type }))}
          subjects={subjectsForUI}
        />


        {/* Main Content - Always show table format */}
        <div className={selectedStudent ? 'opacity-30 pointer-events-none' : ''}>
          {exams.length === 0 && !loading ? (
            <div className="bg-white/90 backdrop-blur-sm border border-gray-100 rounded-2xl p-12 text-center shadow-sm">
              <div className="text-gray-400 mb-4">
                <svg className="w-16 h-16 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-gray-700 mb-2">No Exams Found</h3>
              <p className="text-gray-500 mb-6">No exam data is available yet. Create some exams and add student results to see the dashboard.</p>
            </div>
          ) : (
            <StudentTable
              data={filteredStudents}
              onRowClick={handleStudentClick}
              loading={loading}
              selectedSubject={selectedSubject}
              examId={selectedExam}
              classId={selectedClass}
            />
          )}
        </div>
      </div>

      {/* Student Details Panel - Responsive Overlay */}
      <StudentDetailsPanel
        student={selectedStudent}
        onClose={handleCloseDetailsPanel}
        classAverages={classAverages}
        classOverallAvg={classOverallAvg ?? undefined}
        isMobile={isMobile}
        selectedExamName={selectedExamName || ''}
        examId={selectedExam || ''}
        classId={selectedStudent?.classId || selectedClass || ''}
      />

      {/* Manage Exams Modal */}
      <ManageExamsModal
        isOpen={isManageModalOpen}
        onClose={() => setIsManageModalOpen(false)}
        exams={exams}
        selectedExam={selectedExam}
        onSelectExam={setSelectedExam}
        onEdit={(exam) => {
          setIsManageModalOpen(false);
          openEditModal(exam);
        }}
        onDelete={(id, name) => {
          // Close modal to prevent stacked confirmations behind overlay
          setIsManageModalOpen(false);
          handleDeleteExam(id, name);
        }}
        onToggleRelease={async (exam, next) => {
          try {
            const res = await authFetch('/api/admin/exam-release', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ examId: exam.id, released: next })
            });
            const data = await parseJsonSafe(res);
            if (!res.ok || !data || data.success !== true) throw new Error(data?.error || 'Failed');
            await fetchExamMetadata();
          } catch (e) {
            console.error('Toggle release failed', e);
            alert('Failed to update release status');
          }
        }}
      />

      {/* Create Exam Modal */}
      <CreateExamModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSubmit={handleCreateExam}
        classes={classes}
        subjects={subjects}
      />

      {/* Edit Exam Modal */}
      <EditExamModal
        isOpen={isEditModalOpen}
        onClose={closeEditModal}
        onSubmit={handleEditExam}
        classes={classes}
        subjects={subjects}
        exam={selectedExamForEdit}
      />

      {/* Manage Subjects Modal */}
      <ManageSubjectsModal
        isOpen={isManageSubjectsModalOpen}
        onClose={() => setIsManageSubjectsModalOpen(false)}
        onRefresh={fetchExamMetadata}
      />

      {/* Manage Conduct Criterias Modal */}
      <ManageConductCriteriasModal
        isOpen={isManageCriteriasModalOpen}
        onClose={() => setIsManageCriteriasModalOpen(false)}
        onRefresh={() => {}} // Conduct criteria refresh if needed
      />

      {/* Manage Grading Systems Modal */}
      <ManageGradingModal
        isOpen={isManageGradingModalOpen}
        onClose={() => setIsManageGradingModalOpen(false)}
        onRefresh={() => {}} // Grading system refresh if needed
      />
    </div>
  );
}
