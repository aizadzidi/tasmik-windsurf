"use client";
import React, { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

export default function StaffDashboardPage() {
  const [userName, setUserName] = useState<string | null>(null);

  useEffect(() => {
    const fetchName = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from("users")
        .select("name")
        .eq("id", user.id)
        .maybeSingle();
      setUserName(data?.name ?? null);
    };
    fetchName();
  }, []);

  return (
    <div className="max-w-3xl mx-auto px-4 pt-24 pb-12">
      <h1 className="text-2xl font-bold text-slate-900 mb-2">
        {userName ? `Welcome, ${userName}` : "Staff Dashboard"}
      </h1>
      <p className="text-slate-500 text-sm mb-8">
        Manage your leave and view your payslips.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Link href="/staff/leave" className="group">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm hover:shadow-md hover:border-blue-300 transition-all">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
                <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2" strokeWidth={2} />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 2v4M8 2v4M3 10h18" />
                </svg>
              </div>
              <h2 className="text-lg font-semibold text-slate-900 group-hover:text-blue-600 transition-colors">
                Leave
              </h2>
            </div>
            <p className="text-sm text-slate-500">
              View your leave balance, apply for leave, and track your leave history.
            </p>
          </div>
        </Link>

        <Link href="/staff/payroll" className="group">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm hover:shadow-md hover:border-emerald-300 transition-all">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center">
                <svg className="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v2m0 8v2" />
                  <circle cx="12" cy="12" r="10" strokeWidth={2} />
                </svg>
              </div>
              <h2 className="text-lg font-semibold text-slate-900 group-hover:text-emerald-600 transition-colors">
                Payslips
              </h2>
            </div>
            <p className="text-sm text-slate-500">
              View and download your monthly payslips.
            </p>
          </div>
        </Link>
      </div>
    </div>
  );
}
