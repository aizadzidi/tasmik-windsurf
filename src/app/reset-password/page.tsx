"use client";
import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";

function ResetPasswordForm() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [validSession, setValidSession] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();

  const buildErrorMessage = (opts: {
    error?: string | null;
    errorCode?: string | null;
    errorDescription?: string | null;
  }) => {
    const { error, errorCode, errorDescription } = opts;
    if (errorCode === "otp_expired") {
      return "Reset link expired or already used. Please request a new one.";
    }
    if (errorCode === "access_denied" || error === "access_denied") {
      return errorDescription || "Access denied. Please request a new reset link.";
    }
    if (errorDescription) {
      return errorDescription;
    }
    return "Invalid or expired reset link. Please request a new password reset.";
  };

  useEffect(() => {
    const handlePasswordReset = async () => {
      console.log('Reset password page: Starting auth flow detection')
      const hashParams = new URLSearchParams(window.location.hash.substring(1));
      const errorParam = searchParams.get("error") || hashParams.get("error");
      const errorCode =
        searchParams.get("error_code") || hashParams.get("error_code");
      const errorDescription =
        searchParams.get("error_description") ||
        hashParams.get("error_description");

      if (errorParam || errorCode || errorDescription) {
        if (process.env.NODE_ENV !== "production") {
          console.log("Reset password page: Error params detected", {
            errorParam,
            errorCode,
            errorDescription,
            url: window.location.href,
          });
        }
        setError(
          buildErrorMessage({
            error: errorParam,
            errorCode,
            errorDescription,
          })
        );
        return;
      }
      
      // First check if we have a session already
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        console.log('Reset password page: Existing session found')
        setValidSession(true);
        return;
      }

      console.log('Reset password page: No existing session, checking URL parameters')
      console.log('Current URL:', window.location.href)

      // Check for PKCE code (from email links)
      const code = searchParams.get('code');
      if (code) {
        console.log('Reset password page: Found PKCE code, exchanging for session')
        try {
          const { data, error } = await supabase.auth.exchangeCodeForSession(code);
          if (!error && data.session) {
            console.log('Reset password page: PKCE code exchange successful')
            setValidSession(true);
            // Clean URL
            window.history.replaceState({}, document.title, window.location.pathname);
            return;
          } else {
            console.log('Reset password page: PKCE code exchange failed:', error)
          }
        } catch (err) {
          console.log('Reset password page: PKCE code exchange error:', err)
        }
      }

      // Check for token hash (legacy flow)
      const tokenHash = searchParams.get('token_hash');
      const type = searchParams.get('type');
      if (tokenHash && type === 'recovery') {
        console.log('Reset password page: Found token hash, verifying OTP')
        try {
          const { data, error } = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type: 'recovery',
          });
          if (!error && data.session) {
            console.log('Reset password page: Token hash verification successful')
            setValidSession(true);
            // Clean URL
            window.history.replaceState({}, document.title, window.location.pathname);
            return;
          } else {
            console.log('Reset password page: Token hash verification failed:', error)
          }
        } catch (err) {
          console.log('Reset password page: Token hash verification error:', err)
        }
      }

      // Check for URL hash parameters (traditional Supabase auth)
      const accessToken = hashParams.get('access_token');
      const refreshToken = hashParams.get('refresh_token');
      const hashType = hashParams.get('type');

      if (process.env.NODE_ENV !== "production") {
        console.log("Reset password page: URL params snapshot", {
          searchParams: Object.fromEntries(searchParams.entries()),
          hashParams: Object.fromEntries(hashParams.entries()),
        });
      }

      // Check for search parameters as additional fallback
      const accessTokenSearch = searchParams.get('access_token');
      const refreshTokenSearch = searchParams.get('refresh_token');

      console.log('Reset password page: Auth parameter check:', {
        hashAccessToken: !!accessToken,
        hashRefreshToken: !!refreshToken,
        hashType,
        searchAccessToken: !!accessTokenSearch,
        searchRefreshToken: !!refreshTokenSearch,
        searchType: type
      })

      if ((hashType === 'recovery' || type === 'recovery') && 
          (accessToken || accessTokenSearch) && 
          (refreshToken || refreshTokenSearch)) {
        console.log('Reset password page: Found access/refresh tokens, setting session')
        try {
          const { error } = await supabase.auth.setSession({
            access_token: accessToken || accessTokenSearch!,
            refresh_token: refreshToken || refreshTokenSearch!,
          });
          
          if (!error) {
            console.log('Reset password page: Session set successfully')
            setValidSession(true);
            // Clean URL
            window.history.replaceState({}, document.title, window.location.pathname);
            return;
          } else {
            console.log('Reset password page: Session setting failed:', error)
          }
        } catch (err) {
          console.log('Reset password page: Session setting error:', err)
        }
      }

      console.log('Reset password page: No valid auth parameters found, showing error')
      setError("Invalid or expired reset link. Please request a new password reset.");
    };

    // Add a small delay to ensure URL parameters are available
    const timer = setTimeout(handlePasswordReset, 100);
    return () => clearTimeout(timer);
  }, [searchParams]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      setLoading(false);
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters long.");
      setLoading(false);
      return;
    }

    try {
      const { error: updateError } = await supabase.auth.updateUser({
        password: password
      });

      if (updateError) {
        setError(updateError.message);
      } else {
        setSuccess(true);
        setTimeout(() => {
          router.push("/login");
        }, 3000);
      }
    } catch (err) {
      console.error('Password update error:', err);
      setError('Unexpected error. Please try again or contact support.');
    } finally {
      setLoading(false);
    }
  }

  if (!validSession && !error) {
    return (
      <main className="relative min-h-screen flex flex-col items-center justify-center py-8 px-2 bg-gradient-to-br from-[#b1c7f9] via-[#e0e7ff] to-[#b1f9e6]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-700">Validating reset link...</p>
        </div>
      </main>
    );
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
            {success ? "Password updated successfully!" : "Create a new password for your account."}
          </p>
        </div>
        
        {/* Glassmorphism Reset Card */}
        <div className="bg-white/30 backdrop-blur-xl border border-white/40 rounded-2xl shadow-2xl p-8">
          <div className="mb-6">
            <h2 className="text-xl font-bold text-gray-900 text-center">
              Reset Password
            </h2>
          </div>
          
          {!validSession ? (
            <div className="text-center space-y-4">
              <Alert variant="error" className="bg-red-100/80 border-red-300/50 backdrop-blur">
                {error}
              </Alert>
              
              <Link 
                href="/forgot-password"
                className="inline-block bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-6 rounded-xl shadow-lg transition-all"
              >
                Request New Reset Link
              </Link>
            </div>
          ) : success ? (
            <div className="text-center space-y-4">
              <div className="p-4 bg-green-100/80 border border-green-300/50 rounded-xl backdrop-blur">
                <div className="flex items-center justify-center mb-2">
                  <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <p className="text-green-800 font-medium">Password Updated!</p>
                <p className="text-green-700 text-sm mt-1">
                  Redirecting you to login page...
                </p>
              </div>
              
              <Link 
                href="/login"
                className="inline-block bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-6 rounded-xl shadow-lg transition-all"
              >
                Go to Login
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Input
                  type="password"
                  placeholder="New Password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  minLength={6}
                  className="bg-white/70 backdrop-blur border-white/50 focus:border-blue-400 focus:bg-white/80 transition-all"
                />
              </div>
              
              <div>
                <Input
                  type="password"
                  placeholder="Confirm New Password"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  required
                  minLength={6}
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
                    Updating...
                  </div>
                ) : (
                  "Update Password"
                )}
              </Button>
            </form>
          )}
          
          <div className="mt-6 text-center">
            <Link 
              href="/login"
              className="text-blue-600 hover:text-blue-700 font-medium transition-colors"
            >
              ← Back to Sign In
            </Link>
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

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={
      <main className="relative min-h-screen flex flex-col items-center justify-center py-8 px-2 bg-gradient-to-br from-[#b1c7f9] via-[#e0e7ff] to-[#b1f9e6]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-700">Loading...</p>
        </div>
      </main>
    }>
      <ResetPasswordForm />
    </Suspense>
  );
}
