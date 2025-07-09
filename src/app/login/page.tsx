"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

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
      // Redirect to parent dashboard
      router.push("/parent");
    } else {
      // Login flow
      const { data, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) {
        setError(signInError.message);
        setLoading(false);
        return;
      }
      // Fetch user role
      const userId = data.user?.id;
      if (userId) {
        const { data: userData, error: userError } = await supabase
          .from("users")
          .select("role")
          .eq("id", userId)
          .single();
        if (userError || !userData) {
          setError("User role not found.");
          setLoading(false);
          return;
        }
        // Redirect based on role
        if (userData.role === "admin") router.push("/admin");
        else if (userData.role === "teacher") router.push("/teacher");
        else router.push("/parent");
      }
    }
    setLoading(false);
  }

  return (
    <main className="min-h-screen flex items-center justify-center" style={{ background: "radial-gradient(ellipse at top left, #7c3aed 0%, #0ea5e9 100%)" }}>
      <div className="w-full max-w-md">
        <Alert variant="info" className="mb-6 shadow-md">
          <div className="font-semibold text-lg mb-1">Selamat Datang ke Dashboard Ibu Bapa!</div>
          <div>
            Sistem ini membolehkan ibu bapa memantau prestasi hafazan dan pembelajaran anak-anak mereka secara langsung. Daftar atau log masuk untuk melihat laporan, perkembangan, dan maklumat terkini dari guru.
          </div>
        </Alert>
        <Card className="shadow-2xl">
          <CardHeader>
            <CardTitle>{isSignUp ? "Sign Up" : "Login"}</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
        {isSignUp && (
  <Input
    type="text"
    placeholder="Name"
    value={name}
    onChange={e => setName(e.target.value)}
    required
  />
)}
<Input
  type="email"
  placeholder="Email"
  value={email}
  onChange={e => setEmail(e.target.value)}
  required
/>
<Input
  type="password"
  placeholder="Password"
  value={password}
  onChange={e => setPassword(e.target.value)}
  required
/>
{error && (
  <Alert variant="error" className="mt-2">{error}</Alert>
)}
<Button type="submit" disabled={loading} className="w-full">
  {loading ? "Processing..." : isSignUp ? "Sign Up" : "Login"}
</Button>
      </form>
      <div className="mt-4 text-center">
  <Button variant="link" type="button" onClick={() => setIsSignUp(!isSignUp)}>
    {isSignUp ? "Already have an account? Login" : "Don't have an account? Sign Up"}
  </Button>
</div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

