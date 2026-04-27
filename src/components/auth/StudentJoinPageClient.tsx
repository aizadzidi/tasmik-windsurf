"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { JoinShell } from "@/components/auth/JoinPageClient";

type Mode = "signup" | "claim";

type ClaimPreview = {
  student: {
    id: string;
    name: string;
    display_name: string;
    name_locked: boolean;
  };
  expires_at: string;
};

export default function StudentJoinPageClient() {
  const searchParams = useSearchParams();
  const claimFromUrl = (searchParams.get("claim") ?? "").trim();

  const [mode, setMode] = useState<Mode>(claimFromUrl ? "claim" : "signup");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [claimToken, setClaimToken] = useState(claimFromUrl);
  const [claimPreview, setClaimPreview] = useState<ClaimPreview | null>(null);
  const [claimLoading, setClaimLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const claimNameLocked = mode === "claim" && Boolean(claimPreview?.student.name_locked);

  const validateClaimToken = useCallback(async (token: string) => {
    const trimmed = token.trim();
    if (!trimmed) {
      setClaimPreview(null);
      setError("Claim code is required.");
      return null;
    }

    setClaimLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/public/student/claim?token=${encodeURIComponent(trimmed)}`);
      const payload = (await response.json()) as
        | {
            student?: { id: string; name: string; display_name: string; name_locked: boolean };
            expires_at?: string;
            error?: string;
          }
        | null;
      if (!response.ok || !payload?.student) {
        throw new Error(payload?.error || "Claim code is not valid anymore.");
      }
      const nextPreview = {
        student: payload.student,
        expires_at: payload.expires_at ?? "",
      };
      setClaimPreview(nextPreview);
      setName(payload.student.name_locked ? payload.student.name : "");
      return nextPreview;
    } catch (claimError) {
      setClaimPreview(null);
      setError(claimError instanceof Error ? claimError.message : "Claim code is not valid anymore.");
      return null;
    } finally {
      setClaimLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!claimFromUrl) return;
    setMode("claim");
    setClaimToken(claimFromUrl);
  }, [claimFromUrl]);

  useEffect(() => {
    if (!claimFromUrl) return;
    void validateClaimToken(claimFromUrl);
  }, [claimFromUrl, validateClaimToken]);

  const handleModeChange = (nextMode: Mode) => {
    setMode(nextMode);
    setError("");
    if (nextMode === "signup") {
      setClaimPreview(null);
    }
  };

  const validate = async () => {
    if (!name.trim()) return "Name is required.";
    if (!email.trim()) return "Email is required.";
    if (password.length < 8) return "Password must be at least 8 characters.";
    if (password !== confirmPassword) return "Passwords do not match.";
    if (mode === "claim") {
      const preview = claimPreview ?? (await validateClaimToken(claimToken));
      if (!preview) return "A valid claim code is required.";
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
      const response = await fetch("/api/public/student/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          phone: phone.trim() || null,
          password,
          claim_token: mode === "claim" ? claimToken.trim() || null : null,
        }),
      });

      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        setError(payload?.error || "Unable to create account.");
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
        title="Online Student Signup"
        description="Create your online student account or claim your existing online student record."
      >
        <div className="space-y-4 rounded-lg border border-emerald-200 bg-emerald-50 p-6 text-emerald-900">
          <h2 className="text-xl font-semibold">Student account created</h2>
          <p className="text-sm">
            Your student portal is ready. Continue to login and manage your online package.
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
      title="Online Student Signup"
      description="Create a new online student account or use a claim code from admin to link an existing record."
    >
      <div className="mb-6 flex rounded-lg bg-slate-100 p-1">
        <button
          type="button"
          onClick={() => handleModeChange("signup")}
          className={`flex-1 rounded-md py-2.5 text-sm font-semibold transition-all ${
            mode === "signup"
              ? "bg-white shadow-sm text-slate-900"
              : "text-slate-500 hover:text-slate-700"
          }`}
        >
          Create Account
        </button>
        <button
          type="button"
          onClick={() => handleModeChange("claim")}
          className={`flex-1 rounded-md py-2.5 text-sm font-semibold transition-all ${
            mode === "claim"
              ? "bg-white shadow-sm text-slate-900"
              : "text-slate-500 hover:text-slate-700"
          }`}
        >
          I Have Claim Code
        </button>
      </div>

      {error ? (
        <Alert variant="error" className="mb-4">
          {error}
        </Alert>
      ) : null}

      {mode === "claim" ? (
        <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
          Enter the claim code given by admin, or open the claim link directly. Only your matched
          student record will be shown here.
        </div>
      ) : (
        <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          For online students who want to manage their own weekly package and schedule directly.
        </div>
      )}

      <form
        onSubmit={(event) => void handleSubmit(event)}
        className="space-y-4"
        autoComplete={mode === "claim" ? "off" : "on"}
      >
        {mode === "claim" ? (
          <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
            <div className="flex gap-2">
              <Input
                placeholder="Claim code"
                value={claimToken}
                onChange={(event) => {
                  setClaimToken(event.target.value);
                  setClaimPreview(null);
                  setName("");
                }}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="none"
                className="h-10 rounded-lg border-slate-200 bg-white px-3 font-mono focus-visible:ring-blue-500"
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
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                Claiming record for <span className="font-semibold">{claimPreview.student.display_name}</span>
              </div>
            ) : null}
          </div>
        ) : null}

        <Input
          placeholder="Full name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          required
          readOnly={claimNameLocked}
          autoComplete={claimNameLocked ? "off" : "name"}
          className="h-11 rounded-lg border-slate-200 bg-slate-50 px-4 focus-visible:ring-blue-500"
        />
        {claimNameLocked ? (
          <p className="-mt-2 text-xs text-slate-500">
            This name is locked to the claimed student record.
          </p>
        ) : null}
        <Input
          type="email"
          placeholder="Email address"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
          name={mode === "claim" ? "student-claim-email" : "email"}
          autoComplete={mode === "claim" ? "off" : "email"}
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
          name={mode === "claim" ? "student-claim-password" : "password"}
          autoComplete="new-password"
          className="h-11 rounded-lg border-slate-200 bg-slate-50 px-4 focus-visible:ring-blue-500"
        />
        <Input
          type="password"
          placeholder="Confirm password"
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          required
          name={mode === "claim" ? "student-claim-password-confirmation" : "confirm-password"}
          autoComplete="new-password"
          className="h-11 rounded-lg border-slate-200 bg-slate-50 px-4 focus-visible:ring-blue-500"
        />

        <Button
          type="submit"
          disabled={loading || (mode === "claim" && claimLoading)}
          className="h-11 w-full rounded-lg bg-blue-600 font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? (
            <div className="flex items-center justify-center">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
              Creating account...
            </div>
          ) : mode === "claim" ? (
            "Claim Student Account"
          ) : (
            "Create Student Account"
          )}
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
