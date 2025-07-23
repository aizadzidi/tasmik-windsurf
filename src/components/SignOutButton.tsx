"use client";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

import { cn } from "@/lib/utils";

export default function SignOutButton({ className }: { className?: string }) {
  const router = useRouter();
  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/login");
  }
  return (
    <button
      onClick={handleSignOut}
      className={cn(
        "group relative flex items-center justify-center px-4 py-2 rounded-xl bg-white/20 backdrop-blur-sm shadow-lg border border-white/30 text-gray-800 font-semibold hover:bg-white/40 hover:scale-105 active:scale-95 transition-all duration-200 ease-in-out",
        className
      )}
    >
      <span className="mr-2">Sign Out</span>
      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-700 group-hover:text-gray-900 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
        <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
      </svg>
    </button>
  );
}
