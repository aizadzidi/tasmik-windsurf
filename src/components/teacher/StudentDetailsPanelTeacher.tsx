"use client";

import StudentDetailsPanelShared from "@/components/exam/StudentDetailsPanelShared";

export default function StudentDetailsPanelTeacher(props: any) {
  return <StudentDetailsPanelShared {...props} mode="teacher" />;
}
