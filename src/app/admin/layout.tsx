"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { useAdminPermissions } from "@/hooks/useAdminPermissions";
import { getRequiredAdminPermission } from "@/lib/adminAccess";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [ready, setReady] = useState(false);
  const [authorized, setAuthorized] = useState(false);
  const { loading: permissionsLoading, isAdmin, permissions } = useAdminPermissions();

  useEffect(() => {
    let isMounted = true;

    const checkSession = async () => {
      const { data } = await supabase.auth.getSession();
      if (!isMounted) return;
      if (!data.session) {
        router.replace("/login");
        return;
      }
      const { data: userData } = await supabase.auth.getUser();
      if (!isMounted) return;
      if (!userData.user?.email_confirmed_at) {
        await supabase.auth.signOut();
        router.replace("/login");
        return;
      }
      setReady(true);
    };

    checkSession();

    return () => {
      isMounted = false;
    };
  }, [router]);

  const requiredPermission = useMemo(
    () => getRequiredAdminPermission(pathname),
    [pathname]
  );

  useEffect(() => {
    if (!ready || permissionsLoading) return;

    const hasAccess =
      isAdmin || (requiredPermission ? permissions.has(requiredPermission) : false);

    if (!hasAccess) {
      setAuthorized(false);
      router.replace("/teacher");
      return;
    }

    setAuthorized(true);
  }, [ready, permissionsLoading, isAdmin, permissions, requiredPermission, router]);

  if (!ready || permissionsLoading) return null;

  if (!authorized) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-slate-50 px-6">
        <div className="max-w-md rounded-2xl bg-white p-6 text-center shadow">
          <h1 className="text-xl font-semibold text-slate-900">Access denied</h1>
          <p className="mt-2 text-sm text-slate-600">
            You do not have permission to view this admin page.
          </p>
        </div>
      </main>
    );
  }

  return children;
}
