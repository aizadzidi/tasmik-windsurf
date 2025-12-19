import { supabase } from "@/lib/supabaseClient";
import type { AttendanceStatus } from "@/types/attendance";

export type AttendanceRecordRow = {
  id: string;
  class_id: string;
  attendance_date: string;
  student_id: string;
  status: AttendanceStatus;
  recorded_by: string | null;
  notes: string | null;
  created_at?: string;
  updated_at?: string;
};

export async function listAttendanceRecords(params: {
  classIds: string[];
  startDate: string;
  endDate: string;
}): Promise<{ records: AttendanceRecordRow[]; error?: string }> {
  if (!params.classIds.length) {
    return { records: [] };
  }

  const { data, error } = await supabase
    .from("attendance_records")
    .select("id, class_id, attendance_date, student_id, status, recorded_by, notes, created_at, updated_at")
    .in("class_id", params.classIds)
    .gte("attendance_date", params.startDate)
    .lte("attendance_date", params.endDate)
    .order("attendance_date", { ascending: true })
    .order("student_id", { ascending: true });

  if (error) {
    return { records: [], error: error.message };
  }

  return { records: (data ?? []) as AttendanceRecordRow[] };
}

export async function upsertAttendanceRecord(params: {
  classId: string;
  date: string;
  statuses: Record<string, AttendanceStatus>;
  recordedBy: string | null;
}): Promise<{ ok: boolean; error?: string }> {
  const rows = Object.entries(params.statuses).map(([studentId, status]) => ({
    class_id: params.classId,
    attendance_date: params.date,
    student_id: studentId,
    status,
    recorded_by: params.recordedBy,
  }));

  // Avoid relying on unknown unique constraints; replace all rows for the class/date.
  const deleteRes = await deleteAttendanceRecord({ classId: params.classId, date: params.date });
  if (deleteRes.error) {
    return { ok: false, error: deleteRes.error };
  }

  const { error } = await supabase.from("attendance_records").insert(rows);

  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true };
}

export async function deleteAttendanceRecord(params: {
  classId: string;
  date: string;
}): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase
    .from("attendance_records")
    .delete()
    .eq("class_id", params.classId)
    .eq("attendance_date", params.date);

  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true };
}
