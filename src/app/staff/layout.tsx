"use client";
import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import Navbar from "@/components/Navbar";

export default function StaffLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);

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

      // Verify user role is general_worker
      const { data: userRow } = await supabase
        .from("users")
        .select("role")
        .eq("id", userData.user.id)
        .maybeSingle();

      if (!isMounted) return;
      if (userRow?.role !== "general_worker") {
        // Redirect non-staff users to their proper dashboard
        if (userRow?.role === "admin") router.replace("/admin");
        else if (userRow?.role === "teacher") router.replace("/teacher");
        else router.replace("/parent");
        return;
      }

      setReady(true);
    };

    checkSession();
    return () => { isMounted = false; };
  }, [router]);

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-600/10 to-sky-600/10">
        <div className="animate-pulse text-slate-400 text-sm">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F2F2F7]">
      <Navbar />
      {children}
    </div>
  );
}
