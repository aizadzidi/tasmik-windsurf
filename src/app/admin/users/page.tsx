"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AdminNavbar from "@/components/admin/AdminNavbar";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Switch } from "@/components/ui/Switch";
import { ADMIN_PAGE_PERMISSIONS } from "@/lib/adminAccess";
import { authFetch } from "@/lib/authFetch";

type UserRow = {
  id: string;
  name: string | null;
  email: string | null;
  role: "admin" | "teacher" | "parent";
};

type ProgramRow = {
  id: string;
  name: string;
  type: "campus" | "online" | "hybrid";
};

type AssignmentValue = "campus" | "online" | "both" | "unassigned";

const ROLE_OPTIONS: UserRow["role"][] = ["admin", "teacher", "parent"];

export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [programs, setPrograms] = useState<ProgramRow[]>([]);
  const [assignmentsByTeacher, setAssignmentsByTeacher] = useState<Record<string, AssignmentValue>>({});
  const [adminPagePermissions, setAdminPagePermissions] = useState<Record<string, Record<string, boolean>>>({});
  const [expandedAdminAccess, setExpandedAdminAccess] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [assignmentSavingId, setAssignmentSavingId] = useState<string | null>(null);
  const [permissionSaving, setPermissionSaving] = useState<Record<string, boolean>>({});
  const [error, setError] = useState("");
  const [assignmentError, setAssignmentError] = useState("");
  const [permissionError, setPermissionError] = useState("");
  const [query, setQuery] = useState("");
  const updateControllers = useRef<Map<string, AbortController>>(new Map());
  const updateRequestIds = useRef<Map<string, number>>(new Map());
  const assignmentControllers = useRef<Map<string, AbortController>>(new Map());
  const assignmentRequestIds = useRef<Map<string, number>>(new Map());

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError("");
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    try {
      const res = await authFetch("/api/admin/users", {
        signal: controller.signal,
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        throw new Error(payload?.error || "Failed to load users");
      }
      const data = await res.json();
      setUsers(Array.isArray(data) ? data : []);
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        setError("Request timed out");
        return;
      }
      const message = err instanceof Error ? err.message : "Failed to load users";
      setError(message);
    } finally {
      clearTimeout(timeoutId);
      setLoading(false);
    }
  }, []);

  const fetchPrograms = useCallback(async () => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    setAssignmentError("");
    try {
      const res = await authFetch("/api/admin/programs", { signal: controller.signal });
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        throw new Error(payload?.error || "Failed to load programs");
      }
      const data = await res.json();
      setPrograms(Array.isArray(data) ? data : []);
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      const message = err instanceof Error ? err.message : "Failed to load programs";
      setAssignmentError(message);
    } finally {
      clearTimeout(timeoutId);
    }
  }, []);

  const fetchTeacherAssignments = useCallback(async () => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    setAssignmentError("");
    try {
      const res = await authFetch("/api/admin/teacher-assignments", { signal: controller.signal });
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        throw new Error(payload?.error || "Failed to load teacher assignments");
      }
      const data = await res.json();
      const nextMap: Record<string, AssignmentValue> = {};
      if (Array.isArray(data)) {
        data.forEach((row) => {
          const teacherId = row.teacher_id as string;
          const types = Array.isArray(row.program_types) ? row.program_types : [];
          if (types.includes("campus") && types.includes("online")) {
            nextMap[teacherId] = "both";
          } else if (types.includes("online")) {
            nextMap[teacherId] = "online";
          } else if (types.includes("campus")) {
            nextMap[teacherId] = "campus";
          } else {
            nextMap[teacherId] = "unassigned";
          }
        });
      }
      setAssignmentsByTeacher(nextMap);
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      const message = err instanceof Error ? err.message : "Failed to load teacher assignments";
      setAssignmentError(message);
    } finally {
      clearTimeout(timeoutId);
    }
  }, []);

  const fetchAdminPagePermissions = useCallback(async () => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    setPermissionError("");
    try {
      const res = await authFetch("/api/admin/user-permissions", { signal: controller.signal });
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        throw new Error(payload?.error || "Failed to load permissions");
      }
      const data = await res.json();
      const allowedKeys = new Set(ADMIN_PAGE_PERMISSIONS.map((item) => item.key));
      const nextMap: Record<string, Record<string, boolean>> = {};
      if (Array.isArray(data)) {
        data.forEach((row) => {
          if (!row?.user_id || !row?.permission_key) return;
          if (!allowedKeys.has(String(row.permission_key))) return;
          const userId = String(row.user_id);
          if (!nextMap[userId]) nextMap[userId] = {};
          nextMap[userId][String(row.permission_key)] = true;
        });
      }
      setAdminPagePermissions(nextMap);
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      const message = err instanceof Error ? err.message : "Failed to load permissions";
      setPermissionError(message);
    } finally {
      clearTimeout(timeoutId);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
    fetchPrograms();
    fetchTeacherAssignments();
    fetchAdminPagePermissions();
  }, [fetchAdminPagePermissions, fetchPrograms, fetchTeacherAssignments, fetchUsers]);

  const filteredUsers = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return users;
    return users.filter((u) => {
      const haystack = `${u.name ?? ""} ${u.email ?? ""}`.toLowerCase();
      return haystack.includes(term);
    });
  }, [query, users]);

  const updateRole = async (userId: string, role: UserRow["role"]) => {
    const existingController = updateControllers.current.get(userId);
    if (existingController) {
      existingController.abort();
    }
    const controller = new AbortController();
    updateControllers.current.set(userId, controller);
    const nextRequestId = (updateRequestIds.current.get(userId) ?? 0) + 1;
    updateRequestIds.current.set(userId, nextRequestId);
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    setSavingId(userId);
    setError("");
    try {
      const res = await authFetch("/api/admin/users", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: userId, role }),
        signal: controller.signal,
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        throw new Error(payload?.error || "Failed to update role");
      }
      if (updateRequestIds.current.get(userId) !== nextRequestId) return;
      setUsers((prev) =>
        prev.map((user) => (user.id === userId ? { ...user, role } : user))
      );
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        if (updateRequestIds.current.get(userId) === nextRequestId) {
          setError("Request timed out");
        }
        return;
      }
      if (updateRequestIds.current.get(userId) !== nextRequestId) return;
      const message = err instanceof Error ? err.message : "Failed to update role";
      setError(message);
    } finally {
      clearTimeout(timeoutId);
      if (updateRequestIds.current.get(userId) === nextRequestId) {
        updateControllers.current.delete(userId);
        setSavingId(null);
      }
    }
  };

  const updateTeacherAssignment = async (teacherId: string, value: AssignmentValue) => {
    const existingController = assignmentControllers.current.get(teacherId);
    if (existingController) {
      existingController.abort();
    }
    const controller = new AbortController();
    assignmentControllers.current.set(teacherId, controller);
    const nextRequestId = (assignmentRequestIds.current.get(teacherId) ?? 0) + 1;
    assignmentRequestIds.current.set(teacherId, nextRequestId);
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    setAssignmentSavingId(teacherId);
    setAssignmentError("");

    const programTypes =
      value === "both"
        ? ["campus", "online"]
        : value === "campus"
          ? ["campus"]
          : value === "online"
            ? ["online"]
            : [];

    try {
      const res = await authFetch("/api/admin/teacher-assignments", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teacher_id: teacherId, program_types: programTypes }),
        signal: controller.signal,
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        throw new Error(payload?.error || "Failed to update teacher assignment");
      }
      if (assignmentRequestIds.current.get(teacherId) !== nextRequestId) return;
      setAssignmentsByTeacher((prev) => ({ ...prev, [teacherId]: value }));
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        if (assignmentRequestIds.current.get(teacherId) === nextRequestId) {
          setAssignmentError("Request timed out");
        }
        return;
      }
      if (assignmentRequestIds.current.get(teacherId) !== nextRequestId) return;
      const message = err instanceof Error ? err.message : "Failed to update teacher assignment";
      setAssignmentError(message);
    } finally {
      clearTimeout(timeoutId);
      if (assignmentRequestIds.current.get(teacherId) === nextRequestId) {
        assignmentControllers.current.delete(teacherId);
        setAssignmentSavingId(null);
      }
    }
  };

  const updateAssignmentPermission = async (
    userId: string,
    permissionKey: string,
    enabled: boolean
  ) => {
    const savingKey = `${userId}:${permissionKey}`;
    setPermissionSaving((prev) => ({ ...prev, [savingKey]: true }));
    setPermissionError("");
    try {
      const res = await authFetch("/api/admin/user-permissions", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: userId,
          permission_key: permissionKey,
          enabled,
        }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        throw new Error(payload?.error || "Failed to update permission");
      }
      setAdminPagePermissions((prev) => ({
        ...prev,
        [userId]: {
          ...(prev[userId] ?? {}),
          [permissionKey]: enabled,
        },
      }));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to update permission";
      setPermissionError(message);
    } finally {
      setPermissionSaving((prev) => ({ ...prev, [savingKey]: false }));
    }
  };

  const getEnabledPermissionKeys = useCallback(
    (userId: string) =>
      ADMIN_PAGE_PERMISSIONS
        .filter((permission) => adminPagePermissions[userId]?.[permission.key])
        .map((permission) => permission.key),
    [adminPagePermissions]
  );

  const getEnabledPermissionLabels = useCallback(
    (userId: string) =>
      ADMIN_PAGE_PERMISSIONS
        .filter((permission) => adminPagePermissions[userId]?.[permission.key])
        .map((permission) => permission.label),
    [adminPagePermissions]
  );

  const toggleAdminAccess = async (userId: string, enabled: boolean) => {
    const currentKeys = getEnabledPermissionKeys(userId);
    if (enabled) {
      if (currentKeys.length === 0) {
        await updateAssignmentPermission(userId, "admin:dashboard", true);
      }
      setExpandedAdminAccess((prev) => ({ ...prev, [userId]: true }));
      return;
    }

    for (const key of currentKeys) {
      await updateAssignmentPermission(userId, key, false);
    }
    setExpandedAdminAccess((prev) => ({ ...prev, [userId]: false }));
  };


  return (
    <div className="min-h-screen bg-gray-50">
      <AdminNavbar />
      <main className="mx-auto w-full max-w-7xl px-4 md:px-8 py-10">
        <div className="w-full space-y-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">User Roles</h1>
            <p className="text-sm text-slate-600">
              Assign roles for teachers, parents, and admins.
            </p>
          </div>

          <Card className="p-4">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by name or email"
                aria-label="Search users by name or email"
                className="md:max-w-sm"
              />
              <Button
                variant="secondary"
                onClick={() => fetchUsers()}
                disabled={loading}
              >
                Refresh
              </Button>
            </div>
          </Card>

          {error ? (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {error}
            </div>
          ) : null}
          {assignmentError ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              {assignmentError}
            </div>
          ) : null}
          {permissionError ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              {permissionError}
            </div>
          ) : null}

          <Card className="p-4">
            {loading ? (
              <div className="text-sm text-slate-500">Loading users…</div>
            ) : (
              <div className="space-y-3">
                {filteredUsers.length === 0 ? (
                  <div className="text-sm text-slate-500">No users found.</div>
                ) : (
                  filteredUsers.map((user) => {
                    const isTeacher = user.role === "teacher";
                    const enabledLabels = getEnabledPermissionLabels(user.id);
                    const enabledKeys = getEnabledPermissionKeys(user.id);
                    const isAdminAccessEnabled = enabledKeys.length > 0;
                    const isExpanded = Boolean(expandedAdminAccess[user.id]);
                    const summary =
                      enabledLabels.length === 0
                        ? "No admin pages enabled"
                        : `Enabled pages: ${enabledLabels.slice(0, 3).join(", ")}${
                            enabledLabels.length > 3
                              ? ` +${enabledLabels.length - 3} more`
                              : ""
                          }`;

                    return (
                      <div
                        key={user.id}
                        className="rounded-2xl border border-slate-100 bg-white/90 px-4 py-4 shadow-sm"
                      >
                        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                          <div className="min-w-[220px]">
                            <div className="text-sm font-semibold text-slate-900">
                              {user.name || "Unnamed user"}
                            </div>
                            <div className="text-xs text-slate-500">
                              {user.email || "No email"}
                            </div>
                            <div className="mt-3 flex flex-wrap items-center gap-2">
                              <select
                                value={user.role}
                                onChange={(e) =>
                                  updateRole(user.id, e.target.value as UserRow["role"])
                                }
                                aria-label={`Role for ${user.name || user.email || "user"}`}
                                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-slate-400 focus:outline-none"
                                disabled={savingId === user.id}
                              >
                                {ROLE_OPTIONS.map((role) => (
                                  <option key={role} value={role}>
                                    {role}
                                  </option>
                                ))}
                              </select>
                              {savingId === user.id ? (
                                <span className="text-xs text-slate-500">Saving…</span>
                              ) : null}
                              {isTeacher ? (
                                <>
                                  <select
                                    value={assignmentsByTeacher[user.id] ?? "unassigned"}
                                    onChange={(e) =>
                                      updateTeacherAssignment(
                                        user.id,
                                        e.target.value as AssignmentValue
                                      )
                                    }
                                    aria-label={`Program assignment for ${user.name || user.email || "teacher"}`}
                                    className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-slate-400 focus:outline-none"
                                    disabled={assignmentSavingId === user.id || programs.length === 0}
                                  >
                                    <option value="unassigned">Unassigned</option>
                                    <option value="campus">Campus</option>
                                    <option value="online">Online</option>
                                    <option value="both">Campus + Online</option>
                                  </select>
                                  {assignmentSavingId === user.id ? (
                                    <span className="text-xs text-slate-500">Saving…</span>
                                  ) : null}
                                </>
                              ) : null}
                            </div>
                          </div>

                          {isTeacher ? (
                            <div className="w-full rounded-xl border border-slate-100 bg-slate-50/70 p-3 lg:ml-auto lg:max-w-lg">
                              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                                <div>
                                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                                    Admin Access
                                  </p>
                                  <p className="text-sm text-slate-700">{summary}</p>
                                </div>
                                <div className="flex items-center gap-3">
                                  <div className="flex items-center gap-2 scale-90">
                                    <Switch
                                      checked={isAdminAccessEnabled}
                                      onCheckedChange={(nextChecked) =>
                                        toggleAdminAccess(user.id, nextChecked)
                                      }
                                    />
                                    <span className="text-[11px] text-slate-500">Enable</span>
                                  </div>
                                  {isAdminAccessEnabled ? (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setExpandedAdminAccess((prev) => ({
                                          ...prev,
                                          [user.id]: !isExpanded,
                                        }))
                                      }
                                      className="text-xs font-semibold text-slate-400 hover:text-slate-600"
                                    >
                                      {isExpanded ? "Hide" : "Customize"}
                                    </button>
                                  ) : null}
                                </div>
                              </div>

                              {isAdminAccessEnabled ? (
                                isExpanded ? (
                                  <div className="mt-2 flex flex-wrap gap-1.5">
                                    {ADMIN_PAGE_PERMISSIONS.map((permission) => {
                                      const savingKey = `${user.id}:${permission.key}`;
                                      const isSaving = Boolean(permissionSaving[savingKey]);
                                      const checked = Boolean(
                                        adminPagePermissions[user.id]?.[permission.key]
                                      );

                                      return (
                                        <button
                                          key={permission.key}
                                          type="button"
                                          aria-pressed={checked}
                                          onClick={() =>
                                            updateAssignmentPermission(
                                              user.id,
                                              permission.key,
                                              !checked
                                            )
                                          }
                                          disabled={isSaving}
                                          className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition ${
                                            checked
                                              ? "bg-blue-600 text-white"
                                              : "border border-slate-200/80 bg-white text-slate-500"
                                          } ${
                                            isSaving
                                              ? "opacity-60"
                                              : "hover:border-slate-300 hover:text-slate-700"
                                          }`}
                                        >
                                          {permission.label}
                                        </button>
                                      );
                                    })}
                                  </div>
                                ) : null
                              ) : (
                                <p className="mt-2 text-xs text-slate-500">
                                  Enable admin access to choose pages.
                                </p>
                              )}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </Card>
        </div>
      </main>
    </div>
  );
}
