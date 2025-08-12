"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import SignOutButton from "@/components/SignOutButton";

export default function Navbar() {
  const pathname = usePathname();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <nav
      className="sticky top-0 left-0 w-full z-30 backdrop-blur-lg bg-white/10 border-b border-white/20 shadow-lg"
      style={{
        background:
          "linear-gradient(90deg, rgba(255,255,255,0.12) 0%, rgba(200,225,255,0.25) 100%)",
        boxShadow:
          "0 4px 24px 0 rgba(31, 38, 135, 0.18), 0 1.5px 6px 0 rgba(0,0,0,0.05)",
        borderRadius: "0 0 1.5rem 1.5rem",
      }}
    >
      {/* Desktop and Mobile Container */}
      <div className="px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo/Brand */}
          <div className="flex items-center">
            <span className="text-lg sm:text-xl lg:text-2xl font-extrabold text-blue-900 drop-shadow-lg tracking-tight select-none" style={{letterSpacing:'-0.01em'}}>
              <span className="hidden sm:inline">Teacher Dashboard</span>
              <span className="sm:hidden">Dashboard</span>
            </span>
          </div>

          {/* Desktop Navigation */}
          <div className="hidden md:block">
            <div className="flex items-center gap-2 lg:gap-4">
              <Link
                href="/teacher"
                aria-label="Tasmik Home"
                className={`transition-all px-3 lg:px-4 py-2 rounded-xl font-medium text-sm lg:text-base focus:outline-none focus:ring-2 focus:ring-blue-300 hover:scale-105 ${
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
                className={`transition-all px-3 lg:px-4 py-2 rounded-xl font-medium text-sm lg:text-base focus:outline-none focus:ring-2 focus:ring-blue-300 hover:scale-105 ${
                  pathname === "/teacher/exam"
                    ? "bg-white/30 text-blue-900 shadow-md"
                    : "bg-white/10 text-white hover:bg-white/20"
                }`}
              >
                <span className="hidden lg:inline">Exam Reports</span>
                <span className="lg:hidden">Exams</span>
              </Link>
              <div className="ml-2 lg:ml-4">
                <SignOutButton className="transition-all px-3 lg:px-4 py-2 rounded-xl font-semibold text-sm lg:text-base bg-white/20 text-blue-900 shadow hover:bg-blue-100 hover:text-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-300 hover:scale-105 border border-blue-200/50" />
              </div>
            </div>
          </div>

          {/* Mobile menu button */}
          <div className="md:hidden">
            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="inline-flex items-center justify-center p-2 rounded-xl text-white hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-blue-300"
              aria-expanded="false"
            >
              <span className="sr-only">Open main menu</span>
              {!isMenuOpen ? (
                <svg className="block h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              ) : (
                <svg className="block h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Navigation Menu */}
      {isMenuOpen && (
        <div className="md:hidden">
          <div className="px-2 pt-2 pb-3 space-y-1 bg-white/10 backdrop-blur-sm border-t border-white/20">
            <Link
              href="/teacher"
              aria-label="Tasmik Home"
              className={`block px-3 py-2 rounded-xl font-medium text-base transition-colors ${
                pathname === "/teacher"
                  ? "bg-white/30 text-blue-900 shadow-md"
                  : "bg-white/10 text-white hover:bg-white/20"
              }`}
              onClick={() => setIsMenuOpen(false)}
            >
              Tasmik
            </Link>
            <Link
              href="/teacher/exam"
              aria-label="Exam Reports"
              className={`block px-3 py-2 rounded-xl font-medium text-base transition-colors ${
                pathname === "/teacher/exam"
                  ? "bg-white/30 text-blue-900 shadow-md"
                  : "bg-white/10 text-white hover:bg-white/20"
              }`}
              onClick={() => setIsMenuOpen(false)}
            >
              Exam Reports
            </Link>
            <div className="mt-3 pt-3 border-t border-white/30">
              <SignOutButton className="w-full text-left px-3 py-2 rounded-xl font-semibold text-base bg-white/20 text-blue-900 shadow hover:bg-blue-100 hover:text-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-300 border border-blue-200/50" />
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}
