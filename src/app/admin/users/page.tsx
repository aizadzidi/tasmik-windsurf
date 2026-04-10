"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AdminNavbar from "@/components/admin/AdminNavbar";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Switch } from "@/components/ui/Switch";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ADMIN_PAGE_PERMISSIONS } from "@/lib/adminAccess";
import { authFetch } from "@/lib/authFetch";
import { MoreHorizontal, SlidersHorizontal, UserPlus, Copy, X, Trash2 } from "lucide-react";

type UserRow = {
  id: string;
  name: string | null;
  email: string | null;
  role: "admin" | "teacher" | "parent" | "general_worker";
  created_at?: string | null;
  linked_children?: Array<{
    id: string;
    name: string | null;
    class_name: string | null;
  }>;
};

type ProgramRow = {
  id: string;
  name: string;
  type: "campus" | "online" | "hybrid";
};

type ParentCandidate = {
  id: string;
  name: string | null;
  parent_id: string | null;
  class_name: string | null;
};

type AssignmentValue = "campus" | "online" | "both" | "unassigned";
type TeachingScopeFilter = "all" | AssignmentValue;
type RoleFilter = "all" | UserRow["role"] | "unassigned-parent";
type SortOption =
  | "name-asc"
  | "name-desc"
  | "registered-newest"
  | "registered-oldest";

const ROLE_OPTIONS: UserRow["role"][] = ["admin", "teacher", "general_worker", "parent"];
const ROLE_LABELS: Record<UserRow["role"], string> = {
  admin: "Admin",
  teacher: "Teacher",
  general_worker: "General Worker",
  parent: "Parent",
};
const ASSIGNMENT_LABELS: Record<AssignmentValue, string> = {
  campus: "Campus",
  online: "Online",
  both: "Campus + Online",
  unassigned: "Unassigned",
};

export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [programs, setPrograms] = useState<ProgramRow[]>([]);
  const [parentCandidates, setParentCandidates] = useState<ParentCandidate[]>([]);
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
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
  const [teachingScopeFilter, setTeachingScopeFilter] =
    useState<TeachingScopeFilter>("all");
  const [sortOption, setSortOption] = useState<SortOption>("name-asc");
  const [selectedChildByParent, setSelectedChildByParent] = useState<Record<string, string>>({});
  const [parentLinkSavingByParent, setParentLinkSavingByParent] = useState<Record<string, boolean>>({});
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);
  // Invite staff state
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteMaxUses, setInviteMaxUses] = useState(20);
  const [inviteExpiresInDays, setInviteExpiresInDays] = useState(30);
  const [inviteTargetRole, setInviteTargetRole] = useState<"teacher" | "general_worker">("teacher");
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [inviteCopied, setInviteCopied] = useState(false);
  const [invites, setInvites] = useState<Array<{
    id: string;
    code: string;
    target_role?: string;
    max_uses: number;
    use_count: number;
    expires_at: string;
    is_active: boolean;
    created_at: string;
  }>>([]);
  const [invitesLoading, setInvitesLoading] = useState(false);
  const [inviteError, setInviteError] = useState("");
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
      const res = await authFetch("/api/admin/users?include_parent_candidates=true", {
        signal: controller.signal,
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        throw new Error(payload?.error || "Failed to load users");
      }
      const data = await res.json();
      if (Array.isArray(data)) {
        setUsers(data);
        setParentCandidates([]);
      } else {
        setUsers(Array.isArray(data?.users) ? data.users : []);
        setParentCandidates(
          Array.isArray(data?.parent_candidates) ? data.parent_candidates : []
        );
      }
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
    const searchedUsers = !term
      ? users
      : users.filter((u) => {
          const haystack = `${u.name ?? ""} ${u.email ?? ""}`.toLowerCase();
          return haystack.includes(term);
        });

    const roleFilteredUsers = searchedUsers.filter((user) => {
      if (roleFilter === "all") return true;
      if (roleFilter === "unassigned-parent") {
        if (user.role !== "parent") return false;
        return (user.linked_children ?? []).length === 0;
      }
      return user.role === roleFilter;
    });

    const scopeFilteredUsers = roleFilteredUsers.filter((user) => {
      if (teachingScopeFilter === "all") return true;
      if (user.role !== "teacher") return false;
      return (assignmentsByTeacher[user.id] ?? "unassigned") === teachingScopeFilter;
    });

    const getRegistrationTimestamp = (user: UserRow) => {
      if (!user.created_at) return 0;
      const timestamp = new Date(user.created_at).getTime();
      return Number.isNaN(timestamp) ? 0 : timestamp;
    };

    return [...scopeFilteredUsers].sort((a, b) => {
      if (sortOption === "name-desc") {
        return (b.name ?? "").localeCompare(a.name ?? "");
      }
      if (sortOption === "registered-newest") {
        return getRegistrationTimestamp(b) - getRegistrationTimestamp(a);
      }
      if (sortOption === "registered-oldest") {
        return getRegistrationTimestamp(a) - getRegistrationTimestamp(b);
      }
      return (a.name ?? "").localeCompare(b.name ?? "");
    });
  }, [assignmentsByTeacher, query, roleFilter, sortOption, teachingScopeFilter, users]);

  const formatRegistrationDate = (value?: string | null) => {
    if (!value) return "Registered date unavailable";
    const parsedDate = new Date(value);
    if (Number.isNaN(parsedDate.getTime())) return "Registered date unavailable";
    return `Registered ${parsedDate.toLocaleDateString("ms-MY", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    })}`;
  };

  const syncLinkedChildren = useCallback(
    (child: ParentCandidate, nextParentId: string | null) => {
      setUsers((prev) =>
        prev.map((user) => {
          if (user.role !== "parent") return user;
          const withoutChild = (user.linked_children ?? []).filter(
            (linkedChild) => linkedChild.id !== child.id
          );
          if (nextParentId && user.id === nextParentId) {
            const nextLinkedChildren = [
              ...withoutChild,
              {
                id: child.id,
                name: child.name,
                class_name: child.class_name,
              },
            ].sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
            return { ...user, linked_children: nextLinkedChildren };
          }
          return { ...user, linked_children: withoutChild };
        })
      );
    },
    []
  );

  const updateParentChildLink = async (
    parentId: string,
    childId: string,
    action: "link-child" | "unlink-child"
  ) => {
    const child = parentCandidates.find((item) => item.id === childId);
    if (!child) {
      setError("Selected child not found");
      return;
    }

    setParentLinkSavingByParent((prev) => ({ ...prev, [parentId]: true }));
    setError("");
    try {
      const res = await authFetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          parent_id: parentId,
          child_id: childId,
        }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        throw new Error(payload?.error || "Failed to update parent-child link");
      }

      const nextParentId = action === "link-child" ? parentId : null;
      setParentCandidates((prev) =>
        prev.map((candidate) =>
          candidate.id === childId ? { ...candidate, parent_id: nextParentId } : candidate
        )
      );
      syncLinkedChildren(child, nextParentId);
      if (action === "link-child") {
        setSelectedChildByParent((prev) => ({ ...prev, [parentId]: "" }));
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to update parent-child link";
      setError(message);
    } finally {
      setParentLinkSavingByParent((prev) => ({ ...prev, [parentId]: false }));
    }
  };

  const deleteUser = async (user: UserRow) => {
    const label = user.name || user.email || "this user";
    const confirmed = window.confirm(
      `Delete ${label}? This action removes the user from the system.`
    );
    if (!confirmed) return;

    setDeletingUserId(user.id);
    setError("");
    try {
      const res = await authFetch(`/api/admin/users?id=${encodeURIComponent(user.id)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        throw new Error(payload?.error || "Failed to delete user");
      }

      setUsers((prev) => prev.filter((item) => item.id !== user.id));
      setAssignmentsByTeacher((prev) => {
        if (!(user.id in prev)) return prev;
        const next = { ...prev };
        delete next[user.id];
        return next;
      });
      setAdminPagePermissions((prev) => {
        if (!(user.id in prev)) return prev;
        const next = { ...prev };
        delete next[user.id];
        return next;
      });
      setExpandedAdminAccess((prev) => {
        if (!(user.id in prev)) return prev;
        const next = { ...prev };
        delete next[user.id];
        return next;
      });
      setSelectedChildByParent((prev) => {
        if (!(user.id in prev)) return prev;
        const next = { ...prev };
        delete next[user.id];
        return next;
      });
      setParentLinkSavingByParent((prev) => {
        if (!(user.id in prev)) return prev;
        const next = { ...prev };
        delete next[user.id];
        return next;
      });
      if (user.role === "parent") {
        setParentCandidates((prev) =>
          prev.map((child) =>
            child.parent_id === user.id ? { ...child, parent_id: null } : child
          )
        );
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to delete user";
      setError(message);
    } finally {
      setDeletingUserId(null);
    }
  };

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

  // ── Invite teacher functions ──────────────────────────────────────
  const fetchInvites = useCallback(async () => {
    setInvitesLoading(true);
    try {
      const res = await authFetch("/api/admin/invites");
      if (res.ok) {
        const data = await res.json();
        setInvites(Array.isArray(data) ? data : []);
      }
    } catch {
      // silent
    } finally {
      setInvitesLoading(false);
    }
  }, []);

  const openInviteModal = useCallback(() => {
    setShowInviteModal(true);
    setInviteLink(null);
    setInviteCopied(false);
    setInviteError("");
    setInviteMaxUses(20);
    setInviteExpiresInDays(30);
    setInviteTargetRole("teacher");
    fetchInvites();
  }, [fetchInvites]);

  const generateInvite = useCallback(async () => {
    setInviteLoading(true);
    setInviteError("");
    try {
      const res = await authFetch("/api/admin/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ max_uses: inviteMaxUses, expires_in_days: inviteExpiresInDays, target_role: inviteTargetRole }),
      });
      const data = await res.json();
      if (!res.ok) {
        setInviteError(data?.error || "Failed to generate invite.");
        return;
      }
      const host = typeof window !== "undefined" ? window.location.host : "";
      setInviteLink(`${window.location.protocol}//${host}/join/${data.code}`);
      fetchInvites();
    } catch {
      setInviteError("Failed to generate invite.");
    } finally {
      setInviteLoading(false);
    }
  }, [inviteMaxUses, inviteExpiresInDays, inviteTargetRole, fetchInvites]);

  const copyInviteLink = useCallback(() => {
    if (!inviteLink) return;
    navigator.clipboard.writeText(inviteLink).then(() => {
      setInviteCopied(true);
      setTimeout(() => setInviteCopied(false), 2000);
    });
  }, [inviteLink]);

  const revokeInvite = useCallback(async (id: string) => {
    try {
      await authFetch(`/api/admin/invites/${id}`, { method: "DELETE" });
      fetchInvites();
    } catch {
      // silent
    }
  }, [fetchInvites]);


  return (
    <div className="min-h-screen bg-gray-50">
      <AdminNavbar />
      <main className="mx-auto w-full max-w-7xl px-4 md:px-8 py-10">
        <div className="w-full space-y-6">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">User Roles</h1>
              <p className="text-sm text-slate-600">
                Assign roles for teachers, parents, and admins.
              </p>
            </div>
            <Button
              onClick={openInviteModal}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white"
            >
              <UserPlus className="h-4 w-4" />
              Invite Staff
            </Button>
          </div>

          <Card className="p-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by name or email"
                aria-label="Search users by name or email"
                className="w-full lg:max-w-sm"
              />
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={roleFilter}
                  onChange={(event) => setRoleFilter(event.target.value as RoleFilter)}
                  aria-label="Filter users by role"
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-slate-400 focus:outline-none"
                >
                  <option value="all">All roles</option>
                  <option value="admin">Admin</option>
                  <option value="teacher">Teacher</option>
                  <option value="general_worker">General Worker</option>
                  <option value="parent">Parent</option>
                  <option value="unassigned-parent">Unassigned Parent</option>
                </select>
                <select
                  value={teachingScopeFilter}
                  onChange={(event) =>
                    setTeachingScopeFilter(event.target.value as TeachingScopeFilter)
                  }
                  aria-label="Filter teachers by teaching scope"
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-slate-400 focus:outline-none"
                >
                  <option value="all">All scopes</option>
                  <option value="campus">Campus</option>
                  <option value="online">Online</option>
                  <option value="both">Campus + Online</option>
                  <option value="unassigned">Unassigned</option>
                </select>
                <div className="relative">
                  <SlidersHorizontal
                    className="pointer-events-none absolute left-3 top-1/2 h-4 w-4
                    -translate-y-1/2 text-slate-400"
                  />
                  <select
                    value={sortOption}
                    onChange={(event) =>
                      setSortOption(event.target.value as SortOption)
                    }
                    aria-label="Sort users"
                    className="rounded-lg border border-slate-200 bg-white py-2
                    pl-9 pr-8 text-sm text-slate-700 shadow-sm focus:border-slate-400
                    focus:outline-none"
                  >
                    <option value="name-asc">Name A-Z</option>
                    <option value="name-desc">Name Z-A</option>
                    <option value="registered-newest">Registered (Newest)</option>
                    <option value="registered-oldest">Registered (Oldest)</option>
                  </select>
                </div>
                <Button
                  variant="secondary"
                  onClick={() => fetchUsers()}
                  disabled={loading}
                >
                  Refresh
                </Button>
              </div>
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
                    const isParent = user.role === "parent";
                    const linkedChildren = user.linked_children ?? [];
                    const linkableChildren = parentCandidates.filter(
                      (child) => !child.parent_id
                    );
                    const isParentLinkSaving = Boolean(parentLinkSavingByParent[user.id]);
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
                            <div className="flex items-start justify-between gap-2">
                              <div className="text-sm font-semibold text-slate-900">
                                {user.name || "Unnamed user"}
                              </div>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-slate-500 hover:text-slate-900"
                                    aria-label={`Actions for ${user.name || user.email || "user"}`}
                                  >
                                    <MoreHorizontal className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem
                                    variant="destructive"
                                    disabled={deletingUserId === user.id}
                                    onSelect={(event) => {
                                      event.preventDefault();
                                      if (deletingUserId === user.id) return;
                                      void deleteUser(user);
                                    }}
                                  >
                                    {deletingUserId === user.id ? "Deleting…" : "Delete user"}
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                            <div className="text-xs text-slate-500">
                              {user.email || "No email"}
                            </div>
                            <div className="mt-1 text-xs text-slate-400">
                              {formatRegistrationDate(user.created_at)}
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
                                    {ROLE_LABELS[role]}
                                  </option>
                                ))}
                              </select>
                              {savingId === user.id ? (
                                <span className="text-xs text-slate-500">Saving…</span>
                              ) : null}
                              {isTeacher ? (
                                <div className="flex flex-col gap-1">
                                  <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                                    Teaching Scope
                                  </span>
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
                                  <span className="text-[11px] text-slate-500">
                                    {ASSIGNMENT_LABELS[assignmentsByTeacher[user.id] ?? "unassigned"]}
                                  </span>
                                  {assignmentSavingId === user.id ? (
                                    <span className="text-xs text-slate-500">Saving…</span>
                                  ) : null}
                                </div>
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
                          {isParent ? (
                            <div className="w-full rounded-xl border border-slate-100 bg-slate-50/70 p-3 lg:ml-auto lg:max-w-lg">
                              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                                Linked Children
                              </p>
                              <p className="text-sm text-slate-700">
                                {linkedChildren.length > 0
                                  ? `${linkedChildren.length} anak linked`
                                  : "No child linked yet"}
                              </p>
                              <div className="mt-2 flex flex-wrap items-center gap-2">
                                <select
                                  value={selectedChildByParent[user.id] ?? ""}
                                  onChange={(event) =>
                                    setSelectedChildByParent((prev) => ({
                                      ...prev,
                                      [user.id]: event.target.value,
                                    }))
                                  }
                                  aria-label={`Select child for ${user.name || user.email || "parent"}`}
                                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-slate-400 focus:outline-none"
                                  disabled={isParentLinkSaving}
                                >
                                  <option value="">Select child to link</option>
                                  {linkableChildren.map((child) => (
                                    <option key={child.id} value={child.id}>
                                      {child.name || "Unnamed child"}
                                      {child.class_name ? ` (${child.class_name})` : ""}
                                    </option>
                                  ))}
                                </select>
                                <Button
                                  size="sm"
                                  onClick={() =>
                                    updateParentChildLink(
                                      user.id,
                                      selectedChildByParent[user.id] ?? "",
                                      "link-child"
                                    )
                                  }
                                  disabled={
                                    isParentLinkSaving ||
                                    !selectedChildByParent[user.id]
                                  }
                                >
                                  {isParentLinkSaving ? "Saving…" : "Link child"}
                                </Button>
                              </div>
                              {linkedChildren.length > 0 ? (
                                <div className="mt-2 flex flex-wrap gap-1.5">
                                  {linkedChildren.map((child) => (
                                    <button
                                      key={child.id}
                                      type="button"
                                      onClick={() =>
                                        updateParentChildLink(
                                          user.id,
                                          child.id,
                                          "unlink-child"
                                        )
                                      }
                                      disabled={isParentLinkSaving}
                                      className="rounded-full border border-slate-200 bg-white
                                      px-2.5 py-1 text-[11px] text-slate-600
                                      hover:border-slate-300"
                                    >
                                      {child.name || "Unnamed child"}
                                      {child.class_name ? ` (${child.class_name})` : ""}
                                      {" · Unlink"}
                                    </button>
                                  ))}
                                </div>
                              ) : null}
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

      {/* Invite Teacher Modal */}
      {showInviteModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="relative w-full max-w-lg mx-4 rounded-2xl bg-white p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
            <button
              type="button"
              onClick={() => setShowInviteModal(false)}
              className="absolute right-4 top-4 rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            >
              <X className="h-5 w-5" />
            </button>

            <h2 className="text-lg font-bold text-slate-900 mb-1">Invite Staff</h2>
            <p className="text-sm text-slate-500 mb-5">
              Generate an invite link to share with staff members.
            </p>

            {inviteError ? (
              <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
                {inviteError}
              </div>
            ) : null}

            {inviteLink ? (
              <div className="mb-5 space-y-3">
                <label className="block text-sm font-medium text-slate-700">Invite Link</label>
                <div className="flex items-center gap-2">
                  <input
                    readOnly
                    value={inviteLink}
                    className="flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-mono"
                  />
                  <Button
                    onClick={copyInviteLink}
                    className="flex items-center gap-1.5 text-sm"
                  >
                    <Copy className="h-3.5 w-3.5" />
                    {inviteCopied ? "Copied!" : "Copy"}
                  </Button>
                </div>
                <p className="text-xs text-slate-500">
                  Share this link with staff via WhatsApp or email.
                </p>
              </div>
            ) : (
              <div className="mb-5 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Role
                  </label>
                  <select
                    value={inviteTargetRole}
                    onChange={(e) => setInviteTargetRole(e.target.value as "teacher" | "general_worker")}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
                  >
                    <option value="teacher">Teacher</option>
                    <option value="general_worker">General Worker</option>
                  </select>
                  <p className="text-xs text-slate-400 mt-1">Users who join with this link will be assigned this role</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Max uses
                  </label>
                  <Input
                    type="number"
                    min={1}
                    max={1000}
                    value={inviteMaxUses}
                    onChange={(e) => setInviteMaxUses(Number(e.target.value) || 20)}
                    className="w-full"
                  />
                  <p className="text-xs text-slate-400 mt-1">How many people can use this link</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Expires in (days)
                  </label>
                  <Input
                    type="number"
                    min={1}
                    max={365}
                    value={inviteExpiresInDays}
                    onChange={(e) => setInviteExpiresInDays(Number(e.target.value) || 30)}
                    className="w-full"
                  />
                </div>
                <Button
                  onClick={generateInvite}
                  disabled={inviteLoading}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                >
                  {inviteLoading ? "Generating..." : "Generate Invite Link"}
                </Button>
              </div>
            )}

            {/* Active invites list */}
            <div className="border-t border-slate-100 pt-4">
              <h3 className="text-sm font-semibold text-slate-700 mb-3">Active Invites</h3>
              {invitesLoading ? (
                <p className="text-sm text-slate-400">Loading...</p>
              ) : invites.filter((i) => i.is_active).length === 0 ? (
                <p className="text-sm text-slate-400">No active invites.</p>
              ) : (
                <div className="space-y-2">
                  {invites.filter((inv) => inv.is_active).map((inv) => {
                    const isExpired = new Date(inv.expires_at) < new Date();
                    const isExhausted = inv.use_count >= inv.max_uses;
                    const isUsable = !isExpired && !isExhausted;
                    return (
                      <div
                        key={inv.id}
                        className={`flex items-center justify-between rounded-lg border px-3 py-2 text-sm ${
                          isUsable
                            ? "border-slate-200 bg-white"
                            : "border-slate-100 bg-slate-50 opacity-60"
                        }`}
                      >
                        <div>
                          <span className="font-mono font-medium text-slate-800">{inv.code}</span>
                          <span className={`ml-2 inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                            inv.target_role === "general_worker"
                              ? "bg-purple-100 text-purple-700"
                              : "bg-blue-100 text-blue-700"
                          }`}>
                            {inv.target_role === "general_worker" ? "Staff" : "Teacher"}
                          </span>
                          <span className="ml-2 text-slate-400">
                            {inv.use_count}/{inv.max_uses} used
                          </span>
                          {!inv.is_active ? (
                            <span className="ml-2 text-red-500 text-xs">Revoked</span>
                          ) : isExpired ? (
                            <span className="ml-2 text-amber-600 text-xs">Expired</span>
                          ) : isExhausted ? (
                            <span className="ml-2 text-amber-600 text-xs">Exhausted</span>
                          ) : null}
                        </div>
                        {inv.is_active ? (
                          <button
                            type="button"
                            onClick={() => revokeInvite(inv.id)}
                            className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                            title="Revoke invite"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
