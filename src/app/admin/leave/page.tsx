"use client";
import React from "react";
import AdminNavbar from "@/components/admin/AdminNavbar";
import AdminLeaveManagement from "@/components/admin/AdminLeaveManagement";

export default function AdminLeavePage() {
  return (
    <div className="min-h-screen bg-[#F2F2F7]">
      <AdminNavbar />
      <AdminLeaveManagement />
    </div>
  );
}
