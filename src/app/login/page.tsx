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
          const { error: insertError } = await supabase.from("users").insert([
            { id: userId, name: emailPrefix, email, role: "parent" },
          ]);
          console.log('Fallback user creation result:', { insertError });
          if (insertError) {
            setError("Login failed: Could not create user profile. Please contact admin.");
            setLoading(false);
            return;
          }
          console.log('Redirecting to /parent after fallback user creation');
          router.push("/parent");
          setLoading(false);
          return;
        }
        console.log('User found in users table:', userData);
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
    <main className="min-h-screen flex items-center justify-center" style={{ background: "radial-gradient(ellipse at top left, #7c3aed 0%, #0ea5e9 100%)" }}>
      <div className="w-full max-w-md">
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

