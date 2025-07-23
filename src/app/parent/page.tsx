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
    <main className="relative min-h-screen bg-gradient-to-br from-[#b1c7f9] via-[#e0e7ff] to-[#b1f9e6] animate-gradient-move p-4 overflow-hidden">
      {/* Gradient Blobs */}
      <div className="absolute -top-40 -left-40 w-[500px] h-[500px] bg-gradient-to-tr from-blue-300 via-purple-200 to-blue-100 rounded-full opacity-40 blur-3xl animate-pulse-slow" />
      <div className="absolute -bottom-32 right-0 w-[400px] h-[400px] bg-gradient-to-br from-blue-200 via-blue-100 to-purple-200 rounded-full opacity-30 blur-2xl animate-pulse-slow" />
      
      <div className="relative z-10 max-w-5xl mx-auto">
        {/* Header Section */}
        <div className="relative z-10 bg-white/30 backdrop-blur-xl border border-white/40 rounded-3xl shadow-2xl p-6 mb-6">
          <div className="flex justify-between items-center">
            <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Parent Dashboard</h1>
            <SignOutButton />
          </div>
        </div>
        
        {/* Content Section */}
        <div className="relative z-10 bg-white/30 backdrop-blur-xl border border-white/40 rounded-3xl shadow-2xl p-6">
          {loading ? (
            <div className="text-center py-8">
              <div className="inline-flex items-center px-4 py-2 font-semibold leading-6 text-sm shadow rounded-md text-blue-600 bg-white/50 transition ease-in-out duration-150">
                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Loading...
              </div>
            </div>
          ) : parentId ? (
            <ParentReportTable parentId={parentId} />
          ) : (
            <div className="text-center py-8 text-gray-600">
              <p>Could not load user information.</p>
            </div>
          )}
        </div>
      </div>
      
      {/* Tailwind custom animation */}
      <style jsx global>{`
        @keyframes gradient-move {
          0%, 100% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
        }
        .animate-gradient-move {
          background-size: 200% 200%;
          animation: gradient-move 10s ease-in-out infinite;
        }
        .animate-pulse-slow {
          animation: pulse 8s cubic-bezier(0.4, 0, 0.6, 1) infinite;
        }
      `}</style>
    </main>
  );
}
