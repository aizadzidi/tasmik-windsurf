"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAdminPermissions } from "@/hooks/useAdminPermissions";
import { cn } from "@/lib/utils";

const isCampusRoute = (pathname: string) => pathname === "/admin";
const isOnlineRoute = (pathname: string) => pathname.startsWith("/admin/online");

export default function AdminScopeSwitch() {
  const pathname = usePathname();
  const { loading, isAdmin, permissions } = useAdminPermissions();

  const canSeeCampus = isAdmin || permissions.has("admin:dashboard");
  const canSeeOnline = isAdmin || permissions.has("admin:online");
  const campusActive = isCampusRoute(pathname);
  const onlineActive = isOnlineRoute(pathname);

  if (loading) return null;

  return (
    <div className="inline-flex items-center rounded-full border border-slate-200 bg-white p-1 shadow-sm">
      {canSeeCampus && (
        <Link
          href="/admin"
          className={cn(
            "rounded-full px-4 py-2 text-sm font-semibold transition",
            campusActive
              ? "bg-slate-900 text-white shadow"
              : "text-slate-600 hover:text-slate-900"
          )}
        >
          Campus
        </Link>
      )}
      {canSeeOnline && (
        <Link
          href="/admin/online"
          className={cn(
            "rounded-full px-4 py-2 text-sm font-semibold transition",
            onlineActive
              ? "bg-slate-900 text-white shadow"
              : "text-slate-600 hover:text-slate-900"
          )}
        >
          Online
        </Link>
      )}
    </div>
  );
}
