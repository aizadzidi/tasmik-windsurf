"use client";
import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import ParentReportTable from "./ParentReportTable";
import SignOutButton from "@/components/SignOutButton";

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
    <main className="min-h-screen bg-gradient-to-tr from-blue-100 via-blue-200 to-blue-100 py-8 px-2">
      <div className="max-w-3xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold text-gray-800">Parent Dashboard</h1>
          <SignOutButton />
        </div>
        {loading ? (
          <div>Loading...</div>
        ) : parentId ? (
          <ParentReportTable parentId={parentId} />
        ) : (
          <div>Could not load user information.</div>
        )}
      </div>
    </main>
  );
}
