"use client";

import type { ComponentProps } from 'react';
import StudentDetailsPanelShared from '@/components/exam/StudentDetailsPanelShared';

type SharedProps = ComponentProps<typeof StudentDetailsPanelShared>;
type StudentDetailsPanelAdminProps = Omit<SharedProps, 'mode'>;

export default function StudentDetailsPanelAdmin(props: StudentDetailsPanelAdminProps) {
  return <StudentDetailsPanelShared {...props} mode="admin" />;
}
