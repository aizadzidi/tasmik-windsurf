"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

import SignOutButton from "@/components/SignOutButton";

export default function Navbar() {
  const pathname = usePathname();
  return (
    <nav
      className="fixed top-0 left-0 w-full z-30 backdrop-blur-lg bg-white/10 border-b border-white/20 shadow-lg py-5 px-8 flex items-center justify-between"
      style={{
        background:
          "linear-gradient(90deg, rgba(255,255,255,0.12) 0%, rgba(200,225,255,0.25) 100%)",
        boxShadow:
          "0 4px 24px 0 rgba(31, 38, 135, 0.18), 0 1.5px 6px 0 rgba(0,0,0,0.05)",
        borderRadius: "0 0 1.5rem 1.5rem",
      }}
    >
      <div className="flex items-center gap-4">
        <span className="text-2xl font-extrabold text-blue-900 drop-shadow-lg tracking-tight select-none" style={{letterSpacing:'-0.01em'}}>
          Teacher Dashboard
        </span>
      </div>
      <div className="flex items-center gap-4">
        <Link
          href="/teacher"
          aria-label="Tasmik Home"
          className={`transition-all px-4 py-2 rounded-xl font-medium text-base focus:outline-none focus:ring-2 focus:ring-blue-300 hover:scale-105 ${
            pathname === "/teacher"
              ? "bg-white/30 text-blue-900 shadow-md"
              : "bg-white/10 text-white hover:bg-white/20"
          }`}
        >
          Tasmik
        </Link>
        <Link
          href="/teacher/exam"
          aria-label="Exam Reports"
          className={`transition-all px-4 py-2 rounded-xl font-medium text-base focus:outline-none focus:ring-2 focus:ring-blue-300 hover:scale-105 ${
            pathname === "/teacher/exam"
              ? "bg-white/30 text-blue-900 shadow-md"
              : "bg-white/10 text-white hover:bg-white/20"
          }`}
        >
          Exam Reports
        </Link>
        <div className="ml-4">
          <SignOutButton className="transition-all px-4 py-2 rounded-xl font-semibold text-base bg-white/20 text-blue-900 shadow hover:bg-blue-100 hover:text-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-300 hover:scale-105 border border-blue-200/50" />
        </div>
      </div>
    </nav>
  );
}
