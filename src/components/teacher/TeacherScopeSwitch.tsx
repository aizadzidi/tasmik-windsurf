"use client";

import { usePathname, useRouter } from "next/navigation";
import { useTeachingModeContext } from "@/contexts/TeachingModeContext";
import { cn } from "@/lib/utils";
import type { TeachingMode } from "@/hooks/useTeachingMode";

const attendanceRoutes: Record<TeachingMode, string> = {
  campus: "/teacher/attendance",
  online: "/teacher/online-attendance",
};

export default function TeacherScopeSwitch() {
  const { mode, setMode, programScope } = useTeachingModeContext();
  const pathname = usePathname();
  const router = useRouter();

  // Only render for mixed-scope teachers after hydration
  if (programScope !== "mixed" || mode === null) return null;

  const isOnAttendancePage =
    pathname.startsWith("/teacher/attendance") ||
    pathname.startsWith("/teacher/online-attendance");

  // Campus-only pages that don't exist in online mode
  const isCampusOnlyPage =
    pathname.startsWith("/teacher/lesson") ||
    pathname.startsWith("/teacher/exam");

  const handleModeChange = (newMode: TeachingMode) => {
    if (newMode === mode) return;
    setMode(newMode);
    if (isOnAttendancePage) {
      router.push(attendanceRoutes[newMode]);
    } else if (newMode === "online" && isCampusOnlyPage) {
      // Campus-only pages don't exist in online mode — go to dashboard
      router.push("/teacher");
    }
  };

  return (
    <div className="bg-white border-b border-slate-200 px-4 py-2">
      <div className="max-w-7xl mx-auto flex items-center">
        <div className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 p-1 shadow-sm">
          <button
            onClick={() => handleModeChange("campus")}
            className={cn(
              "rounded-full px-4 py-1.5 text-sm font-semibold transition-all",
              mode === "campus"
                ? "bg-slate-900 text-white shadow"
                : "text-slate-500 hover:text-slate-900"
            )}
          >
            Campus
          </button>
          <button
            onClick={() => handleModeChange("online")}
            className={cn(
              "rounded-full px-4 py-1.5 text-sm font-semibold transition-all",
              mode === "online"
                ? "bg-sky-600 text-white shadow"
                : "text-slate-500 hover:text-slate-900"
            )}
          >
            Online
          </button>
        </div>
      </div>
    </div>
  );
}
