"use client";

import React, { useEffect, useMemo, useState } from "react";
import Navbar from "@/components/Navbar";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { authFetch } from "@/lib/authFetch";
import { supabase } from "@/lib/supabaseClient";
import { useProgramScope } from "@/hooks/useProgramScope";

type StudentRow = {
  id: string;
  name: string | null;
};

type CourseRow = {
  id: string;
  name: string;
  description: string | null;
  monthly_fee_cents: number | null;
  sessions_per_week: number | null;
};

type SlotRow = {
  slot_template_id: string;
  course_id: string;
  course_name: string;
  session_date: string;
  start_time: string;
  duration_minutes: number;
  available_teachers: number;
  is_available: boolean;
  claim_id: string | null;
  claim_status: string | null;
  seat_hold_expires_at: string | null;
  claimed_by_self: boolean;
};

type ClaimRow = {
  id: string;
  slot_template_id: string;
  session_date: string;
  status: string;
  seat_hold_expires_at: string | null;
  student_id: string;
  parent_id: string;
};

type ExplorePayload = {
  setup_required?: boolean;
  students?: StudentRow[];
  courses?: CourseRow[];
  slots?: SlotRow[];
  claims?: ClaimRow[];
};

const formatMoney = (value: number | null | undefined) =>
  typeof value === "number" ? `RM ${(value / 100).toFixed(2)}` : "RM 0.00";

const dateLabel = (value: string) =>
  new Date(`${value}T00:00:00`).toLocaleDateString("en-MY", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

const timeLabel = (value: string) => value.slice(0, 5);

const expiresInLabel = (value: string | null) => {
  if (!value) return "No hold";
  const ms = new Date(value).getTime() - Date.now();
  if (ms <= 0) return "Expired";
  const mins = Math.ceil(ms / 60000);
  return `${mins} min left`;
};

export default function ParentOnlinePage() {
  const [parentId, setParentId] = useState<string | null>(null);
  const { programScope } = useProgramScope({ role: "parent", userId: parentId });
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [courses, setCourses] = useState<CourseRow[]>([]);
  const [slots, setSlots] = useState<SlotRow[]>([]);
  const [claims, setClaims] = useState<ClaimRow[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [selectedCourseId, setSelectedCourseId] = useState("");
  const [loading, setLoading] = useState(true);
  const [setupRequired, setSetupRequired] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busySlotKey, setBusySlotKey] = useState<string | null>(null);
  const [busyClaimId, setBusyClaimId] = useState<string | null>(null);

  const loadExplore = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await authFetch("/api/parent/online/explore");
      const data = (await response.json()) as ExplorePayload & { error?: string };
      if (!response.ok) {
        throw new Error(data.error || "Failed to fetch online explore data");
      }

      const nextStudents = Array.isArray(data.students) ? data.students : [];
      const nextCourses = Array.isArray(data.courses) ? data.courses : [];
      const nextSlots = Array.isArray(data.slots) ? data.slots : [];
      const nextClaims = Array.isArray(data.claims) ? data.claims : [];

      setSetupRequired(Boolean(data.setup_required));
      setStudents(nextStudents);
      setCourses(nextCourses);
      setSlots(nextSlots);
      setClaims(nextClaims);
      setSelectedStudentId((current) => {
        if (current && nextStudents.some((student) => student.id === current)) return current;
        return nextStudents[0]?.id ?? "";
      });
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let mounted = true;
    const loadUser = async () => {
      const { data, error: userError } = await supabase.auth.getUser();
      if (!mounted) return;
      if (userError || !data.user) {
        window.location.href = "/login";
        return;
      }
      setParentId(data.user.id);
    };
    loadUser();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!parentId) return;
    loadExplore();
  }, [parentId]);

  const filteredSlots = useMemo(() => {
    return slots.filter((slot) => {
      if (selectedCourseId && slot.course_id !== selectedCourseId) return false;
      return true;
    });
  }, [selectedCourseId, slots]);

  const pendingClaims = useMemo(
    () => claims.filter((claim) => claim.status === "pending_payment"),
    [claims]
  );
  const activeClaims = useMemo(() => claims.filter((claim) => claim.status === "active"), [claims]);

  const handleClaim = async (slot: SlotRow) => {
    if (!selectedStudentId) {
      setError("Select a student before claiming a slot.");
      return;
    }

    const key = `${slot.slot_template_id}:${slot.session_date}`;
    setBusySlotKey(key);
    setError(null);
    try {
      const response = await authFetch("/api/parent/online/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          student_id: selectedStudentId,
          slot_template_id: slot.slot_template_id,
          session_date: slot.session_date,
        }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(data.error || "Failed to claim slot");
      }
      await loadExplore();
    } catch (claimError) {
      setError(claimError instanceof Error ? claimError.message : "Failed to claim slot");
    } finally {
      setBusySlotKey(null);
    }
  };

  const handlePay = async (claimId: string) => {
    setBusyClaimId(claimId);
    setError(null);
    try {
      const response = await authFetch("/api/parent/online/pay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          claim_id: claimId,
          payment_reference: `manual-${Date.now()}`,
        }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(data.error || "Payment confirmation failed");
      }
      await loadExplore();
    } catch (payError) {
      setError(payError instanceof Error ? payError.message : "Failed to confirm payment");
    } finally {
      setBusyClaimId(null);
    }
  };

  const handleRelease = async (claimId: string) => {
    setBusyClaimId(claimId);
    setError(null);
    try {
      const response = await authFetch("/api/parent/online/claim", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ claim_id: claimId }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(data.error || "Failed to release hold");
      }
      await loadExplore();
    } catch (releaseError) {
      setError(releaseError instanceof Error ? releaseError.message : "Failed to release hold");
    } finally {
      setBusyClaimId(null);
    }
  };

  if (programScope === "campus") {
    return (
      <div className="min-h-screen bg-slate-50">
        <Navbar programScope={programScope} />
        <main className="mx-auto max-w-4xl p-6">
          <Card className="p-6">
            <h1 className="text-xl font-semibold text-slate-900">Online Explore Unavailable</h1>
            <p className="mt-2 text-sm text-slate-600">
              This parent account is currently scoped to campus programs only.
            </p>
          </Card>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#f8fafc] via-[#eef2ff] to-[#f1f5f9]">
      <Navbar programScope={programScope} />
      <main className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
        <header className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <h1 className="text-2xl font-bold text-slate-900">Online Explore & Enroll</h1>
          <p className="mt-1 text-sm text-slate-600">
            Choose a 30-minute slot, hold the seat for 30 minutes, then complete payment.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <select
              value={selectedStudentId}
              onChange={(event) => setSelectedStudentId(event.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
            >
              {students.map((student) => (
                <option key={student.id} value={student.id}>
                  {student.name ?? "Unnamed student"}
                </option>
              ))}
            </select>
            <select
              value={selectedCourseId}
              onChange={(event) => setSelectedCourseId(event.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
            >
              <option value="">All Courses</option>
              {courses.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.name}
                </option>
              ))}
            </select>
          </div>
        </header>

        {error && (
          <Card className="border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
            {error}
          </Card>
        )}

        {setupRequired && (
          <Card className="border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            Online slots are not configured yet. Please contact the admin team.
          </Card>
        )}

        <section className="grid gap-6 lg:grid-cols-2">
          <Card className="p-5">
            <h2 className="text-lg font-semibold text-slate-900">Pending Payment</h2>
            <p className="text-sm text-slate-600">Hold expires in 30 minutes unless paid.</p>
            <div className="mt-4 space-y-3">
              {pendingClaims.length === 0 ? (
                <p className="text-sm text-slate-500">No pending holds.</p>
              ) : (
                pendingClaims.map((claim) => (
                  <div key={claim.id} className="rounded-xl border border-slate-200 bg-white p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{dateLabel(claim.session_date)}</p>
                        <p className="text-xs text-slate-500">{expiresInLabel(claim.seat_hold_expires_at)}</p>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          className="h-8 rounded-lg bg-emerald-600 px-3 text-xs text-white hover:bg-emerald-700"
                          disabled={busyClaimId === claim.id}
                          onClick={() => handlePay(claim.id)}
                        >
                          Pay Now
                        </Button>
                        <Button
                          type="button"
                          className="h-8 rounded-lg bg-slate-100 px-3 text-xs text-slate-700 hover:bg-slate-200"
                          disabled={busyClaimId === claim.id}
                          onClick={() => handleRelease(claim.id)}
                        >
                          Release
                        </Button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>

          <Card className="p-5">
            <h2 className="text-lg font-semibold text-slate-900">Active Enrollment Slots</h2>
            <p className="text-sm text-slate-600">Confirmed slots with completed payment.</p>
            <div className="mt-4 space-y-3">
              {activeClaims.length === 0 ? (
                <p className="text-sm text-slate-500">No active online slots yet.</p>
              ) : (
                activeClaims.map((claim) => (
                  <div key={claim.id} className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                    <p className="text-sm font-semibold text-emerald-800">{dateLabel(claim.session_date)}</p>
                    <p className="text-xs text-emerald-700">Status: active</p>
                  </div>
                ))
              )}
            </div>
          </Card>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-semibold text-slate-900">Available Slots</h2>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {loading ? (
              <Card className="p-4 text-sm text-slate-500">Loading slots...</Card>
            ) : filteredSlots.length === 0 ? (
              <Card className="p-4 text-sm text-slate-500">No slots found.</Card>
            ) : (
              filteredSlots.map((slot) => {
                const slotKey = `${slot.slot_template_id}:${slot.session_date}`;
                const isBusy = busySlotKey === slotKey;
                return (
                  <Card key={slotKey} className="p-4">
                    <p className="text-sm font-semibold text-slate-900">{slot.course_name}</p>
                    <p className="text-xs text-slate-500">
                      {dateLabel(slot.session_date)} • {timeLabel(slot.start_time)} • {slot.duration_minutes} min
                    </p>
                    <p className="mt-2 text-xs text-slate-500">
                      Teachers available: {slot.available_teachers}
                    </p>
                    <div className="mt-3 flex items-center justify-between">
                      <span
                        className={`rounded-full px-2 py-1 text-xs font-semibold ${
                          slot.is_available
                            ? "bg-emerald-100 text-emerald-700"
                            : slot.claimed_by_self
                              ? "bg-blue-100 text-blue-700"
                              : "bg-rose-100 text-rose-700"
                        }`}
                      >
                        {slot.is_available ? "Available" : slot.claimed_by_self ? "Held by You" : "Taken"}
                      </span>
                      <Button
                        type="button"
                        className="h-8 rounded-lg bg-slate-900 px-3 text-xs text-white hover:bg-slate-800 disabled:opacity-50"
                        disabled={!slot.is_available || isBusy || setupRequired}
                        onClick={() => handleClaim(slot)}
                      >
                        {isBusy ? "Claiming..." : "Claim Slot"}
                      </Button>
                    </div>
                  </Card>
                );
              })
            )}
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2">
          {courses.map((course) => (
            <Card key={course.id} className="p-4">
              <p className="text-base font-semibold text-slate-900">{course.name}</p>
              <p className="text-sm text-slate-600">{course.description || "No description provided."}</p>
              <p className="mt-2 text-xs text-slate-500">
                {course.sessions_per_week ?? 0} sessions/week • {formatMoney(course.monthly_fee_cents)}
              </p>
            </Card>
          ))}
        </section>
      </main>
    </div>
  );
}
