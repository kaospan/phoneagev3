import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import bgImage from "@/assets/stone-age-bg.png";

type Status = "verifying" | "ready" | "invalid" | "done";

/**
 * Landing page for the link sent by supabase.auth.resetPasswordForEmail(). Supabase-js parses
 * the recovery token out of the URL hash automatically (detectSessionInUrl) and fires a
 * PASSWORD_RECOVERY auth event once the session is ready; only then is it safe to call
 * updateUser. If that never arrives (expired/reused link), fall back to an "invalid" state
 * after a short grace period instead of leaving the user staring at "Verifying…" forever.
 */
export default function ResetPassword() {
    const [status, setStatus] = useState<Status>("verifying");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        if (!supabase) return;
        const { data: subscription } = supabase.auth.onAuthStateChange((event) => {
            if (event === "PASSWORD_RECOVERY") setStatus("ready");
        });
        supabase.auth.getSession().then(({ data }) => {
            if (data.session) setStatus((s) => (s === "verifying" ? "ready" : s));
        });
        const timeout = window.setTimeout(() => {
            setStatus((s) => (s === "verifying" ? "invalid" : s));
        }, 6000);
        return () => {
            subscription.subscription.unsubscribe();
            window.clearTimeout(timeout);
        };
    }, []);

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        if (!supabase) return;
        setError(null);
        if (password.length < 6) { setError("Password must be at least 6 characters."); return; }
        if (password !== confirmPassword) { setError("Passwords don't match."); return; }
        setSubmitting(true);
        const { error: updateError } = await supabase.auth.updateUser({ password });
        setSubmitting(false);
        if (updateError) { setError(updateError.message); return; }
        setStatus("done");
    };

    return (
        <div
            className="relative flex h-[100svh] min-h-[100svh] w-screen items-center justify-center overflow-hidden px-4"
            style={{ backgroundImage: `url(${bgImage})`, backgroundSize: "cover", backgroundPosition: "center" }}
        >
            <div className="absolute inset-0 bg-blue-900/40 scanline" />
            <div className="relative z-10 w-full max-w-sm rounded-[24px] border border-white/10 bg-stone-950/90 p-6 shadow-2xl backdrop-blur-xl">
                <div className="text-center">
                    <div className="text-xs font-black uppercase tracking-[0.2em] text-amber-300">PhoneAge</div>
                    <div className="mt-1 text-xl font-black text-stone-50">Reset Password</div>
                </div>

                {!supabase ? (
                    <div className="mt-4 rounded-lg border border-red-300/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
                        Supabase isn't configured.
                    </div>
                ) : status === "verifying" ? (
                    <div className="mt-5 text-center text-sm text-stone-300">Verifying reset link…</div>
                ) : status === "invalid" ? (
                    <div className="mt-5 text-center">
                        <div className="rounded-lg border border-red-300/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
                            This reset link is invalid or has expired. Request a new one from the sign-in screen.
                        </div>
                        <a href={import.meta.env.BASE_URL} className="mt-4 inline-block text-xs text-stone-400 hover:text-stone-200">
                            Back to sign in
                        </a>
                    </div>
                ) : status === "done" ? (
                    <div className="mt-5 text-center">
                        <div className="rounded-lg border border-emerald-300/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">
                            Password updated. You can now sign in with your new password.
                        </div>
                        <a href={import.meta.env.BASE_URL} className="mt-4 inline-block text-xs text-stone-400 hover:text-stone-200">
                            Back to sign in
                        </a>
                    </div>
                ) : (
                    <form onSubmit={handleSubmit} className="mt-5 space-y-3">
                        <div>
                            <Label htmlFor="new-password" className="text-xs text-stone-300">New password</Label>
                            <Input
                                id="new-password"
                                type="password"
                                autoComplete="new-password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                                minLength={6}
                                className="mt-1 bg-white/5 text-stone-50"
                            />
                        </div>
                        <div>
                            <Label htmlFor="confirm-password" className="text-xs text-stone-300">Confirm password</Label>
                            <Input
                                id="confirm-password"
                                type="password"
                                autoComplete="new-password"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                required
                                minLength={6}
                                className="mt-1 bg-white/5 text-stone-50"
                            />
                        </div>

                        {error && (
                            <div className="rounded-lg border border-red-300/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
                                {error}
                            </div>
                        )}

                        <Button type="submit" disabled={submitting} className="w-full bg-amber-300 text-stone-950 hover:bg-amber-200">
                            {submitting ? "Updating…" : "Update password"}
                        </Button>
                    </form>
                )}
            </div>
        </div>
    );
}
