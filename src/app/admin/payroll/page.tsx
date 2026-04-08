"use client";
import React from "react";
import AdminNavbar from "@/components/admin/AdminNavbar";
import AdminPayrollManagement from "@/components/admin/AdminPayrollManagement";

export default function AdminPayrollPage() {
  return (
    <div className="min-h-screen bg-[#F2F2F7]">
      <AdminNavbar />
      <AdminPayrollManagement />
    </div>
  );
}
