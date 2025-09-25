"use client";

import StudentDetailsPanelShared from '@/components/exam/StudentDetailsPanelShared';

export default function StudentDetailsPanelAdmin(props: any) {
  return <StudentDetailsPanelShared {...props} mode="admin" />;
}