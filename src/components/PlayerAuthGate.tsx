import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabaseClient";
import { loadCampaignProgress, resetCampaignProgress } from "@/lib/campaignProgress";
import { hasCloudProgress, migrateLocalProgressToCloud, touchLastSeen } from "@/lib/cloudProgress";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PlayerSessionProvider } from "@/contexts/PlayerSessionContext";
import { GoogleSignInButton } from "@/components/GoogleSignInButton";

type Mode = "signin" | "signup" | "reset";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Every player gets their own Supabase Auth account so progress can be synced to the cloud
 * and shown in the CRM. Whatever's in localStorage from before this shipped gets uploaded
 * once, on first login, then the cloud becomes the source of truth (see cloudProgress.ts).
 */
export function PlayerAuthGate({ children }: { children: ReactNode }) {
    const [session, setSession] = useState<Session | null>(null);
    const [loading, setLoading] = useState(true);
    // The user id that has finished the one-time migration check/upload and is safe to render
    // children for. Kept separate from `session` itself so there is no render frame where a
    // freshly-signed-in session is present but migration hasn't been accounted for yet — that
    // gap previously let <PuzzleGame> mount once, then unmount/remount when migration kicked in.
    const [readyUserId, setReadyUserId] = useState<string | null>(null);
    const [mode, setMode] = useState<Mode>("signin");
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [info, setInfo] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);
    // Set when sign-in fails specifically because the account's email hasn't been confirmed yet
    // (only possible for password accounts — Google sign-ins arrive pre-verified), so we can offer
    // a resend-confirmation action instead of just showing Supabase's raw error text.
    const [unconfirmedEmail, setUnconfirmedEmail] = useState<string | null>(null);

    // campaignProgress.ts's localStorage cache is a single, unscoped slot — not keyed per
    // account. Tracked here so a sign-out (or a straight switch to a different account) can
    // wipe it before the next account ever sees it, otherwise it leaks in two ways: the new
    // account's UI can briefly show the previous player's progress, and — worse — the "migrate
    // whatever's in local storage" first-login path below would upload it straight into the new
    // account as if it were their own pre-signup progress.
    const previousUserIdRef = useRef<string | null>(null);

    useEffect(() => {
        if (!supabase) {
            setLoading(false);
            return;
        }
        supabase.auth.getSession().then(({ data }) => {
            previousUserIdRef.current = data.session?.user?.id ?? null;
            setSession(data.session);
            setLoading(false);
        });
        const { data: subscription } = supabase.auth.onAuthStateChange((_event, newSession) => {
            const newUserId = newSession?.user?.id ?? null;
            const prevUserId = previousUserIdRef.current;
            if (prevUserId && prevUserId !== newUserId) {
                resetCampaignProgress();
            }
            previousUserIdRef.current = newUserId;
            setSession(newSession);
        });
        return () => subscription.subscription.unsubscribe();
    }, []);

    // First login on this account: upload whatever local progress exists, once.
    useEffect(() => {
        const userId = session?.user?.id;
        if (!userId) return;
        let cancelled = false;
        (async () => {
            const already = await hasCloudProgress(userId);
            if (!already && !cancelled) {
                const local = loadCampaignProgress();
                await migrateLocalProgressToCloud(userId, local);
            }
            if (!cancelled) setReadyUserId(userId);
            // Baseline touch so "Last Seen" reflects this app open even if the player never
            // starts a level (PuzzleGame's own activity-driven touches take over from here).
            void touchLastSeen(userId);
        })();
        return () => { cancelled = true; };
    }, [session?.user?.id]);

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        if (!supabase) return;
        setSubmitting(true);
        setError(null);
        setInfo(null);
        setUnconfirmedEmail(null);

        if (mode === "signup") {
            if (!EMAIL_RE.test(email.trim())) {
                setSubmitting(false);
                setError("Enter a valid email address.");
                return;
            }
            if (!name.trim()) {
                setSubmitting(false);
                setError("Enter your name.");
                return;
            }
            const { data, error: signUpError } = await supabase.auth.signUp({
                email,
                password,
                options: { data: { full_name: name.trim() } },
            });
            setSubmitting(false);
            if (signUpError) { setError(signUpError.message); return; }
            if (!data.session) {
                setInfo("Account created — check your email to confirm, then sign in.");
                setMode("signin");
            }
            return;
        }

        if (mode === "reset") {
            const redirectTo = `${window.location.origin}${import.meta.env.BASE_URL}reset-password`;
            const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
            setSubmitting(false);
            if (resetError) { setError(resetError.message); return; }
            setInfo("Check your email for a password reset link.");
            setMode("signin");
            return;
        }

        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
        setSubmitting(false);
        if (signInError) {
            if (/email.*not.*confirmed/i.test(signInError.message)) {
                setUnconfirmedEmail(email);
                setError("Please confirm your email before signing in — check your inbox for the link we sent.");
            } else {
                setError(signInError.message);
            }
        }
    };

    const handleResendConfirmation = async () => {
        if (!supabase || !unconfirmedEmail) return;
        setSubmitting(true);
        setError(null);
        const { error: resendError } = await supabase.auth.resend({ type: "signup", email: unconfirmedEmail });
        setSubmitting(false);
        if (resendError) { setError(resendError.message); return; }
        setInfo("Confirmation email resent — check your inbox.");
    };

    const handleGoogleSignIn = async () => {
        if (!supabase) return;
        setError(null);
        const { error: oauthError } = await supabase.auth.signInWithOAuth({
            provider: "google",
            options: { redirectTo: `${window.location.origin}${import.meta.env.BASE_URL}` },
        });
        if (oauthError) setError(oauthError.message);
    };

    if (loading) {
        return (
            <div className="flex h-full w-full items-center justify-center text-sm text-stone-300">
                Loading…
            </div>
        );
    }

    if (!supabase) {
        return (
            <div className="flex h-full w-full items-center justify-center px-6 text-center">
                <div className="max-w-sm rounded-2xl border border-red-300/30 bg-red-950/40 p-6 text-red-100">
                    <div className="text-sm font-black uppercase tracking-wide">Sign-in unavailable</div>
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
                        <div className="text-xs font-black uppercase tracking-[0.2em] text-amber-300">PhoneAge</div>
                        <div className="mt-1 text-xl font-black text-stone-50">
                            {mode === "signin" ? "Sign In" : mode === "signup" ? "Create Account" : "Reset Password"}
                        </div>
                    </div>

                    <div className="mt-5 space-y-3">
                        {mode === "signup" && (
                            <div>
                                <Label htmlFor="player-name" className="text-xs text-stone-300">Name</Label>
                                <Input
                                    id="player-name"
                                    type="text"
                                    autoComplete="name"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    required
                                    className="mt-1 bg-white/5 text-stone-50"
                                />
                            </div>
                        )}
                        <div>
                            <Label htmlFor="player-email" className="text-xs text-stone-300">Email</Label>
                            <Input
                                id="player-email"
                                type="email"
                                autoComplete="username"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                                className="mt-1 bg-white/5 text-stone-50"
                            />
                        </div>
                        {mode !== "reset" && (
                            <div>
                                <Label htmlFor="player-password" className="text-xs text-stone-300">Password</Label>
                                <Input
                                    id="player-password"
                                    type="password"
                                    autoComplete={mode === "signin" ? "current-password" : "new-password"}
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    required
                                    minLength={6}
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
                    {unconfirmedEmail && (
                        <button
                            type="button"
                            onClick={handleResendConfirmation}
                            disabled={submitting}
                            className="mt-2 w-full text-center text-xs font-bold text-amber-300 hover:text-amber-200"
                        >
                            Resend confirmation email
                        </button>
                    )}

                    <Button type="submit" disabled={submitting} className="mt-5 w-full bg-amber-300 text-stone-950 hover:bg-amber-200">
                        {submitting
                            ? "Please wait…"
                            : mode === "signin" ? "Sign In" : mode === "signup" ? "Create Account" : "Send reset link"}
                    </Button>

                    {mode !== "reset" && (
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

                    {mode === "signin" && (
                        <button
                            type="button"
                            onClick={() => { setMode("reset"); setError(null); setInfo(null); setUnconfirmedEmail(null); }}
                            className="mt-3 w-full text-center text-xs text-stone-400 hover:text-stone-200"
                        >
                            Forgot password?
                        </button>
                    )}

                    <button
                        type="button"
                        onClick={() => {
                            setMode(mode === "signin" ? "signup" : "signin");
                            setError(null);
                            setInfo(null);
                            setUnconfirmedEmail(null);
                        }}
                        className="mt-1 w-full text-center text-xs text-stone-400 hover:text-stone-200"
                    >
                        {mode === "signin"
                            ? "New here? Create an account"
                            : mode === "signup"
                                ? "Already have an account? Sign in"
                                : "Back to sign in"}
                    </button>
                </form>
            </div>
        );
    }

    if (readyUserId !== session.user.id) {
        return (
            <div className="flex h-full w-full items-center justify-center text-sm text-stone-300">
                Syncing your progress…
            </div>
        );
    }

    // Sign-out lives inside the game's own HUD button cluster (via context) rather than as a
    // floating corner button — a fixed-position overlay here collided with the in-game HUD's
    // own top-right controls at normal desktop widths.
    return (
        <PlayerSessionProvider value={{ user: session.user, signOut: () => { void supabase.auth.signOut(); } }}>
            {children}
        </PlayerSessionProvider>
    );
}
