"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { ArrowRight, UsersRound, UserRound } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { Modal } from "@/components/ui/Modal";

type JoinPageClientProps = {
  inviteCode?: string;
};

type TabRole = "parent" | "staff";

const ROLE_LABELS: Record<string, string> = {
  teacher: "Teacher",
  general_worker: "General Worker",
};

export default function JoinPageClient({ inviteCode }: JoinPageClientProps) {
  return inviteCode ? <CampusSignupForm inviteCode={inviteCode} /> : <JoinChoiceScreen />;
}

export function CampusJoinPageClient() {
  return <CampusSignupForm />;
}

function JoinChoiceScreen() {
  const router = useRouter();
  const [accountModalOpen, setAccountModalOpen] = useState(true);

  function handleAccountChoice(path: "/join/student" | "/join/family") {
    setAccountModalOpen(false);
    router.push(path);
  }

  return (
    <JoinShell
      title="Create Your Account"
      description="Choose the account type that matches how you want to manage online learning."
    >
      <div className="space-y-4 text-center">
        <Button
          type="button"
          onClick={() => setAccountModalOpen(true)}
          className="h-11 w-full rounded-lg bg-blue-600 font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 focus-visible:ring-blue-500"
        >
          Choose Account Type
        </Button>

        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
          Staff members should use the invite link provided by an admin.
        </div>

        <div className="text-center text-sm">
          <Link href="/login" className="font-medium text-slate-600 hover:text-slate-900">
            Already have an account? Sign in
          </Link>
        </div>
      </div>

      <Modal
        open={accountModalOpen}
        title="Online Account"
        description="Choose who this account is for."
        onClose={() => setAccountModalOpen(false)}
      >
        <div className="grid gap-3">
          <button
            type="button"
            onClick={() => handleAccountChoice("/join/student")}
            className="group flex w-full items-center gap-4 rounded-lg border border-slate-200 bg-white p-4 text-left transition hover:border-blue-200 hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-700 group-hover:bg-white">
              <UserRound className="size-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-slate-950">Individual</span>
              <span className="mt-1 block text-sm text-slate-600">
                Student account for someone registering for themselves.
              </span>
            </span>
            <ArrowRight className="size-4 shrink-0 text-slate-400 group-hover:text-blue-700" />
          </button>

          <button
            type="button"
            onClick={() => handleAccountChoice("/join/family")}
            className="group flex w-full items-center gap-4 rounded-lg border border-slate-200 bg-white p-4 text-left transition hover:border-emerald-200 hover:bg-emerald-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700 group-hover:bg-white">
              <UsersRound className="size-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-slate-950">Family</span>
              <span className="mt-1 block text-sm text-slate-600">
                Register children or manage multiple learners.
              </span>
            </span>
            <ArrowRight className="size-4 shrink-0 text-slate-400 group-hover:text-emerald-700" />
          </button>
        </div>
      </Modal>
    </JoinShell>
  );
}

function CampusSignupForm({ inviteCode }: { inviteCode?: string }) {
  const initialRole: TabRole = inviteCode ? "staff" : "parent";

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
      <JoinShell title="Account created" description="You can now continue to sign in.">
        <div className="space-y-4 rounded-lg border border-emerald-200 bg-emerald-50 p-6 text-emerald-900">
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
    <JoinShell
      schoolName={schoolName}
      title={inviteCode ? `Join ${schoolName ? schoolName : "School"}` : "Parent & Staff Signup"}
      description={
        inviteCode
          ? "Create your account to get started."
          : "Use this page for parent accounts or invited staff only."
      }
    >
      {!inviteCode ? (
        <div className="mb-5 rounded-lg border border-blue-200 bg-blue-50 px-4 py-4 text-sm text-blue-900">
          <p className="font-semibold">Online signup?</p>
          <p className="mt-1 text-blue-800">
            Student and family online signup uses a separate flow with optional claim code support.
          </p>
          <Link href="/join" className="mt-3 inline-block">
            <Button
              type="button"
              variant="outline"
              className="rounded-lg border-blue-200 bg-white text-blue-700 hover:bg-blue-100"
            >
              Go to Online Signup
            </Button>
          </Link>
        </div>
      ) : null}

      {/* Tab switcher */}
      <div className="mb-6 flex rounded-lg bg-slate-100 p-1">
        <button
          type="button"
          onClick={() => switchTab("parent")}
          className={`flex-1 rounded-md py-2.5 text-sm font-semibold transition-all ${
            activeTab === "parent"
              ? "bg-white shadow-sm text-slate-900"
              : "text-slate-500 hover:text-slate-700"
          }`}
        >
          I am a Parent
        </button>
        <button
          type="button"
          onClick={() => switchTab("staff")}
          className={`flex-1 rounded-md py-2.5 text-sm font-semibold transition-all ${
            activeTab === "staff"
              ? "bg-white shadow-sm text-slate-900"
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
        <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm text-blue-800">
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
            className="h-11 rounded-lg border-slate-200 bg-slate-50 px-4 focus-visible:ring-blue-500"
          />
          <Input
            type="email"
            placeholder="Email address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="h-11 rounded-lg border-slate-200 bg-slate-50 px-4 focus-visible:ring-blue-500"
          />
          <Input
            placeholder="Phone number (optional)"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="h-11 rounded-lg border-slate-200 bg-slate-50 px-4 focus-visible:ring-blue-500"
          />

          {activeTab === "staff" ? (
            <Input
              placeholder="Invite code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              required
              disabled={!!inviteCode}
              className="h-11 rounded-lg border-slate-200 bg-slate-50 px-4 font-mono tracking-wider focus-visible:ring-blue-500"
            />
          ) : null}

          <Input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="h-11 rounded-lg border-slate-200 bg-slate-50 px-4 focus-visible:ring-blue-500"
          />
          <Input
            type="password"
            placeholder="Confirm password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            className="h-11 rounded-lg border-slate-200 bg-slate-50 px-4 focus-visible:ring-blue-500"
          />

          <Button
            type="submit"
            disabled={loading}
            className="h-11 w-full rounded-lg bg-blue-600 font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
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

export function JoinShell({
  children,
  schoolName,
  title,
  description,
}: {
  children: React.ReactNode;
  schoolName?: string | null;
  title?: string;
  description?: string;
}) {
  return (
    <JoinShellFrame schoolName={schoolName} title={title} description={description}>
      {children}
    </JoinShellFrame>
  );
}

function JoinShellFrame({
  children,
  schoolName,
  title,
  description,
}: {
  children: React.ReactNode;
  schoolName?: string | null;
  title?: string;
  description?: string;
}) {
  return (
    <main className="min-h-screen bg-[#f5f7fb] px-4 py-8 text-slate-900">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-md flex-col justify-center">
        <div className="mb-7 text-center">
          <Image
            src="/logo-akademi.png"
            alt="Al Khayr Academy Logo"
            width={72}
            height={72}
            className="mx-auto mb-5"
          />
          <h1 className="mb-2 text-3xl font-semibold tracking-tight text-slate-950">
            {title ?? `Join ${schoolName ? schoolName : "School"}`}
          </h1>
          <p className="text-sm leading-6 text-slate-600">
            {description ?? "Create your account to get started."}
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.08)] sm:p-7">
          {children}
        </div>

        <footer className="mt-8 text-center text-sm text-slate-500">
          &copy; {new Date().getFullYear()} Akademi Al Khayr. Powered by Supabase &amp; Next.js.
        </footer>
      </div>
    </main>
  )
}
