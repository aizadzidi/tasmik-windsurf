export type MurajaahMode = "recitation" | "test";

export interface MurajaahTestAssessment {
  total_percentage?: number;
  passed?: boolean;
  pass_threshold?: number;
}

export interface MurajaahReadingProgress {
  murajaah_mode?: MurajaahMode;
  test_assessment?: MurajaahTestAssessment;
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isMurajaahType = (type: string | null | undefined) => {
  const normalized = (type ?? "").trim().toLowerCase();
  return (
    normalized === "murajaah" ||
    normalized === "old murajaah" ||
    normalized === "new murajaah"
  );
};

export const parseMurajaahReadingProgress = (
  value: unknown
): MurajaahReadingProgress | null => {
  if (!isObject(value)) return null;
  return value as MurajaahReadingProgress;
};

export const getMurajaahModeFromReport = (report: {
  type?: string | null;
  reading_progress?: unknown;
}): MurajaahMode | null => {
  if (!isMurajaahType(report.type)) return null;
  const parsed = parseMurajaahReadingProgress(report.reading_progress);
  if (parsed?.murajaah_mode === "test") return "test";
  return "recitation";
};

export const getMurajaahModeLabel = (mode: MurajaahMode | null): string => {
  if (mode === "test") return "Test";
  if (mode === "recitation") return "Recitation";
  return "-";
};

export const getMurajaahTestAssessmentFromReport = (report: {
  reading_progress?: unknown;
}): MurajaahTestAssessment | null => {
  const parsed = parseMurajaahReadingProgress(report.reading_progress);
  if (!parsed?.test_assessment) return null;
  return parsed.test_assessment;
};
