"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  const [name, setName] = useState("");
  const router = useRouter();

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
      const res = await fetch("/api/auth/ensure-profile", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: controller.signal,
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        console.warn("Ensure profile failed", payload?.error || res.statusText);
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        console.warn("Ensure profile timed out");
        return;
      }
      console.warn("Ensure profile failed", err);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      if (isSignUp) {
      // Sign up flow
      if (!name.trim()) {
        setError("Please enter your name.");
        setLoading(false);
        return;
      }
      const { data, error: signUpError } = await supabase.auth.signUp({ email, password });
      if (signUpError) {
        setError(signUpError.message);
        setLoading(false);
        return;
      }
      // Insert into users table as parent
      const userId = data.user?.id;
      if (userId) {
        const { error: dbError } = await supabase.from("users").insert([
          { id: userId, name, email, role: "parent" },
        ]);
        if (dbError) {
          setError(dbError.message);
          setLoading(false);
          return;
        }
      }
      const accessToken =
        data.session?.access_token ||
        (await supabase.auth.getSession()).data.session?.access_token;
      if (accessToken) {
        await ensureProfile(accessToken);
      }
      // Redirect to parent dashboard
      router.push("/parent");
    } else {
      // Login flow
      console.log('Attempting login with', email, '[password omitted]');
      const { data, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      console.log('signInWithPassword result:', { data, signInError });
      if (signInError) {
        setError(signInError.message);
        setLoading(false);
        return;
      }
      // Fetch user role
      const userId = data.user?.id;
      console.log('User ID after login:', userId);
      if (userId) {
        console.log('Looking up user in users table...');
        const { data: userData, error: userError } = await supabase
          .from("users")
          .select("role, name, email")
          .eq("id", userId)
          .single();
        if (userError || !userData) {
          console.log('User not found in users table, creating fallback...');
          // Fallback: If user exists in Auth but not in users table, create a default user as parent
          // This ensures login works for users created outside the sign-up flow
          const emailPrefix = email.split("@")[0];
          const { error: insertError } = await supabase.from("users").upsert(
            [{ id: userId, name: emailPrefix, email, role: "parent" }],
            { onConflict: "id", ignoreDuplicates: true }
          );
          console.log('Fallback user creation result:', { insertError });
          if (insertError) {
            setError("Login failed: Could not create user profile. Please contact admin.");
            setLoading(false);
            return;
          }
          const fallbackAccessToken =
            data.session?.access_token ||
            (await supabase.auth.getSession()).data.session?.access_token;
          if (fallbackAccessToken) {
            await ensureProfile(fallbackAccessToken);
          }
          console.log('Redirecting to /parent after fallback user creation');
          router.push("/parent");
          setLoading(false);
          return;
        }
        console.log('User found in users table:', userData);
        const accessToken =
          data.session?.access_token ||
          (await supabase.auth.getSession()).data.session?.access_token;
        if (accessToken) {
          await ensureProfile(accessToken);
        }
        // Redirect based on role
        if (userData.role === "admin") { console.log('Redirecting to /admin'); router.push("/admin"); }
        else if (userData.role === "teacher") { console.log('Redirecting to /teacher'); router.push("/teacher"); }
        else { console.log('Redirecting to /parent'); router.push("/parent"); }
      }
    }
    } catch (err) {
      // Catch-all for unexpected errors
      console.error('Login error:', err);
      setError('Unexpected error during login. Please try again or contact support.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="relative min-h-screen flex flex-col items-center justify-center py-8 px-2 bg-gradient-to-br from-[#b1c7f9] via-[#e0e7ff] to-[#b1f9e6] animate-gradient-move overflow-hidden">
      {/* Animated Gradient Blobs */}
      <div className="absolute -top-40 -left-40 w-[500px] h-[500px] bg-gradient-to-tr from-blue-300 via-purple-200 to-blue-100 rounded-full opacity-40 blur-3xl animate-pulse-slow" />
      <div className="absolute -bottom-32 right-0 w-[400px] h-[400px] bg-gradient-to-br from-blue-200 via-blue-100 to-purple-200 rounded-full opacity-30 blur-2xl animate-pulse-slow" />
      
      {/* Main Content */}
      <div className="z-10 w-full max-w-md">
        {/* Logo and Header */}
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
            Welcome back! Please sign in to continue.
          </p>
        </div>
        
        {/* Glassmorphism Login Card */}
        <div className="bg-white/30 backdrop-blur-xl border border-white/40 rounded-2xl shadow-2xl p-8">
          <div className="mb-6">
            <h2 className="text-xl font-bold text-gray-900 text-center">
              {isSignUp ? "Create Account" : "Sign In"}
            </h2>
          </div>
          
          <form onSubmit={handleSubmit} className="space-y-4">
            {isSignUp && (
              <div>
                <Input
                  type="text"
                  placeholder="Full Name"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  required
                  className="bg-white/70 backdrop-blur border-white/50 focus:border-blue-400 focus:bg-white/80 transition-all"
                />
              </div>
            )}
            <div>
              <Input
                type="email"
                placeholder="Email Address"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                className="bg-white/70 backdrop-blur border-white/50 focus:border-blue-400 focus:bg-white/80 transition-all"
              />
            </div>
            <div>
              <Input
                type="password"
                placeholder="Password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                className="bg-white/70 backdrop-blur border-white/50 focus:border-blue-400 focus:bg-white/80 transition-all"
              />
            </div>
            
            {error && (
              <Alert variant="error" className="bg-red-100/80 border-red-300/50 backdrop-blur">
                {error}
              </Alert>
            )}
            
            <Button 
              type="submit" 
              disabled={loading} 
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-xl shadow-lg transition-all focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <div className="flex items-center justify-center">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Processing...
                </div>
              ) : (
                isSignUp ? "Create Account" : "Sign In"
              )}
            </Button>
          </form>
          
          <div className="mt-6 text-center space-y-3">
            <button
              type="button"
              onClick={() => setIsSignUp(!isSignUp)}
              className="text-blue-600 hover:text-blue-700 font-medium transition-colors block w-full"
            >
              {isSignUp ? "Already have an account? Sign In" : "Don't have an account? Sign Up"}
            </button>
            
            {!isSignUp && (
              <Link 
                href="/forgot-password"
                className="text-blue-600 hover:text-blue-700 font-medium transition-colors block text-sm"
              >
                Forgot your password?
              </Link>
            )}
          </div>
        </div>
      </div>
      
      {/* Footer */}
      <footer className="z-20 w-full text-center text-sm text-gray-500 mt-8 pb-4">
        © {new Date().getFullYear()} Akademi Al Khayr. Powered by Supabase & Next.js.
      </footer>
      
      {/* Tailwind custom animation */}
      <style jsx global>{`
        @keyframes gradient-move {
          0%, 100% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
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
