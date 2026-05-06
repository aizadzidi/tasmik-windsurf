export const isGlobalAdminRole = (role: string | null | undefined): boolean =>
  role === "admin";

export const isTenantAdminRole = (role: string | null | undefined): boolean =>
  role === "school_admin" || role === "admin";
