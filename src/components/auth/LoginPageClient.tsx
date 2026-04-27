"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Monitor, School, UsersRound, UserRound } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { Modal } from "@/components/ui/Modal";

type LoginPageClientProps = {
  tenantBaseDomain: string;
};

type AccountModalStep = "signupPath" | "onlineType";

function isTenantHost(hostname: string, tenantBaseDomain: string): boolean {
  const host = hostname.toLowerCase();
  if (host === "class.akademialkhayr.com") return true;
  if (host === "localhost" || host === "127.0.0.1") return true;
  if (host === tenantBaseDomain) return false;
  return host.endsWith(`.${tenantBaseDomain}`);
}

export default function LoginPageClient({
  tenantBaseDomain,
}: LoginPageClientProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [tenantHostDetected, setTenantHostDetected] = useState(false);
  const [accountModalOpen, setAccountModalOpen] = useState(false);
  const [accountModalStep, setAccountModalStep] = useState<AccountModalStep>("signupPath");
  const router = useRouter();

  useEffect(() => {
    if (typeof window === "undefined") return;
    setTenantHostDetected(isTenantHost(window.location.hostname, tenantBaseDomain));
  }, [tenantBaseDomain]);

  useEffect(() => {
    router.prefetch("/join/campus");
    router.prefetch("/join/student");
    router.prefetch("/join/family");
  }, [router]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const searchParams = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const authType = searchParams.get("type") || hashParams.get("type");
    const hasRecoveryTokens =
      searchParams.has("code") ||
      searchParams.has("token_hash") ||
      searchParams.has("access_token") ||
      hashParams.has("access_token") ||
      hashParams.has("refresh_token");

    if (authType === "recovery" && hasRecoveryTokens) {
      const resetUrl = new URL("/reset-password", window.location.origin);
      resetUrl.search = window.location.search;
      resetUrl.hash = window.location.hash;
      window.location.replace(resetUrl.toString());
    }
  }, []);

  async function ensureProfile(accessToken: string) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    try {
      await fetch("/api/auth/ensure-profile", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: controller.signal,
      });
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      console.warn("Ensure profile failed", err);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async function routeByRole(userId: string, fallbackEmail: string, accessToken: string | null) {
    const { data: userData, error: userError } = await supabase
      .from("users")
      .select("role, name, email")
      .eq("id", userId)
      .maybeSingle();

    if (userError || !userData) {
      const fallbackName = fallbackEmail.split("@")[0];
      const { error: insertError } = await supabase.from("users").upsert(
        [{ id: userId, name: fallbackName, email: fallbackEmail, role: "parent" }],
        { onConflict: "id", ignoreDuplicates: true }
      );
      if (insertError) {
        throw new Error("Could not create user profile.");
      }
      if (accessToken) {
        await ensureProfile(accessToken);
      }
      router.push("/parent");
      return;
    }

    if (accessToken) {
      await ensureProfile(accessToken);
    }

    if (userData.role === "admin") {
      router.push("/admin");
      return;
    }
    if (userData.role === "teacher") {
      router.push("/teacher");
      return;
    }
    if (userData.role === "general_worker") {
      router.push("/staff");
      return;
    }
    if (userData.role === "student") {
      router.push("/student");
      return;
    }
    router.push("/parent");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (signInError) {
        const normalized = signInError.message.toLowerCase();
        if (normalized.includes("confirm") || normalized.includes("verify")) {
          setError("Email not verified. Please verify your account before signing in.");
          return;
        }
        setError(signInError.message);
        return;
      }

      const userId = data.user?.id;
      if (!userId) {
        setError("Unable to determine authenticated user.");
        return;
      }

      const accessToken =
        data.session?.access_token ||
        (await supabase.auth.getSession()).data.session?.access_token ||
        null;
      await routeByRole(userId, email, accessToken);
    } catch (err) {
      console.error("Login flow failed", err);
      setError("Unexpected error during login. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  function openAccountModal() {
    setAccountModalStep("signupPath");
    setAccountModalOpen(true);
  }

  function closeAccountModal() {
    setAccountModalOpen(false);
    setAccountModalStep("signupPath");
  }

  function handleAccountChoice(path: "/join/campus" | "/join/student" | "/join/family") {
    setAccountModalOpen(false);
    router.push(path);
  }

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
            Al Khayr <span className="text-blue-600">Class</span>
          </h1>
          <p className="text-sm text-slate-600">
            Welcome back! Please sign in to continue.
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.08)] sm:p-7">
          <div className="mb-6 text-center">
            <h2 className="text-xl font-semibold text-slate-950">
              Sign In
            </h2>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              type="email"
              placeholder="Email Address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="h-12 rounded-lg border-slate-200 bg-slate-50 px-4 text-base focus-visible:ring-blue-500"
            />

            <Input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="h-12 rounded-lg border-slate-200 bg-slate-50 px-4 text-base focus-visible:ring-blue-500"
            />

            {error ? (
              <Alert variant="error">
                {error}
              </Alert>
            ) : null}

            <Button
              type="submit"
              disabled={loading}
              className="h-12 w-full rounded-lg bg-blue-600 text-base font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? (
                <div className="flex items-center justify-center">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                  Processing...
                </div>
              ) : (
                "Sign In"
              )}
            </Button>
          </form>

          <div className="mt-6 text-center space-y-3">
            <Link
              href="/forgot-password"
              className="block text-sm font-medium text-blue-600 transition-colors hover:text-blue-700"
            >
              Forgot your password?
            </Link>

            {tenantHostDetected ? (
              <button
                type="button"
                onClick={openAccountModal}
                className="inline-flex w-full items-center justify-center rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-800 transition hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
              >
                Create Account
              </button>
            ) : null}
          </div>
        </div>

        <footer className="mt-8 text-center text-sm text-slate-500">
          &copy; {new Date().getFullYear()} Akademi Al Khayr. Powered by Supabase &amp; Next.js.
        </footer>
      </div>

      <Modal
        open={accountModalOpen}
        title={accountModalStep === "signupPath" ? "Create Account" : "Online Account"}
        description={
          accountModalStep === "signupPath"
            ? "Choose the right signup path."
            : "Choose who this account is for."
        }
        onClose={closeAccountModal}
      >
        <div className="min-h-[188px] transition-all duration-200 ease-out">
          {accountModalStep === "signupPath" ? (
            <div className="grid gap-3 animate-in fade-in slide-in-from-right-2 duration-200">
              <button
                type="button"
                onClick={() => handleAccountChoice("/join/campus")}
                className="group flex w-full items-center gap-4 rounded-lg border border-slate-200 bg-white p-4 text-left transition hover:border-blue-200 hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-700 group-hover:bg-white">
                  <School className="size-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-slate-950">Campus</span>
                  <span className="mt-1 block text-sm text-slate-600">
                    Parent account or invited staff signup.
                  </span>
                </span>
                <ArrowRight className="size-4 shrink-0 text-slate-400 group-hover:text-blue-700" />
              </button>

              <button
                type="button"
                onClick={() => setAccountModalStep("onlineType")}
                className="group flex w-full items-center gap-4 rounded-lg border border-slate-200 bg-white p-4 text-left transition hover:border-emerald-200 hover:bg-emerald-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700 group-hover:bg-white">
                  <Monitor className="size-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-slate-950">Online</span>
                  <span className="mt-1 block text-sm text-slate-600">
                    Student or family online learning account.
                  </span>
                </span>
                <ArrowRight className="size-4 shrink-0 text-slate-400 group-hover:text-emerald-700" />
              </button>
            </div>
          ) : (
            <div className="grid gap-3 animate-in fade-in slide-in-from-right-2 duration-200">
              <button
                type="button"
                onClick={() => setAccountModalStep("signupPath")}
                className="mb-1 inline-flex w-fit items-center gap-2 rounded-lg px-2 py-1 text-sm font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                <ArrowLeft className="size-4" />
                Back
              </button>

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
          )}
        </div>
      </Modal>
    </main>
  );
}
