"use client";
import { useRouter } from "next/navigation";

export default function Home() {
  const router = useRouter();
  return (
    <main className="min-h-screen bg-gradient-to-tr from-blue-100 via-blue-200 to-blue-100 flex items-center justify-center py-8 px-2">
      <div className="max-w-2xl w-full bg-white/80 rounded-xl shadow-xl p-8 flex flex-col items-center text-center">
        <h1 className="text-4xl font-bold text-gray-800 mb-4">Tasmik Dashboard</h1>
        <p className="text-lg text-gray-700 mb-6">
          Tasmik Dashboard is a modern platform for parents and teachers to monitor Quran memorization, track student progress, and communicate effectively. Easily view reports, analyze progress, and support your child's journey in Quranic learning—all in one place.
        </p>
        <button
          className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-8 py-3 rounded-lg text-lg shadow-md transition-colors"
          onClick={() => router.push("/login")}
        >
          Get Started / Login
        </button>
      </div>
    </main>
  );
}
