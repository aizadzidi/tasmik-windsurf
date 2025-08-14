"use client";
import React from "react";
import AdminNavbar from "@/components/admin/AdminNavbar";
import BulkHistoricalEntry from "@/components/admin/BulkHistoricalEntry";

export default function HistoricalEntryPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-[#f8fafc] via-[#e2e8f0] to-[#f1f5f9]">
      <AdminNavbar />
      <div className="relative p-4 sm:p-6">
        <header className="mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">Historical Records Entry</h1>
            <p className="text-gray-600">Add historical Juz test records for students who have already completed tests.</p>
          </div>
        </header>

        <BulkHistoricalEntry />
      </div>
    </div>
  );
}