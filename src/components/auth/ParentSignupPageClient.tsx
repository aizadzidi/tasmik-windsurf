"use client";

import { useState } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";

type ParentSignupPageClientProps = {
  tenantBaseDomain: string;
};

export default function ParentSignupPageClient({ tenantBaseDomain }: ParentSignupPageClientProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError("");

    if (!name.trim()) {
      setError("Name is required.");
      return;
    }
    if (!email.trim()) {
      setError("Email is required.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/public/parent/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          phone: phone.trim() || null,
          password,
        }),
      });

      const payload = (await response.json().catch(() => null)) as
        | { error?: string; code?: string }
        | null;
      if (!response.ok) {
        setError(payload?.error || "Unable to create parent account.");
        return;
      }

      setSuccess(true);
    } catch (submitError) {
      console.error("Parent signup failed", submitError);
      setError("Unexpected error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-gradient-to-br from-[#f6f4f0] via-[#eef6f1] to-[#f5f1e8] px-4 py-10">
      <div className="pointer-events-none absolute -left-32 top-10 h-72 w-72 rounded-full bg-gradient-to-tr from-amber-200 via-rose-100 to-emerald-100 opacity-60 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 right-10 h-80 w-80 rounded-full bg-gradient-to-tr from-emerald-200 via-sky-100 to-amber-100 opacity-60 blur-3xl" />

      <div className="relative z-10 mx-auto w-full max-w-lg rounded-3xl border border-white/80 bg-white/80 p-8 shadow-2xl backdrop-blur">
        <div className="space-y-3 text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-emerald-700">
            Parent onboarding
          </p>
          <h1 className="text-3xl font-semibold text-slate-900">Create parent account</h1>
          <p className="text-sm text-slate-600">
            Use this page on your school subdomain. Tenant base domain: {tenantBaseDomain}
          </p>
        </div>

        {error ? (
          <Alert variant="error" className="mt-6">
            {error}
          </Alert>
        ) : null}

        {success ? (
          <div className="mt-8 space-y-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-emerald-900">
            <h2 className="text-xl font-semibold">Account created</h2>
            <p className="text-sm">
              Your account is ready. Continue to login and access your parent dashboard.
            </p>
            <Link href="/login" className="block">
              <Button className="w-full">Go to Login</Button>
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-8 space-y-4">
            <Input
              placeholder="Full name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
            />
            <Input
              type="email"
              placeholder="Email address"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
            <Input
              placeholder="Phone number (optional)"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
            />
            <Input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
            <Input
              type="password"
              placeholder="Confirm password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              required
            />
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Creating account..." : "Create parent account"}
            </Button>
          </form>
        )}

        <div className="mt-6 text-center text-sm">
          <Link href="/login" className="font-medium text-slate-600 hover:text-slate-900">
            Already have an account? Sign in
          </Link>
        </div>
      </div>
    </main>
  );
}

