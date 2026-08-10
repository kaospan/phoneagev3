import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabaseClient";
import { checkIsAdminAccount } from "@/lib/adminAccount";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GoogleSignInButton } from "@/components/GoogleSignInButton";
import { LogOut } from "lucide-react";

/**
 * Gates /mapper behind a real Supabase Auth session AND admin_users membership. Player
 * accounts (self-serve signup on the main game) use the SAME Supabase project, so a valid
 * email/password alone isn't enough — any player could otherwise type their own credentials
 * in here. admin_users membership is checked server-side (RLS only lets a user read their
 * own row), so it can't be spoofed from the client either.
 */
export function MapperAuthGate({ children }: { children: ReactNode }) {
    const [session, setSession] = useState<Session | null>(null);
    const [loading, setLoading] = useState(true);
    const [isAdmin, setIsAdmin] = useState(false);
    const [checkingAdmin, setCheckingAdmin] = useState(false);
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [info, setInfo] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const [resetMode, setResetMode] = useState(false);

    useEffect(() => {
        if (!supabase) {
            setLoading(false);
            return;
        }
        supabase.auth.getSession().then(({ data }) => {
            setSession(data.session);
            setLoading(false);
        });
        const { data: subscription } = supabase.auth.onAuthStateChange((_event, newSession) => {
            setSession(newSession);
        });
        return () => subscription.subscription.unsubscribe();
    }, []);

    useEffect(() => {
        const userId = session?.user?.id;
        if (!userId) { setIsAdmin(false); return; }
        let cancelled = false;
        setCheckingAdmin(true);
        checkIsAdminAccount(userId).then((admin) => {
            if (!cancelled) { setIsAdmin(admin); setCheckingAdmin(false); }
        });
        return () => { cancelled = true; };
    }, [session?.user?.id]);

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        if (!supabase) return;
        setSubmitting(true);
        setError(null);
        setInfo(null);

        if (resetMode) {
            const redirectTo = `${window.location.origin}${import.meta.env.BASE_URL}reset-password`;
            const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
            setSubmitting(false);
            if (resetError) { setError(resetError.message); return; }
            setInfo("Check your email for a password reset link.");
            setResetMode(false);
            return;
        }

        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
        setSubmitting(false);
        if (signInError) setError(signInError.message);
    };

    const handleGoogleSignIn = async () => {
        if (!supabase) return;
        setError(null);
        const { error: oauthError } = await supabase.auth.signInWithOAuth({
            provider: "google",
            options: { redirectTo: `${window.location.origin}${import.meta.env.BASE_URL}mapper` },
        });
        if (oauthError) setError(oauthError.message);
    };

    if (loading) {
        return (
            <div className="flex h-full w-full items-center justify-center text-sm text-stone-300">
                Checking session…
            </div>
        );
    }

    if (!supabase) {
        return (
            <div className="flex h-full w-full items-center justify-center px-6 text-center">
                <div className="max-w-sm rounded-2xl border border-red-300/30 bg-red-950/40 p-6 text-red-100">
                    <div className="text-sm font-black uppercase tracking-wide">Mapper auth unavailable</div>
                    <div className="mt-2 text-sm text-red-200/80">
                        Supabase isn't configured (missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).
                    </div>
                </div>
            </div>
        );
    }

    if (!session) {
        return (
            <div className="flex h-full w-full items-center justify-center px-4">
                <form
                    onSubmit={handleSubmit}
                    className="w-full max-w-sm rounded-[24px] border border-white/10 bg-stone-950/90 p-6 shadow-2xl backdrop-blur-xl"
                >
                    <div className="text-center">
                        <div className="text-xs font-black uppercase tracking-[0.2em] text-amber-300">Admin Only</div>
                        <div className="mt-1 text-xl font-black text-stone-50">
                            {resetMode ? "Reset Password" : "Mapper Access"}
                        </div>
                    </div>

                    <div className="mt-5 space-y-3">
                        <div>
                            <Label htmlFor="mapper-email" className="text-xs text-stone-300">Email</Label>
                            <Input
                                id="mapper-email"
                                type="email"
                                autoComplete="username"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                                className="mt-1 bg-white/5 text-stone-50"
                            />
                        </div>
                        {!resetMode && (
                            <div>
                                <Label htmlFor="mapper-password" className="text-xs text-stone-300">Password</Label>
                                <Input
                                    id="mapper-password"
                                    type="password"
                                    autoComplete="current-password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    required
                                    className="mt-1 bg-white/5 text-stone-50"
                                />
                            </div>
                        )}
                    </div>

                    {error && (
                        <div className="mt-3 rounded-lg border border-red-300/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
                            {error}
                        </div>
                    )}
                    {info && (
                        <div className="mt-3 rounded-lg border border-emerald-300/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">
                            {info}
                        </div>
                    )}

                    <Button type="submit" disabled={submitting} className="mt-5 w-full bg-amber-300 text-stone-950 hover:bg-amber-200">
                        {submitting ? "Please wait…" : resetMode ? "Send reset link" : "Sign In"}
                    </Button>

                    <button
                        type="button"
                        onClick={() => { setResetMode(!resetMode); setError(null); setInfo(null); }}
                        className="mt-3 w-full text-center text-xs text-stone-400 hover:text-stone-200"
                    >
                        {resetMode ? "Back to sign in" : "Forgot password?"}
                    </button>

                    {!resetMode && (
                        <>
                            <div className="mt-4 flex items-center gap-3 text-[10px] uppercase tracking-wide text-stone-500">
                                <div className="h-px flex-1 bg-white/10" />
                                or
                                <div className="h-px flex-1 bg-white/10" />
                            </div>
                            <div className="mt-4">
                                <GoogleSignInButton onClick={handleGoogleSignIn} disabled={submitting} />
                            </div>
                        </>
                    )}
                </form>
            </div>
        );
    }

    if (checkingAdmin) {
        return (
            <div className="flex h-full w-full items-center justify-center text-sm text-stone-300">
                Checking access…
            </div>
        );
    }

    if (!isAdmin) {
        return (
            <div className="flex h-full w-full items-center justify-center px-6 text-center">
                <div className="max-w-sm rounded-2xl border border-red-300/30 bg-red-950/40 p-6 text-red-100">
                    <div className="text-sm font-black uppercase tracking-wide">Not Authorized</div>
                    <div className="mt-2 text-sm text-red-200/80">
                        This account ({session.user.email}) doesn't have mapper access.
                    </div>
                    <Button
                        onClick={() => supabase.auth.signOut()}
                        variant="outline"
                        size="sm"
                        className="mt-4 border-red-300/30 bg-red-500/10 text-red-100 hover:bg-red-500/20"
                    >
                        Sign out
                    </Button>
                </div>
            </div>
        );
    }

    return (
        <div className="relative h-full w-full">
            <Button
                onClick={() => supabase.auth.signOut()}
                variant="ghost"
                size="sm"
                className="absolute right-3 top-3 z-[80] h-8 gap-1.5 rounded-lg border border-white/10 bg-black/40 px-2.5 text-xs text-stone-200 hover:bg-black/60"
                title="Sign out of the mapper"
            >
                <LogOut className="h-3.5 w-3.5" />
                Sign out
            </Button>
            {children}
        </div>
    );
}
