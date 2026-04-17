"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { useProgramScope } from "@/hooks/useProgramScope";
import { TeachingModeProvider } from "@/contexts/TeachingModeContext";
import TeacherScopeSwitch from "@/components/teacher/TeacherScopeSwitch";
import Navbar from "@/components/Navbar";

export default function TeacherLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  const { programScope, loading: programScopeLoading } = useProgramScope({ role: "teacher", userId });

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
      setUserId(userData.user.id);
      setReady(true);
    };

    checkSession();

    return () => {
      isMounted = false;
    };
  }, [router]);

  useEffect(() => {
    if (!ready || programScopeLoading) return;
    const routes = ["/teacher", "/teacher/attendance", "/teacher/lesson", "/teacher/exam"];
    if (programScope !== "campus" && programScope !== "unknown") {
      routes.push("/teacher/online-attendance");
    }
    routes.forEach((route) => {
      router.prefetch(route);
    });
  }, [programScope, programScopeLoading, ready, router]);

  if (!ready || programScopeLoading) return <div className="min-h-screen bg-[#F2F2F7]" />;

  if (programScope === "unknown") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F2F2F7] px-4">
        <div className="w-full max-w-md rounded-3xl border border-amber-200 bg-white p-8 text-center shadow-sm">
          <h1 className="text-xl font-semibold text-slate-900">Account setup incomplete</h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            Your teacher account is still missing a program assignment. Please contact your
            admin before using the teacher dashboard.
          </p>
        </div>
      </div>
    );
  }

  return (
    <TeachingModeProvider programScope={programScope}>
      <div className="min-h-screen bg-[#F2F2F7]">
        <TeacherScopeSwitch />
        <Navbar programScope={programScope} />
        {children}
      </div>
    </TeachingModeProvider>
  );
}
