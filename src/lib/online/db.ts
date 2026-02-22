type ErrorLike = {
  code?: string | null;
  message?: string | null;
  details?: string | null;
};

const getErrorText = (error: ErrorLike | null | undefined) =>
  `${error?.message ?? ""} ${error?.details ?? ""}`.toLowerCase();

export const isMissingRelationError = (error: ErrorLike | null | undefined, table: string) =>
  (() => {
    const text = getErrorText(error);
    const normalizedTable = table.toLowerCase();
    return (
      text.includes(`relation "public.${normalizedTable}" does not exist`) ||
      (text.includes("could not find the table") &&
        text.includes(normalizedTable) &&
        text.includes("schema cache"))
    );
  })();

export const isMissingFunctionError = (error: ErrorLike | null | undefined, fn: string) => {
  const text = getErrorText(error);
  return text.includes("function") && text.includes(fn.toLowerCase()) && text.includes("does not exist");
};

export const isMissingColumnError = (
  error: ErrorLike | null | undefined,
  column: string,
  table?: string
) => {
  const text = getErrorText(error);

  const normalizedColumn = column.toLowerCase();
  const hasMissingColumnText =
    (text.includes("column") && text.includes("does not exist")) ||
    (text.includes("could not find the") && text.includes("column") && text.includes("schema cache"));
  if (!hasMissingColumnText || !text.includes(normalizedColumn)) return false;
  if (!table) return true;

  const normalizedTable = table.toLowerCase();
  return text.includes(normalizedTable);
};

export const monthStartUtc = (year: number, monthIndex: number) =>
  new Date(Date.UTC(year, monthIndex, 1));

export const toDateKey = (date: Date) => date.toISOString().slice(0, 10);
