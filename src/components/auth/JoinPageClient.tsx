"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";

type JoinPageClientProps = {
  inviteCode?: string;
};

type TabRole = "parent" | "staff";

const ROLE_LABELS: Record<string, string> = {
  teacher: "Teacher",
  general_worker: "General Worker",
};

export default function JoinPageClient({ inviteCode }: JoinPageClientProps) {
  const searchParams = useSearchParams();

  const initialRole: TabRole =
    inviteCode ? "staff" : (searchParams.get("role") === "staff" || searchParams.get("role") === "teacher" ? "staff" : "parent");

  const [activeTab, setActiveTab] = useState<TabRole>(initialRole);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [code, setCode] = useState(inviteCode ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [schoolName, setSchoolName] = useState<string | null>(null);
  const [validatingCode, setValidatingCode] = useState(false);
  const [targetRole, setTargetRole] = useState<string | null>(null);

  // Validate invite code on mount if provided
  useEffect(() => {
    if (!inviteCode) return;
    let cancelled = false;
    setValidatingCode(true);
    fetch(`/api/public/invite/${encodeURIComponent(inviteCode)}`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        if (data.ok) {
          setSchoolName(data.school_name ?? null);
          setTargetRole(data.target_role ?? null);
        } else {
          setError(data.error ?? "Invalid or expired invite code.");
        }
      })
      .catch(() => {
        if (!cancelled) setError("Unable to validate invite code.");
      })
      .finally(() => {
        if (!cancelled) setValidatingCode(false);
      });
    return () => { cancelled = true; };
  }, [inviteCode]);

  function resetForm() {
    setName("");
    setEmail("");
    setPhone("");
    setPassword("");
    setConfirmPassword("");
    setError("");
    setSuccess(false);
    setTargetRole(null);
  }

  function switchTab(tab: TabRole) {
    if (tab === activeTab) return;
    resetForm();
    setActiveTab(tab);
    if (!inviteCode) setCode("");
  }

  function validate(): string | null {
    if (!name.trim()) return "Name is required.";
    if (!email.trim()) return "Email is required.";
    if (password.length < 8) return "Password must be at least 8 characters.";
    if (password !== confirmPassword) return "Passwords do not match.";
    if (activeTab === "staff" && !code.trim()) return "Invite code is required.";
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);
    try {
      const endpoint =
        activeTab === "parent"
          ? "/api/public/parent/register"
          : "/api/public/staff/register";

      const body: Record<string, unknown> = {
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim() || null,
        password,
      };
      if (activeTab === "staff") {
        body.invite_code = code.trim();
      }

      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const payload = (await response.json().catch(() => null)) as
        | { error?: string; code?: string; ok?: boolean }
        | null;

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
  }

  if (success) {
    return (
      <JoinShell>
        <div className="space-y-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-emerald-900">
          <h2 className="text-xl font-semibold">Account created</h2>
          <p className="text-sm">
            Your account is ready. Continue to login and access your dashboard.
          </p>
          <Link href="/login" className="block">
            <Button className="w-full">Go to Login</Button>
          </Link>
        </div>
      </JoinShell>
    );
  }

  return (
    <JoinShell schoolName={schoolName}>
      {/* Tab switcher */}
      <div className="flex rounded-xl bg-white/40 p-1 mb-6">
        <button
          type="button"
          onClick={() => switchTab("parent")}
          className={`flex-1 rounded-lg py-2.5 text-sm font-semibold transition-all ${
            activeTab === "parent"
              ? "bg-white shadow text-slate-900"
              : "text-slate-500 hover:text-slate-700"
          }`}
        >
          I am a Parent
        </button>
        <button
          type="button"
          onClick={() => switchTab("staff")}
          className={`flex-1 rounded-lg py-2.5 text-sm font-semibold transition-all ${
            activeTab === "staff"
              ? "bg-white shadow text-slate-900"
              : "text-slate-500 hover:text-slate-700"
          }`}
        >
          I am Staff
        </button>
      </div>

      {error ? (
        <Alert variant="error" className="mb-4">
          {error}
        </Alert>
      ) : null}

      {/* Show target role from invite validation */}
      {activeTab === "staff" && targetRole && schoolName ? (
        <div className="mb-4 rounded-lg bg-blue-50 border border-blue-200 px-4 py-2.5 text-sm text-blue-800">
          Joining as: <span className="font-semibold">{ROLE_LABELS[targetRole] ?? targetRole}</span>
        </div>
      ) : null}

      {validatingCode ? (
        <div className="text-center py-8 text-slate-500 text-sm">Validating invite code...</div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            placeholder="Full name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="bg-white/70 backdrop-blur border-white/50 focus:border-blue-400 focus:bg-white/80 transition-all"
          />
          <Input
            type="email"
            placeholder="Email address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="bg-white/70 backdrop-blur border-white/50 focus:border-blue-400 focus:bg-white/80 transition-all"
          />
          <Input
            placeholder="Phone number (optional)"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="bg-white/70 backdrop-blur border-white/50 focus:border-blue-400 focus:bg-white/80 transition-all"
          />

          {activeTab === "staff" ? (
            <Input
              placeholder="Invite code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              required
              disabled={!!inviteCode}
              className="bg-white/70 backdrop-blur border-white/50 focus:border-blue-400 focus:bg-white/80 transition-all font-mono tracking-wider"
            />
          ) : null}

          <Input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="bg-white/70 backdrop-blur border-white/50 focus:border-blue-400 focus:bg-white/80 transition-all"
          />
          <Input
            type="password"
            placeholder="Confirm password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            className="bg-white/70 backdrop-blur border-white/50 focus:border-blue-400 focus:bg-white/80 transition-all"
          />

          <Button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-xl shadow-lg transition-all focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <div className="flex items-center justify-center">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                Creating account...
              </div>
            ) : (
              `Create ${activeTab === "parent" ? "Parent" : "Staff"} Account`
            )}
          </Button>
        </form>
      )}

      <div className="mt-6 text-center text-sm">
        <Link href="/login" className="font-medium text-slate-600 hover:text-slate-900">
          Already have an account? Sign in
        </Link>
      </div>
    </JoinShell>
  );
}

function JoinShell({ children, schoolName }: { children: React.ReactNode; schoolName?: string | null }) {
  return (
    <main className="relative min-h-screen flex flex-col items-center justify-center py-8 px-2 bg-gradient-to-br from-[#b1c7f9] via-[#e0e7ff] to-[#b1f9e6] animate-gradient-move overflow-hidden">
      <div className="absolute -top-40 -left-40 w-[500px] h-[500px] bg-gradient-to-tr from-blue-300 via-purple-200 to-blue-100 rounded-full opacity-40 blur-3xl animate-pulse-slow" />
      <div className="absolute -bottom-32 right-0 w-[400px] h-[400px] bg-gradient-to-br from-blue-200 via-blue-100 to-purple-200 rounded-full opacity-30 blur-2xl animate-pulse-slow" />

      <div className="z-10 w-full max-w-md">
        <div className="text-center mb-8">
          <Image
            src="/logo-akademi.png"
            alt="Al Khayr Academy Logo"
            width={80}
            height={80}
            className="mx-auto mb-4"
          />
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Join {schoolName ? schoolName : "School"}
          </h1>
          <p className="text-gray-700 text-sm">
            Create your account to get started.
          </p>
        </div>

        <div className="bg-white/30 backdrop-blur-xl border border-white/40 rounded-2xl shadow-2xl p-8">
          {children}
        </div>
      </div>

      <footer className="z-20 w-full text-center text-sm text-gray-500 mt-8 pb-4">
        &copy; {new Date().getFullYear()} Akademi Al Khayr. Powered by Supabase &amp; Next.js.
      </footer>

      <style jsx global>{`
        @keyframes gradient-move {
          0%,
          100% {
            background-position: 0% 50%;
          }
          50% {
            background-position: 100% 50%;
          }
        }
        .animate-gradient-move {
          background-size: 200% 200%;
          animation: gradient-move 10s ease-in-out infinite;
        }
        .animate-pulse-slow {
          animation: pulse 8s cubic-bezier(0.4, 0, 0.6, 1) infinite;
        }
      `}</style>
    </main>
  );
}
