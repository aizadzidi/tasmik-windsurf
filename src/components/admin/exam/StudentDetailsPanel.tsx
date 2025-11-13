"use client";

import StudentDetailsPanelShared from "@/components/exam/StudentDetailsPanelShared";
import type { StudentData } from "./StudentTable";

interface StudentDetailsPanelProps {
  student: StudentData | null;
  onClose: () => void;
  classAverages?: { [subject: string]: number };
  classOverallAvg?: number;
  isMobile?: boolean;
  selectedExamName?: string;
  reportButtonLabel?: string;
  examId?: string;
  classId?: string;
}

export default function StudentDetailsPanel(props: StudentDetailsPanelProps) {
  return <StudentDetailsPanelShared {...props} mode="admin" />;
}
