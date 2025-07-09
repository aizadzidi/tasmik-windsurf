"use client";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function SignOutButton() {
  const router = useRouter();
  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/login");
  }
  return (
    <button
      onClick={handleSignOut}
      className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700 mt-4"
    >
      Sign Out
    </button>
  );
}
