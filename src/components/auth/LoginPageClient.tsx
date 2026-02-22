"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";

type LoginPageClientProps = {
  enableLegacySignup: boolean;
  tenantBaseDomain: string;
};

function isTenantHost(hostname: string, tenantBaseDomain: string): boolean {
  const host = hostname.toLowerCase();
  if (host === "class.akademialkhayr.com") return true;
  if (host === tenantBaseDomain) return false;
  return host.endsWith(`.${tenantBaseDomain}`);
}

export default function LoginPageClient({
  enableLegacySignup,
  tenantBaseDomain,
}: LoginPageClientProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  const [tenantHostDetected, setTenantHostDetected] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (typeof window === "undefined") return;
    setTenantHostDetected(isTenantHost(window.location.hostname, tenantBaseDomain));
  }, [tenantBaseDomain]);

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

  const canShowLegacySignup = useMemo(
    () => enableLegacySignup && isSignUp,
    [enableLegacySignup, isSignUp]
  );

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
    router.push("/parent");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setInfo("");

    try {
      if (canShowLegacySignup) {
        if (!name.trim()) {
          setError("Please enter your name.");
          return;
        }

        const { data, error: signUpError } = await supabase.auth.signUp({ email, password });
        if (signUpError) {
          setError(signUpError.message);
          return;
        }

        const userId = data.user?.id;
        if (userId) {
          const { error: dbError } = await supabase.from("users").insert([
            { id: userId, name: name.trim(), email, role: "parent" },
          ]);
          if (dbError) {
            setError(dbError.message);
            return;
          }
        }

        if (!data.session) {
          setInfo("Please verify your email before signing in.");
          return;
        }

        const accessToken =
          data.session?.access_token ||
          (await supabase.auth.getSession()).data.session?.access_token ||
          null;
        if (accessToken) {
          await ensureProfile(accessToken);
        }
        router.push("/parent");
        return;
      }

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
            Al Khayr <span className="text-blue-600">Class</span>
          </h1>
          <p className="text-gray-700 text-sm">
            {canShowLegacySignup
              ? "Create your account to continue."
              : "Welcome back! Please sign in to continue."}
          </p>
        </div>

        <div className="bg-white/30 backdrop-blur-xl border border-white/40 rounded-2xl shadow-2xl p-8">
          <div className="mb-6">
            <h2 className="text-xl font-bold text-gray-900 text-center">
              {canShowLegacySignup ? "Create Account" : "Sign In"}
            </h2>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {canShowLegacySignup ? (
              <Input
                type="text"
                placeholder="Full Name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="bg-white/70 backdrop-blur border-white/50 focus:border-blue-400 focus:bg-white/80 transition-all"
              />
            ) : null}

            {info ? (
              <div className="rounded-lg bg-blue-50 border border-blue-200 px-3 py-2 text-sm text-blue-800">
                {info}
              </div>
            ) : null}

            <Input
              type="email"
              placeholder="Email Address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="bg-white/70 backdrop-blur border-white/50 focus:border-blue-400 focus:bg-white/80 transition-all"
            />

            <Input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="bg-white/70 backdrop-blur border-white/50 focus:border-blue-400 focus:bg-white/80 transition-all"
            />

            {error ? (
              <Alert variant="error" className="bg-red-100/80 border-red-300/50 backdrop-blur">
                {error}
              </Alert>
            ) : null}

            <Button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-xl shadow-lg transition-all focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <div className="flex items-center justify-center">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                  Processing...
                </div>
              ) : canShowLegacySignup ? (
                "Create Account"
              ) : (
                "Sign In"
              )}
            </Button>
          </form>

          <div className="mt-6 text-center space-y-3">
            {enableLegacySignup ? (
              <button
                type="button"
                onClick={() => setIsSignUp((prev) => !prev)}
                className="text-blue-600 hover:text-blue-700 font-medium transition-colors block w-full"
              >
                {canShowLegacySignup
                  ? "Already have an account? Sign In"
                  : "Need an account? Use legacy sign up"}
              </button>
            ) : (
              <p className="text-sm text-gray-600">
                School onboarding is available at{" "}
                <Link href="/signup" className="font-medium text-blue-600 hover:text-blue-700">
                  /signup
                </Link>
                .
              </p>
            )}

            {!canShowLegacySignup ? (
              <Link
                href="/forgot-password"
                className="text-blue-600 hover:text-blue-700 font-medium transition-colors block text-sm"
              >
                Forgot your password?
              </Link>
            ) : null}

            {!canShowLegacySignup && tenantHostDetected ? (
              <Link
                href="/parent-signup"
                className="text-emerald-700 hover:text-emerald-800 font-medium transition-colors block text-sm"
              >
                Parent? Create your account on this school
              </Link>
            ) : null}
          </div>
        </div>
      </div>

      <footer className="z-20 w-full text-center text-sm text-gray-500 mt-8 pb-4">
        © {new Date().getFullYear()} Akademi Al Khayr. Powered by Supabase &amp; Next.js.
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

