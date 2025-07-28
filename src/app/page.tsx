"use client";
import { useRouter } from "next/navigation";
import Image from "next/image";

export default function Home() {
  const router = useRouter();
  return (
    <main className="relative min-h-screen flex flex-col items-center justify-center py-8 px-2 bg-gradient-to-br from-[#b1c7f9] via-[#e0e7ff] to-[#b1f9e6] animate-gradient-move overflow-hidden">
      {/* Glassmorphism card */}
      <div className="z-10 max-w-2xl w-full bg-white/30 backdrop-blur-xl border border-white/40 rounded-3xl shadow-2xl p-10 flex flex-col items-center text-center">
        <Image
          src="/logo-akademi.png"
          alt="Al Khayr Academy Logo"
          width={150}
          height={150}
          className="mb-8"
        />
        <h1 className="text-6xl md:text-7xl font-extrabold text-gray-900 mb-6 tracking-tight leading-tight">
          Al Khayr <span className="text-blue-600">Tasmik</span>
        </h1>
        <p className="text-xl md:text-2xl text-gray-700 mb-10 max-w-2xl font-medium">
          Empowering parents and teachers to track Quran memorization and student progress with clarity and ease.
        </p>
        <button
          className="group bg-blue-600 hover:bg-blue-700 text-white font-semibold px-8 py-4 rounded-xl text-xl shadow-lg flex items-center gap-2 transition-all focus:outline-none focus:ring-2 focus:ring-blue-400"
          onClick={() => router.push("/login")}
        >
          Get Started / Login
          <svg className="w-6 h-6 ml-1 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
        </button>
      </div>
      {/* Animated Gradient Blobs */}
      <div className="absolute -top-40 -left-40 w-[500px] h-[500px] bg-gradient-to-tr from-blue-300 via-purple-200 to-blue-100 rounded-full opacity-40 blur-3xl animate-pulse-slow" />
      <div className="absolute -bottom-32 right-0 w-[400px] h-[400px] bg-gradient-to-br from-blue-200 via-blue-100 to-purple-200 rounded-full opacity-30 blur-2xl animate-pulse-slow" />
      {/* Footer */}
      <footer className="z-20 w-full text-center text-sm text-gray-500 mt-10 pb-4">
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
