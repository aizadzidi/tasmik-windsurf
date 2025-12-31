"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

export default function Home() {
  const router = useRouter();
  const [billingCycle, setBillingCycle] = useState<"monthly" | "annual">("monthly");

  const pricingCopy = useMemo(() => {
    if (billingCycle === "monthly") {
      return {
        starter: "$21.00",
        growth: "$64.00",
        enterprise: "$170.00+",
        note: "/month",
        subnote: "Billed monthly. Cancel anytime.",
      };
    }
    return {
      starter: "$17.43",
      growth: "$51.20",
      enterprise: "$136.00+",
      note: "/month",
      subnote: "Billed annually. Save 17% on Starter, 20% on Growth & Enterprise.",
    };
  }, [billingCycle]);
  return (
    <main className="relative min-h-screen bg-gradient-to-br from-[#b1c7f9] via-[#e0e7ff] to-[#b1f9e6] animate-gradient-move overflow-hidden">
      <div className="z-10 mx-auto w-full max-w-6xl px-4 pb-16 pt-10">
        {/* Glassmorphism card */}
        <div className="mx-auto max-w-2xl w-full bg-white/30 backdrop-blur-xl border border-white/40 rounded-3xl shadow-2xl p-10 flex flex-col items-center text-center">
          <h1 className="text-6xl md:text-7xl font-extrabold text-gray-900 mb-6 tracking-tight leading-tight">
            eClazz
          </h1>
          <p className="text-xl md:text-2xl text-gray-700 mb-10 max-w-2xl font-medium">
            A modern, secure academic management platform for schools and families.
          </p>
          <div className="flex flex-col gap-4 sm:flex-row sm:justify-center">
            <button
              className="group bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-8 py-4 rounded-xl text-xl shadow-lg flex items-center gap-2 transition-all focus:outline-none focus:ring-2 focus:ring-emerald-400"
              onClick={() => router.push("/signup")}
            >
              Sign Up Your School
              <svg className="w-6 h-6 ml-1 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
            </button>
            <button
              className="bg-white/70 hover:bg-white text-gray-900 font-semibold px-8 py-4 rounded-xl text-xl shadow-lg transition-all focus:outline-none focus:ring-2 focus:ring-blue-300"
              onClick={() => router.push("/login")}
            >
              Login
            </button>
          </div>
        </div>

        <section className="mt-14 rounded-3xl border border-white/60 bg-white/60 p-8 shadow-xl backdrop-blur">
          <div className="flex flex-col gap-4 text-center">
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-emerald-700">
              Pricing Plan
            </p>
            <h2 className="text-3xl font-semibold text-gray-900">Choose the right plan</h2>
            <p className="text-gray-600">
              Transparent monthly pricing for growing schools worldwide.
            </p>
          </div>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <button
              className={`rounded-full px-4 py-2 text-xs font-semibold transition ${
                billingCycle === "monthly"
                  ? "bg-emerald-600 text-white"
                  : "bg-white text-slate-600"
              }`}
              onClick={() => setBillingCycle("monthly")}
            >
              Monthly
            </button>
            <button
              className={`rounded-full px-4 py-2 text-xs font-semibold transition ${
                billingCycle === "annual"
                  ? "bg-emerald-600 text-white"
                  : "bg-white text-slate-600"
              }`}
              onClick={() => setBillingCycle("annual")}
            >
              Annual (Save up to 20%)
            </button>
            <p className="text-xs text-slate-500">{pricingCopy.subnote}</p>
          </div>
          <div className="mt-8 grid gap-6 md:grid-cols-3">
            <div className="rounded-2xl border border-emerald-100 bg-white p-6 shadow-md">
              <p className="text-sm font-semibold text-emerald-700">Starter</p>
              <p className="mt-2 text-3xl font-semibold text-gray-900">{pricingCopy.starter}</p>
              <p className="text-sm text-gray-500">
                {pricingCopy.note} (up to 100 students)
              </p>
              <ul className="mt-4 space-y-2 text-sm text-gray-600">
                <li>School onboarding</li>
                <li>Core attendance & reporting</li>
                <li>Email support</li>
              </ul>
              <button
                className="mt-6 w-full rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
                onClick={() => router.push("/signup")}
              >
                Get Started
              </button>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-emerald-50 p-6 shadow-lg">
              <div className="inline-flex rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
                Most popular
              </div>
              <p className="mt-3 text-sm font-semibold text-emerald-700">Growth</p>
              <p className="mt-2 text-3xl font-semibold text-gray-900">{pricingCopy.growth}</p>
              <p className="text-sm text-gray-500">
                {pricingCopy.note} (up to 500 students)
              </p>
              <ul className="mt-4 space-y-2 text-sm text-gray-600">
                <li>Everything in Starter</li>
                <li>School-based payment gateway</li>
                <li>Automated notifications</li>
              </ul>
              <button
                className="mt-6 w-full rounded-xl bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800"
                onClick={() => router.push("/signup")}
              >
                Choose Growth
              </button>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-md">
              <p className="text-sm font-semibold text-emerald-700">Enterprise</p>
              <p className="mt-2 text-3xl font-semibold text-gray-900">{pricingCopy.enterprise}</p>
              <p className="text-sm text-gray-500">
                {pricingCopy.note} (1,000+ students)
              </p>
              <ul className="mt-4 space-y-2 text-sm text-gray-600">
                <li>Custom domain + branding</li>
                <li>Dedicated support</li>
                <li>Advanced analytics</li>
              </ul>
              <button
                className="mt-6 w-full rounded-xl border border-gray-900 px-4 py-2 text-sm font-semibold text-gray-900 hover:bg-gray-900 hover:text-white"
                onClick={() => router.push("/signup")}
              >
                Talk to Sales
              </button>
            </div>
          </div>
        </section>
      </div>
      {/* Animated Gradient Blobs */}
      <div className="absolute -top-40 -left-40 w-[500px] h-[500px] bg-gradient-to-tr from-blue-300 via-purple-200 to-blue-100 rounded-full opacity-40 blur-3xl animate-pulse-slow" />
      <div className="absolute -bottom-32 right-0 w-[400px] h-[400px] bg-gradient-to-br from-blue-200 via-blue-100 to-purple-200 rounded-full opacity-30 blur-2xl animate-pulse-slow" />
      {/* Footer */}
      <footer className="z-20 w-full text-center text-sm text-gray-500 mt-4 pb-6">
        © {new Date().getFullYear()} Akademi Al Khayr. Powered by Supabase &amp; Next.js.
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
