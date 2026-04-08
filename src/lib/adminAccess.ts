export type AdminPagePermission = {
  key: string;
  label: string;
  path: string;
  exact?: boolean;
};

export const ADMIN_PAGE_PERMISSIONS: AdminPagePermission[] = [
  { key: "admin:dashboard", label: "Dashboard", path: "/admin", exact: true },
  {
    key: "admin:online-reports",
    label: "Online Hafazan Reports",
    path: "/admin/online/reports",
  },
  {
    key: "admin:online",
    label: "Online Dashboard",
    path: "/admin/online",
    exact: true,
  },
  { key: "admin:crm", label: "CRM", path: "/admin/crm" },
  { key: "admin:reports", label: "Reports", path: "/admin/reports" },
  { key: "admin:payments", label: "Payments", path: "/admin/payments" },
  { key: "admin:attendance", label: "Attendance", path: "/admin/attendance" },
  { key: "admin:exam", label: "Exams", path: "/admin/exam" },
  { key: "admin:certificates", label: "Certificates", path: "/admin/certificates" },
  { key: "admin:historical", label: "Historical Entry", path: "/admin/historical" },
  { key: "admin:users", label: "User Roles", path: "/admin/users" },
  { key: "admin:leave", label: "Leave Management", path: "/admin/leave" },
  { key: "admin:payroll", label: "Payroll", path: "/admin/payroll" },
];

export const ADMIN_PERMISSION_KEYS = ADMIN_PAGE_PERMISSIONS.map((item) => item.key);

const ADMIN_PERMISSION_FALLBACKS: Record<string, string[]> = {
  "admin:online-reports": ["admin:online"],
};

export function getRequiredAdminPermission(pathname: string): string | null {
  if (pathname === "/admin") return "admin:dashboard";
  if (pathname.startsWith("/admin/online/reports")) return "admin:online-reports";
  if (pathname === "/admin/online") return "admin:online";
  if (pathname.startsWith("/admin/online/")) return "admin:online";
  if (pathname.startsWith("/admin/juz-test-schedule")) return "admin:reports";

  const match = ADMIN_PAGE_PERMISSIONS.find(
    (item) => !item.exact && pathname.startsWith(item.path)
  );

  return match?.key ?? null;
}

export function hasAdminPermission(
  permissionKey: string | null,
  permissions: Set<string>
): boolean {
  if (!permissionKey) return false;
  if (permissions.has(permissionKey)) return true;
  return (ADMIN_PERMISSION_FALLBACKS[permissionKey] ?? []).some((key) =>
    permissions.has(key)
  );
}
