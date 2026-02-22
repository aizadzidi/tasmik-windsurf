type ErrorLike = {
  message?: string | null;
  details?: string | null;
};

const getErrorText = (error: ErrorLike | null | undefined) =>
  `${error?.message ?? ""} ${error?.details ?? ""}`.toLowerCase();

export const isMissingRelationError = (error: ErrorLike | null | undefined, table: string) =>
  getErrorText(error).includes(`relation "public.${table.toLowerCase()}" does not exist`);

export const isMissingFunctionError = (error: ErrorLike | null | undefined, fn: string) => {
  const text = getErrorText(error);
  return text.includes("function") && text.includes(fn.toLowerCase()) && text.includes("does not exist");
};

export const monthStartUtc = (year: number, monthIndex: number) =>
  new Date(Date.UTC(year, monthIndex, 1));

export const toDateKey = (date: Date) => date.toISOString().slice(0, 10);
