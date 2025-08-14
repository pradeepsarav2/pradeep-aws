import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

export default function Auth() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    document.title = mode === "signin" ? "Login - Personal Dashboard" : "Sign up - Personal Dashboard";
    const meta = document.querySelector('meta[name="description"]');
    if (meta) meta.setAttribute("content", "Secure login and signup for Personal Dashboard.");
  }, [mode]);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) navigate("/", { replace: true });
    });
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) navigate("/", { replace: true });
    });
    return () => subscription.unsubscribe();
  }, [navigate]);

  const signIn = async () => {
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      toast({ title: "Login failed", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Welcome back", description: "You're now signed in." });
      navigate("/", { replace: true });
    }
  };

  const signUp = async () => {
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${window.location.origin}/` },
    });
    setLoading(false);
    if (error) {
      toast({ title: "Signup failed", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Check your email", description: "Confirm your email to finish sign up." });
    }
  };


  return (
    <main className="min-h-screen grid place-items-center px-4">
      <article className="w-full max-w-md">
        <h1 className="sr-only">Account Authentication</h1>
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">
              {mode === "signin" ? "Sign in to your account" : "Create your account"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" onKeyDown={(e) => e.key === 'Enter' && (mode === 'signin' ? signIn() : signUp())} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" onKeyDown={(e) => e.key === 'Enter' && (mode === 'signin' ? signIn() : signUp())} />
            </div>
            {mode === "signin" ? (
              <Button className="w-full" onClick={signIn} disabled={loading}>Sign In</Button>
            ) : (
              <Button className="w-full" onClick={signUp} disabled={loading}>Create account</Button>
            )}

            <div className="text-center text-sm text-muted-foreground">
              {mode === "signin" ? (
                <button className="underline underline-offset-4" onClick={() => setMode("signup")}>Need an account? Sign up</button>
              ) : (
                <button className="underline underline-offset-4" onClick={() => setMode("signin")}>Already have an account? Sign in</button>
              )}
            </div>
          </CardContent>
        </Card>
      </article>
    </main>
  );
}
