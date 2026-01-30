"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function TeacherLayout({ children }: { children: React.ReactNode }) {
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
      setReady(true);
    };

    checkSession();

    return () => {
      isMounted = false;
    };
  }, [router]);

  if (!ready) return null;

  return children;
}
