import { redirect } from "next/navigation";

type LegacyStudentOnlinePageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function LegacyStudentOnlinePage({
  searchParams,
}: LegacyStudentOnlinePageProps) {
  const params = await searchParams;
  const query = new URLSearchParams();

  Object.entries(params ?? {}).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      value.forEach((item) => query.append(key, item));
      return;
    }
    if (typeof value === "string") query.set(key, value);
  });

  const suffix = query.toString() ? `?${query.toString()}` : "";
  redirect(`/student/fees${suffix}`);
}
