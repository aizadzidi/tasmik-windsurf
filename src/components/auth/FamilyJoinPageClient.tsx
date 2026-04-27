"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { JoinShell } from "@/components/auth/JoinPageClient";

type LearnerForm = {
  id: string;
  name: string;
  relationship: "child" | "self";
};

type FamilyClaimPreview = {
  expires_at: string;
  students: Array<{
    id: string;
    name: string;
    available: boolean;
    unavailable_reason?: string | null;
    has_student_login: boolean;
  }>;
};

const newLearner = (relationship: "child" | "self" = "child"): LearnerForm => ({
  id: crypto.randomUUID(),
  name: "",
  relationship,
});

export default function FamilyJoinPageClient() {
  const searchParams = useSearchParams();
  const claimFromUrl = (searchParams.get("claim") ?? "").trim();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [learners, setLearners] = useState<LearnerForm[]>([newLearner()]);
  const [claimToken, setClaimToken] = useState(claimFromUrl);
  const [claimPreview, setClaimPreview] = useState<FamilyClaimPreview | null>(null);
  const [claimLoading, setClaimLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const availableClaimCount = useMemo(
    () => claimPreview?.students.filter((student) => student.available).length ?? 0,
    [claimPreview]
  );

  const validateClaimToken = useCallback(async (token: string) => {
    const trimmed = token.trim();
    if (!trimmed) {
      setClaimPreview(null);
      setError("Family claim code is required.");
      return null;
    }

    setClaimLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/public/online/family-claim?token=${encodeURIComponent(trimmed)}`);
      const payload = (await response.json()) as FamilyClaimPreview & { error?: string };
      if (!response.ok || !Array.isArray(payload.students)) {
        throw new Error(payload.error || "Family claim code is not valid anymore.");
      }
      setClaimPreview(payload);
      return payload;
    } catch (claimError) {
      setClaimPreview(null);
      setError(claimError instanceof Error ? claimError.message : "Family claim code is not valid anymore.");
      return null;
    } finally {
      setClaimLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!claimFromUrl) return;
    setClaimToken(claimFromUrl);
    void validateClaimToken(claimFromUrl);
  }, [claimFromUrl, validateClaimToken]);

  const updateLearner = (id: string, patch: Partial<LearnerForm>) => {
    setLearners((current) =>
      current.map((learner) => (learner.id === id ? { ...learner, ...patch } : learner))
    );
  };

  const removeLearner = (id: string) => {
    setLearners((current) => current.filter((learner) => learner.id !== id));
  };

  const validate = async () => {
    if (!name.trim()) return "Family account holder name is required.";
    if (!email.trim()) return "Email is required.";
    if (password.length < 8) return "Password must be at least 8 characters.";
    if (password !== confirmPassword) return "Passwords do not match.";

    const hasLearner = learners.some((learner) => learner.name.trim());
    if (claimToken.trim()) {
      const preview = claimPreview ?? (await validateClaimToken(claimToken));
      if (!preview) return "A valid family claim code is required.";
      if (preview.students.filter((student) => student.available).length === 0) {
        return "No students in this family claim code are available.";
      }
    } else if (!hasLearner) {
      return "Add at least one learner.";
    }

    return null;
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    const validationError = await validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/public/online/family/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          phone: phone.trim() || null,
          password,
          learners: learners
            .filter((learner) => learner.name.trim())
            .map((learner) => ({
              name: learner.name.trim(),
              relationship: learner.relationship,
            })),
          family_claim_token: claimToken.trim() || null,
        }),
      });

      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        setError(payload?.error || "Unable to create family account.");
        return;
      }

      setSuccess(true);
    } catch {
      setError("Unexpected error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <JoinShell
        title="Family Account"
        description="Create a family account to manage online learners."
      >
        <div className="space-y-4 rounded-lg border border-emerald-200 bg-emerald-50 p-6 text-emerald-900">
          <h2 className="text-xl font-semibold">Family account created</h2>
          <p className="text-sm">
            Your family account is ready. Continue to login and manage online packages.
          </p>
          <Link href="/login" className="block">
            <Button className="w-full">Go to Login</Button>
          </Link>
        </div>
      </JoinShell>
    );
  }

  return (
    <JoinShell
      title="Create Family Account"
      description="Register children, yourself plus children, or claim existing learner records."
    >
      {error ? (
        <Alert variant="error" className="mb-4">
          {error}
        </Alert>
      ) : null}

      <form onSubmit={(event) => void handleSubmit(event)} className="space-y-5">
        <div className="space-y-4">
          <Input
            placeholder="Family account holder name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
            autoComplete="name"
            className="h-11 rounded-lg border-slate-200 bg-slate-50 px-4 focus-visible:ring-blue-500"
          />
          <Input
            type="email"
            placeholder="Email address"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            autoComplete="email"
            className="h-11 rounded-lg border-slate-200 bg-slate-50 px-4 focus-visible:ring-blue-500"
          />
          <Input
            placeholder="Phone number (optional)"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            autoComplete="tel"
            className="h-11 rounded-lg border-slate-200 bg-slate-50 px-4 focus-visible:ring-blue-500"
          />
          <Input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            autoComplete="new-password"
            className="h-11 rounded-lg border-slate-200 bg-slate-50 px-4 focus-visible:ring-blue-500"
          />
          <Input
            type="password"
            placeholder="Confirm password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            required
            autoComplete="new-password"
            className="h-11 rounded-lg border-slate-200 bg-slate-50 px-4 focus-visible:ring-blue-500"
          />
        </div>

        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Learners</h2>
              <p className="mt-1 text-xs text-slate-500">
                Add yourself, one child, or multiple children.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              className="h-9 rounded-lg bg-white"
              onClick={() => setLearners((current) => [...current, newLearner()])}
            >
              <Plus className="size-4" />
              Add
            </Button>
          </div>

          <div className="mt-4 space-y-3">
            {learners.map((learner) => (
              <div key={learner.id} className="rounded-lg border border-slate-200 bg-white p-3">
                <div className="grid gap-3 sm:grid-cols-[120px_1fr_auto] sm:items-center">
                  <select
                    value={learner.relationship}
                    onChange={(event) =>
                      updateLearner(learner.id, {
                        relationship: event.target.value === "self" ? "self" : "child",
                      })
                    }
                    className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700"
                  >
                    <option value="child">Child</option>
                    <option value="self">Self</option>
                  </select>
                  <Input
                    placeholder={learner.relationship === "self" ? "Your learner name" : "Child name"}
                    value={learner.name}
                    onChange={(event) => updateLearner(learner.id, { name: event.target.value })}
                    className="h-10 rounded-lg border-slate-200 bg-white px-3 focus-visible:ring-blue-500"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-10 rounded-lg text-rose-600 hover:bg-rose-50"
                    onClick={() => removeLearner(learner.id)}
                    disabled={learners.length === 1}
                    aria-label="Remove learner"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
          <h2 className="text-sm font-semibold text-blue-900">Family claim code</h2>
          <p className="mt-1 text-xs text-blue-800">
            Use this only when admin has already created existing learner records for your family.
          </p>
          <div className="mt-3 flex gap-2">
            <Input
              placeholder="Family claim code"
              value={claimToken}
              onChange={(event) => {
                setClaimToken(event.target.value);
                setClaimPreview(null);
              }}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="none"
              className="h-10 rounded-lg border-blue-100 bg-white px-3 font-mono focus-visible:ring-blue-500"
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => void validateClaimToken(claimToken)}
              disabled={claimLoading}
              className="shrink-0 rounded-lg bg-white"
            >
              {claimLoading ? "Checking..." : "Check"}
            </Button>
          </div>

          {claimPreview ? (
            <div className="mt-4 rounded-lg border border-blue-200 bg-white p-3">
              <p className="text-sm font-semibold text-slate-900">
                {availableClaimCount} learner(s) available to claim
              </p>
              <div className="mt-3 space-y-2">
                {claimPreview.students.map((student) => (
                  <div
                    key={student.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2"
                  >
                    <div>
                      <p className="text-sm font-medium text-slate-900">{student.name}</p>
                      {student.has_student_login ? (
                        <p className="text-xs text-slate-500">Existing student login will stay linked.</p>
                      ) : null}
                    </div>
                    <span
                      className={
                        student.available
                          ? "rounded-full bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-700"
                          : "rounded-full bg-rose-100 px-2 py-1 text-xs font-semibold text-rose-700"
                      }
                    >
                      {student.available ? "Available" : "Unavailable"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <Button
          type="submit"
          disabled={loading || claimLoading}
          className="h-11 w-full rounded-lg bg-blue-600 font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? "Creating family account..." : "Create Family Account"}
        </Button>
      </form>

      <div className="mt-6 text-center text-sm">
        <Link href="/login" className="font-medium text-slate-600 hover:text-slate-900 block">
          Already have an account? Sign in
        </Link>
      </div>
    </JoinShell>
  );
}
