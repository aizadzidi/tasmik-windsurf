import type { SchoolHoliday } from "@/types/attendance";
import { authFetch } from "@/lib/authFetch";

const baseUrl = "/api/admin/holidays";

const parseJson = async (res: Response) => {
  try {
    return await res.json();
  } catch {
    return { success: false, error: res.statusText };
  }
};

export async function listHolidays(): Promise<{ holidays: SchoolHoliday[]; error?: string }> {
  const res = await authFetch(baseUrl, { cache: "no-store" });
  const body = await parseJson(res);
  if (!res.ok || !body?.success) {
    return { holidays: [], error: body?.error || "Unable to load holidays" };
  }
  return { holidays: body.holidays ?? [] };
}

export async function upsertHoliday(
  payload: Partial<SchoolHoliday> & { title: string; start_date: string; end_date: string },
): Promise<{ holiday?: SchoolHoliday; error?: string }> {
  const method = payload.id ? "PUT" : "POST";
  const res = await authFetch(baseUrl, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await parseJson(res);
  if (!res.ok || !body?.success) {
    return { error: body?.error || "Unable to save holiday" };
  }
  return { holiday: body.holiday };
}

export async function deleteHoliday(id: string): Promise<{ ok: boolean; error?: string }> {
  const url = `${baseUrl}?id=${encodeURIComponent(id)}`;
  const res = await authFetch(url, { method: "DELETE" });
  const body = await parseJson(res);
  if (!res.ok || !body?.success) {
    return { ok: false, error: body?.error || "Unable to delete holiday" };
  }
  return { ok: true };
}
