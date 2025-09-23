-- Creates a table to track subject-level opt outs (N/A) selections per exam/subject/student.
-- Run this script once on Supabase before deploying the corresponding application changes.

CREATE TABLE IF NOT EXISTS subject_opt_outs (
  exam_id uuid NOT NULL,
  subject_id uuid NOT NULL,
  student_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (exam_id, subject_id, student_id)
);

CREATE INDEX IF NOT EXISTS subject_opt_outs_student_idx
  ON subject_opt_outs (student_id);
