"use client";
import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import ParentReportTable from "./ParentReportTable";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

export default function ParentPage() {
  const [parentId, setParentId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function getUser() {
      setLoading(true);
      const { data, error } = await supabase.auth.getUser();
      if (data?.user) setParentId(data.user.id);
      setLoading(false);
    }
    getUser();
  }, []);

  return (
    <main className="p-8">
      <h1 className="text-2xl font-bold mb-4">Parent Dashboard</h1>
      {loading ? (
        <div>Loading...</div>
      ) : parentId ? (
        <ParentReportTable parentId={parentId} />
      ) : (
        <div>Could not load user information.</div>
      )}
    </main>
  );
}
