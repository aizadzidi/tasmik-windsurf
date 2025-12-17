"use client";

import type { ComponentProps } from "react";
import StudentDetailsPanelShared from "@/components/exam/StudentDetailsPanelShared";

type SharedProps = ComponentProps<typeof StudentDetailsPanelShared>;
type StudentDetailsPanelTeacherProps = Omit<SharedProps, "mode">;

export default function StudentDetailsPanelTeacher(props: StudentDetailsPanelTeacherProps) {
  // Use the admin-style detail panel (with charts enabled) for teachers as requested
  return <StudentDetailsPanelShared {...props} mode="admin" />;
}
