"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import AdminNavbar from "@/components/admin/AdminNavbar";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

type UserRow = {
  id: string;
  name: string | null;
  email: string | null;
  role: "admin" | "teacher" | "parent";
};

const ROLE_OPTIONS: UserRow["role"][] = ["admin", "teacher", "parent"];

export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/users");
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        throw new Error(payload?.error || "Failed to load users");
      }
      const data = await res.json();
      setUsers(Array.isArray(data) ? data : []);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load users";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const filteredUsers = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return users;
    return users.filter((u) => {
      const haystack = `${u.name ?? ""} ${u.email ?? ""}`.toLowerCase();
      return haystack.includes(term);
    });
  }, [query, users]);

  const updateRole = async (userId: string, role: UserRow["role"]) => {
    setSavingId(userId);
    setError("");
    try {
      const res = await fetch("/api/admin/users", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: userId, role }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        throw new Error(payload?.error || "Failed to update role");
      }
      setUsers((prev) =>
        prev.map((user) => (user.id === userId ? { ...user, role } : user))
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to update role";
      setError(message);
    } finally {
      setSavingId(null);
    }
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

          <Card className="p-4">
            {loading ? (
              <div className="text-sm text-slate-500">Loading users…</div>
            ) : (
              <div className="space-y-3">
                {filteredUsers.length === 0 ? (
                  <div className="text-sm text-slate-500">No users found.</div>
                ) : (
                  filteredUsers.map((user) => (
                    <div
                      key={user.id}
                      className="flex flex-col gap-3 border-b border-slate-100 pb-3 last:border-b-0 last:pb-0 md:flex-row md:items-center md:justify-between"
                    >
                      <div>
                        <div className="text-sm font-semibold text-slate-900">
                          {user.name || "Unnamed user"}
                        </div>
                        <div className="text-xs text-slate-500">
                          {user.email || "No email"}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <select
                          value={user.role}
                          onChange={(e) =>
                            updateRole(user.id, e.target.value as UserRow["role"])
                          }
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
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </Card>
        </div>
      </main>
    </div>
  );
}
