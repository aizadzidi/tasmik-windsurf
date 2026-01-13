"use client";
import { useState } from "react";
// import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { supabaseRecovery } from "@/lib/supabaseRecoveryClient";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isSubmitted, setIsSubmitted] = useState(false);
  // const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");

    try {
      const { error: resetError } = await supabaseRecovery.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });

      if (resetError) {
        setError(resetError.message);
      } else {
        setMessage("Password reset email sent! Please check your inbox.");
        setIsSubmitted(true);
      }
    } catch (err) {
      console.error('Password reset error:', err);
      setError('Unexpected error. Please try again or contact support.');
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
            {isSubmitted ? "Check your email for reset instructions." : "Reset your password to continue."}
          </p>
        </div>
        
        {/* Glassmorphism Reset Card */}
        <div className="bg-white/30 backdrop-blur-xl border border-white/40 rounded-2xl shadow-2xl p-8">
          <div className="mb-6">
            <h2 className="text-xl font-bold text-gray-900 text-center">
              Forgot Password
            </h2>
          </div>
          
          {!isSubmitted ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Input
                  type="email"
                  placeholder="Enter your email address"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  className="bg-white/70 backdrop-blur border-white/50 focus:border-blue-400 focus:bg-white/80 transition-all"
                />
              </div>
              
              {error && (
                <Alert variant="error" className="bg-red-100/80 border-red-300/50 backdrop-blur">
                  {error}
                </Alert>
              )}
              
              {message && (
                <Alert variant="success" className="bg-green-100/80 border-green-300/50 backdrop-blur">
                  {message}
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
                    Sending...
                  </div>
                ) : (
                  "Send Reset Email"
                )}
              </Button>
            </form>
          ) : (
            <div className="text-center space-y-4">
              <div className="p-4 bg-green-100/80 border border-green-300/50 rounded-xl backdrop-blur">
                <div className="flex items-center justify-center mb-2">
                  <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <p className="text-green-800 font-medium">Email Sent!</p>
                <p className="text-green-700 text-sm mt-1">
                  We&apos;ve sent password reset instructions to {email}
                </p>
              </div>
              
              <Button 
                onClick={() => {
                  setIsSubmitted(false);
                  setEmail("");
                  setMessage("");
                }}
                className="w-full bg-gray-600 hover:bg-gray-700 text-white font-semibold py-3 rounded-xl shadow-lg transition-all"
              >
                Send Another Email
              </Button>
            </div>
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
