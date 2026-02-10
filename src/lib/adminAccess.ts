export type AdminPagePermission = {
  key: string;
  label: string;
  path: string;
  exact?: boolean;
};

export const ADMIN_PAGE_PERMISSIONS: AdminPagePermission[] = [
  { key: "admin:dashboard", label: "Dashboard", path: "/admin", exact: true },
  { key: "admin:online", label: "Online", path: "/admin/online" },
  { key: "admin:crm", label: "CRM", path: "/admin/crm" },
  { key: "admin:reports", label: "Reports", path: "/admin/reports" },
  { key: "admin:payments", label: "Payments", path: "/admin/payments" },
  { key: "admin:attendance", label: "Attendance", path: "/admin/attendance" },
  { key: "admin:exam", label: "Exams", path: "/admin/exam" },
  { key: "admin:certificates", label: "Certificates", path: "/admin/certificates" },
  { key: "admin:historical", label: "Historical Entry", path: "/admin/historical" },
  { key: "admin:users", label: "User Roles", path: "/admin/users" },
];

export const ADMIN_PERMISSION_KEYS = ADMIN_PAGE_PERMISSIONS.map((item) => item.key);

export function getRequiredAdminPermission(pathname: string): string | null {
  if (pathname === "/admin") return "admin:dashboard";
  if (pathname.startsWith("/admin/juz-test-schedule")) return "admin:reports";

  const match = ADMIN_PAGE_PERMISSIONS.find(
    (item) => !item.exact && pathname.startsWith(item.path)
  );

  return match?.key ?? null;
}
