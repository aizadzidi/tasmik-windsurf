export type Exam = {
  id: string;
  name: string;
  class_id: string;
  date?: string;
};

export type ExamResult = {
  student_id: string;
  subject: string;
  score?: number;
  grade?: string;
};

export type GradingScale = {
  grade: string;
  min_score: number;
  max_score?: number;
};
