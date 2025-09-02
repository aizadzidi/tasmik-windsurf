"use client";
import React, { useState, useEffect, useMemo } from "react";
import AdminNavbar from "@/components/admin/AdminNavbar";
import HeaderToolbar from "@/components/admin/exam/HeaderToolbar";
import ClassOverview from "@/components/admin/exam/ClassOverview";
import StudentTable, { StudentData } from "@/components/admin/exam/StudentTable";
import StudentDetailsPanel from "@/components/admin/exam/StudentDetailsPanel";
import MobileStudentCard from "@/components/admin/exam/MobileStudentCard";
import { supabase } from "@/lib/supabaseClient";

// Types
interface ClassData {
  id: string;
  name: string;
}

interface FilterChip {
  id: string;
  label: string;
  type: 'performance' | 'conduct';
}

// Mock data generation
const subjects = ['Math', 'English', 'Science', 'BM', 'BI', 'Quran', 'Arabic', 'History'];
const classNames = ['1 DLP', '2 Ibtidai', '3 Mutawasit', '4 Thanawi', '5 Aliyah', '6 Takhmili'];

function generateMockData(): StudentData[] {
  const students: StudentData[] = [];
  
  classNames.forEach((className, classIndex) => {
    for (let i = 1; i <= 8; i++) {
      const studentId = `STU${classIndex}${i.toString().padStart(3, '0')}`;
      const studentName = `Student ${classIndex + 1}-${i}`;
      
      const subjectScores: { [subject: string]: { score: number; trend: number[]; grade: string } } = {};
      
      subjects.forEach(subject => {
        const baseScore = 60 + Math.random() * 35;
        const trend = Array.from({ length: 6 }, (_, idx) => 
          Math.max(0, Math.min(100, baseScore + (Math.random() - 0.5) * 20 + idx * 2))
        );
        const score = Math.round(trend[trend.length - 1]);
        const grade = score >= 85 ? 'A' : score >= 75 ? 'B' : score >= 65 ? 'C' : 'D';
        
        subjectScores[subject] = {
          score,
          trend: trend.map(t => Math.round(t)),
          grade
        };
      });
      
      const conduct = {
        discipline: Math.round((3 + Math.random() * 2) * 10) / 10,
        effort: Math.round((3 + Math.random() * 2) * 10) / 10,
        participation: Math.round((2.5 + Math.random() * 2.5) * 10) / 10,
        motivationalLevel: Math.round((3 + Math.random() * 2) * 10) / 10,
        character: Math.round((3 + Math.random() * 2) * 10) / 10,
        leadership: Math.round((3 + Math.random() * 2) * 10) / 10,
      };
      
      const average = Math.round(
        Object.values(subjectScores).reduce((sum, s) => sum + s.score, 0) / subjects.length
      );
      
      students.push({
        id: studentId,
        name: studentName,
        class: className,
        subjects: subjectScores,
        conduct,
        overall: {
          average,
          rank: 0, // Will be calculated after sorting
          needsAttention: average < 60 || conduct.participation < 3,
          attentionReason: average < 60 ? 'Academic performance below average' : 
                          conduct.participation < 3 ? 'Low participation score needs attention' : undefined,
        },
      });
    }
  });
  
  // Calculate ranks
  students.sort((a, b) => b.overall.average - a.overall.average);
  students.forEach((student, index) => {
    student.overall.rank = index + 1;
  });
  
  return students;
}

export default function AdminExamPage() {
  // State
  const [classes, setClasses] = useState<ClassData[]>([]);
  const [loading, setLoading] = useState(true);
  const [mockStudents] = useState<StudentData[]>(() => generateMockData());
  const [selectedStudent, setSelectedStudent] = useState<StudentData | null>(null);
  
  // Filters
  const [selectedClass, setSelectedClass] = useState('');
  const [selectedSubject, setSelectedSubject] = useState('');
  const [selectedExam, setSelectedExam] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterChips, setFilterChips] = useState<FilterChip[]>([]);
  const [isMobile, setIsMobile] = useState(false);

  // Fetch real classes data
  const fetchClasses = async () => {
    try {
      setLoading(true);
      const { data: classesData, error } = await supabase
        .from('classes')
        .select('id, name')
        .order('name');
      
      if (error) {
        console.error('Error fetching classes:', error);
        // Use mock classes as fallback
        setClasses(classNames.map((name, index) => ({ id: `class-${index}`, name })));
      } else {
        setClasses(classesData || []);
      }
    } catch (error) {
      console.error('Error:', error);
      // Use mock classes as fallback
      setClasses(classNames.map((name, index) => ({ id: `class-${index}`, name })));
    } finally {
      setLoading(false);
    }
  };

  // Check if mobile
  const checkMobile = () => {
    setIsMobile(window.innerWidth < 1024);
  };

  useEffect(() => {
    fetchClasses();
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Filter students based on current filters
  const filteredStudents = useMemo(() => {
    return mockStudents.filter(student => {
      if (selectedClass && student.class !== classes.find(c => c.id === selectedClass)?.name) {
        return false;
      }
      if (searchQuery && !student.name.toLowerCase().includes(searchQuery.toLowerCase())) {
        return false;
      }
      return true;
    });
  }, [mockStudents, selectedClass, searchQuery, classes]);

  // Calculate class overview data
  const classOverviewData = useMemo(() => {
    const selectedClassName = selectedClass ? classes.find(c => c.id === selectedClass)?.name || '' : '';
    
    // Score distribution
    const scoreRanges = [
      { range: '90-100', count: 0, percentage: 0 },
      { range: '80-89', count: 0, percentage: 0 },
      { range: '70-79', count: 0, percentage: 0 },
      { range: '60-69', count: 0, percentage: 0 },
      { range: '0-59', count: 0, percentage: 0 },
    ];
    
    filteredStudents.forEach(student => {
      const avg = student.overall.average;
      if (avg >= 90) scoreRanges[0].count++;
      else if (avg >= 80) scoreRanges[1].count++;
      else if (avg >= 70) scoreRanges[2].count++;
      else if (avg >= 60) scoreRanges[3].count++;
      else scoreRanges[4].count++;
    });
    
    scoreRanges.forEach(range => {
      range.percentage = filteredStudents.length > 0 
        ? Math.round((range.count / filteredStudents.length) * 100) 
        : 0;
    });
    
    // Subject averages
    const subjectAverages = subjects.map(subject => {
      const scores = filteredStudents
        .filter(s => s.subjects[subject])
        .map(s => s.subjects[subject].score);
      const average = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
      const trend = Math.random() > 0.5 ? 'up' : Math.random() > 0.3 ? 'stable' : 'down';
      
      return {
        subject,
        average,
        trend: trend as 'up' | 'down' | 'stable',
        change: (Math.random() - 0.5) * 10
      };
    });
    
    // Conduct medians
    const conductMedians = [
      {
        aspect: 'Discipline',
        median: filteredStudents.reduce((sum, s) => sum + s.conduct.discipline, 0) / filteredStudents.length || 0,
        target: 4.0
      },
      {
        aspect: 'Effort',
        median: filteredStudents.reduce((sum, s) => sum + s.conduct.effort, 0) / filteredStudents.length || 0,
        target: 4.0
      },
      {
        aspect: 'Participation',
        median: filteredStudents.reduce((sum, s) => sum + s.conduct.participation, 0) / filteredStudents.length || 0,
        target: 3.5
      },
      {
        aspect: 'Motivational Level',
        median: filteredStudents.reduce((sum, s) => sum + s.conduct.motivationalLevel, 0) / filteredStudents.length || 0,
        target: 4.0
      },
      {
        aspect: 'Character',
        median: filteredStudents.reduce((sum, s) => sum + s.conduct.character, 0) / filteredStudents.length || 0,
        target: 4.0
      },
      {
        aspect: 'Leadership',
        median: filteredStudents.reduce((sum, s) => sum + s.conduct.leadership, 0) / filteredStudents.length || 0,
        target: 4.0
      }
    ];
    
    return {
      selectedClassName,
      studentsCount: filteredStudents.length,
      scoreDistribution: scoreRanges,
      subjectAverages,
      conductMedians
    };
  }, [filteredStudents, selectedClass, classes]);

  // Class averages for benchmarking
  const classAverages = useMemo(() => {
    const averages: { [subject: string]: number } = {};
    subjects.forEach(subject => {
      const scores = filteredStudents
        .filter(s => s.subjects[subject])
        .map(s => s.subjects[subject].score);
      averages[subject] = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
    });
    return averages;
  }, [filteredStudents]);

  // Handler functions
  const handleStudentClick = (student: StudentData) => {
    setSelectedStudent(student);
  };

  const handleCloseDetailsPanel = () => {
    setSelectedStudent(null);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#f8fafc] via-[#e2e8f0] to-[#f1f5f9]">
        <AdminNavbar />
        <div className="p-6">
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
      
      <div className={`relative p-4 sm:p-6 transition-opacity duration-300 ${selectedStudent ? 'opacity-30 pointer-events-none' : ''}`}>
        {/* Page Header */}
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Student Performance Dashboard</h1>
            <p className="text-gray-600 mt-1">
              {filteredStudents.length} students • {classes.length} classes
            </p>
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
          classes={classes}
        />

        {/* Class Overview Strip - Hide when detail panel is open */}
        {!selectedStudent && (
          <ClassOverview
            selectedClassName={classOverviewData.selectedClassName}
            studentsCount={classOverviewData.studentsCount}
            scoreDistribution={classOverviewData.scoreDistribution}
            subjectAverages={classOverviewData.subjectAverages}
            conductMedians={classOverviewData.conductMedians}
          />
        )}

        {/* Main Content */}
        {isMobile ? (
          /* Mobile Cards Layout */
          <div className="space-y-4">
            {filteredStudents.map((student) => (
              <MobileStudentCard
                key={student.id}
                student={student}
                onViewDetails={handleStudentClick}
              />
            ))}
          </div>
        ) : (
          /* Desktop Table Layout */
          <StudentTable
            data={filteredStudents}
            onRowClick={handleStudentClick}
            loading={loading}
          />
        )}
      </div>

      {/* Student Details Panel - Right Side Overlay */}
      <StudentDetailsPanel
        student={selectedStudent}
        onClose={handleCloseDetailsPanel}
        classAverages={classAverages}
      />
    </div>
  );
}
