import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export type AdminPermissionState = {
  loading: boolean;
  isAdmin: boolean;
  role: "admin" | "teacher" | "parent" | null;
  permissions: Set<string>;
};

export function useAdminPermissions(): AdminPermissionState {
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [role, setRole] = useState<AdminPermissionState["role"]>(null);
  const [permissions, setPermissions] = useState<Set<string>>(new Set());

  useEffect(() => {
    let isMounted = true;

    const loadPermissions = async () => {
      const { data: authData } = await supabase.auth.getUser();
      const userId = authData.user?.id;
      if (!userId) {
        if (isMounted) {
          setLoading(false);
          setIsAdmin(false);
          setRole(null);
          setPermissions(new Set());
        }
        return;
      }

      const [userRes, permRes] = await Promise.all([
        supabase.from("users").select("role").eq("id", userId).maybeSingle(),
        supabase.from("user_permissions").select("permission_key").eq("user_id", userId),
      ]);

      if (!isMounted) return;

      if (userRes.error) {
        setIsAdmin(false);
        setRole(null);
      } else {
        const nextRole = (userRes.data?.role as AdminPermissionState["role"]) ?? null;
        setRole(nextRole);
        setIsAdmin(nextRole === "admin");
      }

      if (permRes.error) {
        setPermissions(new Set());
      } else {
        setPermissions(new Set((permRes.data ?? []).map((row) => row.permission_key)));
      }

      setLoading(false);
    };

    loadPermissions();

    return () => {
      isMounted = false;
    };
  }, []);

  return useMemo(
    () => ({ loading, isAdmin, role, permissions }),
    [loading, isAdmin, role, permissions]
  );
}
