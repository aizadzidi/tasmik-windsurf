"use client";
import { ResponsiveBar } from "@nivo/bar";

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

interface TeacherAssignmentChartProps {
  students: Student[];
  teachers: Teacher[];
}

export default function TeacherAssignmentChart({ students, teachers }: TeacherAssignmentChartProps) {
  // Create teacher assignment stats
  const teacherStats = teachers.map(teacher => {
    const assignedStudents = students.filter(s => s.assigned_teacher_id === teacher.id);
    return {
      teacher: teacher.name,
      students: assignedStudents.length,
      color: "hsl(210, 70%, 50%)"
    };
  });

  // Add unassigned students
  const unassignedStudents = students.filter(s => !s.assigned_teacher_id);
  if (unassignedStudents.length > 0) {
    teacherStats.push({
      teacher: "Unassigned",
      students: unassignedStudents.length,
      color: "hsl(0, 70%, 50%)"
    });
  }

  // Sort by number of students (descending)
  teacherStats.sort((a, b) => b.students - a.students);

  return (
    <div style={{ height: 300 }}>
      <ResponsiveBar
        data={teacherStats}
        keys={["students"]}
        indexBy="teacher"
        margin={{ top: 20, right: 30, bottom: 80, left: 60 }}
        padding={0.3}
        colors={{ scheme: "category10" }}
        borderColor={{ from: "color", modifiers: [["darker", 1.6]] }}
        axisTop={null}
        axisRight={null}
        axisBottom={{
          tickRotation: -45,
          legend: "Teachers",
          legendPosition: "middle",
          legendOffset: 60,
        }}
        axisLeft={{
          legend: "Number of Students",
          legendPosition: "middle",
          legendOffset: -50,
        }}
        labelSkipWidth={12}
        labelSkipHeight={12}
        labelTextColor={{ from: "color", modifiers: [["darker", 1.6]] }}
        animate={true}
        isInteractive={true}
        tooltip={({ value, indexValue }) => (
          <div
            style={{
              background: 'white',
              padding: '9px 12px',
              border: '1px solid #ccc',
              borderRadius: '4px',
              boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
            }}
          >
            <strong>{indexValue}</strong>
            <br />
            Students: {value}
          </div>
        )}
      />
    </div>
  );
}