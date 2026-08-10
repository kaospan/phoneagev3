import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { saveRecordedRun, type RecordedInputCommand } from "@/lib/moveRecording";
import {
    Tabs,
    TabsContent,
    TabsList,
    TabsTrigger,
} from "@/components/ui/tabs";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, Circle, Trash2, Shield, ShieldOff, Zap, ZapOff } from "lucide-react";

const PRESENCE_CHANNEL = "game-presence";

// Sessions that never got an ended_at (tab closed, crash, connection loss) are capped so one
// stuck row can't inflate total play time — levels' own timers top out around 2 minutes, so 10
// minutes is already generous headroom for pre-timer idle/thinking time.
const ORPHANED_SESSION_CAP_MS = 10 * 60 * 1000;

interface ProfileRow {
    id: string;
    email: string | null;
    display_name: string | null;
    highest_unlocked_level_id: number;
    last_played_level_id: number | null;
    created_at: string;
    last_seen_at: string;
    is_test_user: boolean;
}

interface ProgressRow {
    user_id: string;
    level_id: number;
    completed: boolean;
    clear_count: number;
    best_moves: number | null;
    last_moves: number | null;
    best_time_left_seconds: number | null;
    last_time_left_seconds: number | null;
    last_completed_at: string | null;
}

interface SessionRow {
    id: string;
    user_id: string;
    level_id: number;
    started_at: string;
    ended_at: string | null;
    completed: boolean;
    moves: number | null;
    time_left_seconds: number | null;
    active_seconds: number | null;
    end_reason?: string | null;
    move_history?: unknown;
}

interface RecentAttemptRow {
    id: string;
    level_id: number;
    started_at: string;
    ended_at: string | null;
    completed: boolean;
    moves: number | null;
    time_left_seconds: number | null;
    active_seconds: number | null;
    end_reason: string | null;
    move_history: RecordedInputCommand[] | null;
    syntheticFromProgress: boolean;
}

interface PresenceMeta {
    email?: string | null;
    level_id?: number | null;
    online_at?: string;
}

interface DbLevel {
    id: number;
}

const timeAgo = (iso: string | null | undefined): string => {
    if (!iso) return "—";
    const ms = Date.now() - new Date(iso).getTime();
    if (ms < 0) return "just now";
    const s = Math.floor(ms / 1000);
    if (s < 60) return `${s}s ago`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    const d = Math.floor(h / 24);
    return `${d}d ago`;
};

const formatTimestamp = (iso: string | null | undefined): string => {
    if (!iso) return "—";
    return new Date(iso).toLocaleString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        second: "2-digit",
    });
};

const formatClock = (seconds: number | null | undefined): string => {
    if (seconds == null) return "—";
    const safe = Math.max(0, Math.round(seconds));
    const m = Math.floor(safe / 60);
    const s = safe % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
};

const formatDuration = (ms: number): string => {
    const totalSeconds = Math.max(0, Math.round(ms / 1000));
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
};

const isRecordedInputCommand = (value: unknown): value is RecordedInputCommand => {
    if (!value || typeof value !== "object") return false;
    const command = value as Partial<RecordedInputCommand>;
    if (command.type === "deselect") return true;
    if (command.type === "wait") return command.durationMs === undefined || Number.isFinite(command.durationMs);
    if (command.type === "select") return Number.isFinite(command.x) && Number.isFinite(command.y);
    if (command.type === "move") return Number.isFinite(command.dx) && Number.isFinite(command.dy);
    return false;
};

const parseMoveHistory = (value: unknown): RecordedInputCommand[] | null => {
    if (!Array.isArray(value)) return null;
    const actions = value.filter(isRecordedInputCommand);
    return actions.length > 0 ? actions : null;
};

const moveHistoryLines = (actions: RecordedInputCommand[] | null): string[] => {
    if (!actions) return [];
    let activeArrow: { x: number; y: number } | null = null;
    return actions.map((action, index) => {
        if (action.type === "select") {
            activeArrow = { x: action.x, y: action.y };
            return `${index + 1}. select arrow (${action.x},${action.y})`;
        }
        if (action.type === "deselect") {
            activeArrow = null;
            return `${index + 1}. deselect arrow`;
        }
        if (action.type === "wait") {
            activeArrow = null;
            return `${index + 1}. wait${action.durationMs ? ` ${Math.round(action.durationMs / 1000)}s` : ""}`;
        }
        const dir = action.dy === -1 ? "U" : action.dy === 1 ? "D" : action.dx === -1 ? "L" : "R";
        const prefix = activeArrow ? `A(${activeArrow.x},${activeArrow.y})` : "P";
        return `${index + 1}. ${prefix}:${dir}`;
    });
};

const attemptReasonLabel = (attempt: Pick<RecentAttemptRow, "completed" | "ended_at" | "end_reason" | "time_left_seconds">): string => {
    if (attempt.completed) return "Cleared";
    if (attempt.end_reason === "timed_out") return "Timer ran out";
    if (attempt.end_reason === "restarted") return "Restarted";
    if (attempt.end_reason === "tab_hidden") return "Left game";
    if (attempt.end_reason === "level_changed") return "Changed level";
    if (attempt.ended_at) return attempt.time_left_seconds === 0 ? "Timer ran out" : "Abandoned";
    return "In progress";
};

const printMoveHistory = (attempt: RecentAttemptRow, playerLabel: string) => {
    const lines = moveHistoryLines(attempt.move_history);
    const text = [
        `Player: ${playerLabel}`,
        `Level: ${attempt.level_id}`,
        `Outcome: ${attemptReasonLabel(attempt)}`,
        `Moves: ${attempt.moves ?? "—"}`,
        `Time remaining: ${formatClock(attempt.time_left_seconds)}`,
        `Started: ${formatTimestamp(attempt.started_at)}`,
        "",
        "Move history:",
        ...(lines.length > 0 ? lines : ["No move history recorded."]),
    ].join("\n");
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(`<pre style="white-space:pre-wrap;font:13px/1.45 ui-monospace,Menlo,Consolas,monospace">${text.replace(/[&<>]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[ch] ?? ch))}</pre>`);
    win.document.close();
    win.print();
};

type TestUserFilter = "all" | "non-test" | "test-only";

// Shared identity cell: shows the player's name (from registration, or Google's profile for
// OAuth sign-ins) as the primary label with email as a secondary line, falling back to email
// alone for accounts that predate the name field.
function PlayerIdentity({ profile }: { profile: { email: string | null; display_name: string | null; id: string } }) {
    if (profile.display_name) {
        return (
            <div>
                <div className="font-medium text-stone-100">{profile.display_name}</div>
                {profile.email && <div className="text-[10px] text-stone-500">{profile.email}</div>}
            </div>
        );
    }
    return <span className="font-medium text-stone-100">{profile.email ?? profile.id.slice(0, 8)}</span>;
}

export function CrmDashboard() {
    const [profiles, setProfiles] = useState<ProfileRow[]>([]);
    const [progress, setProgress] = useState<ProgressRow[]>([]);
    const [sessions, setSessions] = useState<SessionRow[]>([]);
    const [levels, setLevels] = useState<DbLevel[]>([]);
    const [onlineIds, setOnlineIds] = useState<Map<string, PresenceMeta>>(new Map());
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
    const [testUserFilter, setTestUserFilter] = useState<TestUserFilter>("all");
    const [adminIds, setAdminIds] = useState<Set<string>>(new Set());
    const [showAdmins, setShowAdmins] = useState(false);
    const [betaTesterIds, setBetaTesterIds] = useState<Set<string>>(new Set());
    const [tab, setTab] = useState("players");
    const [leaderboardLevelId, setLeaderboardLevelId] = useState<number | "all">("all");
    const [bestSortBy, setBestSortBy] = useState<"clears" | "moves" | "time">("clears");
    const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
    const [deleting, setDeleting] = useState(false);

    const load = async () => {
        if (!supabase) { setError("Supabase not configured"); setLoading(false); return; }
        setLoading(true);
        setError(null);
        const [profilesRes, progressRes, sessionsRes, levelsRes, adminUsersRes, betaTestersRes] = await Promise.all([
            supabase.from("profiles").select("*").order("last_seen_at", { ascending: false }),
            supabase.from("player_progress").select("*"),
            supabase.from("play_sessions").select("*").order("started_at", { ascending: false }).limit(5000),
            supabase.from("levels").select("id").order("id", { ascending: true }),
            // Best-effort: without schema_admin_visibility.sql's admin-read policy, RLS only
            // returns the viewer's own admin_users row — that's fine, badges/filtering just
            // degrade to knowing about the current admin until the migration is run.
            supabase.from("admin_users").select("user_id"),
            // Also best-effort until schema_beta_testers.sql is run (table won't exist yet).
            supabase.from("beta_testers").select("user_id"),
        ]);
        if (profilesRes.error || progressRes.error || sessionsRes.error || levelsRes.error) {
            setError(profilesRes.error?.message ?? progressRes.error?.message ?? sessionsRes.error?.message ?? levelsRes.error?.message ?? "Load failed");
            setLoading(false);
            return;
        }
        setProfiles((profilesRes.data ?? []) as ProfileRow[]);
        setProgress((progressRes.data ?? []) as ProgressRow[]);
        setSessions((sessionsRes.data ?? []) as SessionRow[]);
        setLevels((levelsRes.data ?? []).map((l: { id: number }) => ({ id: l.id })) as DbLevel[]);
        setAdminIds(new Set((adminUsersRes.data ?? []).map((r: { user_id: string }) => r.user_id)));
        setBetaTesterIds(new Set((betaTestersRes.data ?? []).map((r: { user_id: string }) => r.user_id)));
        setLoading(false);
    };

    useEffect(() => { void load(); }, []);

    useEffect(() => {
        if (!supabase) return;
        const channel = supabase.channel(PRESENCE_CHANNEL, { config: { presence: { key: "crm-viewer" } } });
        const syncOnline = () => {
            const state = channel.presenceState<PresenceMeta>();
            const next = new Map<string, PresenceMeta>();
            for (const [key, metas] of Object.entries(state)) {
                const meta = metas[metas.length - 1] as unknown as PresenceMeta;
                next.set(key, meta ?? {});
            }
            setOnlineIds(next);
        };
        channel.on("presence", { event: "sync" }, syncOnline);
        channel.subscribe();
        return () => { void supabase.removeChannel(channel); };
    }, []);

    const statsByUser = useMemo(() => {
        const map = new Map<string, {
            levelsCompleted: number;
            totalClears: number;
            totalAttempts: number;
            totalMoves: number;
            totalPlayMs: number;
        }>();
        for (const p of progress) {
            const s = map.get(p.user_id) ?? { levelsCompleted: 0, totalClears: 0, totalAttempts: 0, totalMoves: 0, totalPlayMs: 0 };
            if (p.completed) s.levelsCompleted += 1;
            s.totalClears += p.clear_count ?? 0;
            map.set(p.user_id, s);
        }
        const now = Date.now();
        for (const sess of sessions) {
            const s = map.get(sess.user_id) ?? { levelsCompleted: 0, totalClears: 0, totalAttempts: 0, totalMoves: 0, totalPlayMs: 0 };
            s.totalAttempts += 1;
            s.totalMoves += sess.moves ?? 0;
            // active_seconds (idle-aware, tracked client-side) is preferred when present; older
            // sessions logged before that shipped fall back to the wall-clock start/end span.
            if (sess.active_seconds != null) {
                s.totalPlayMs += Math.max(0, sess.active_seconds * 1000);
            } else {
                const startMs = new Date(sess.started_at).getTime();
                const endMs = sess.ended_at ? new Date(sess.ended_at).getTime() : Math.min(now, startMs + ORPHANED_SESSION_CAP_MS);
                s.totalPlayMs += Math.max(0, endMs - startMs);
            }
            map.set(sess.user_id, s);
        }
        // Belt-and-suspenders sanity clamp: no matter how many orphaned sessions a user racked
        // up, they can't have played longer than their account has existed.
        for (const p of profiles) {
            const s = map.get(p.id);
            if (!s) continue;
            const accountAgeMs = Math.max(0, now - new Date(p.created_at).getTime());
            s.totalPlayMs = Math.min(s.totalPlayMs, accountAgeMs);
        }
        return map;
    }, [progress, sessions, profiles]);

    const timeToCompleteByUserLevel = useMemo(() => {
        const map = new Map<string, number>();
        for (const sess of sessions) {
            if (!sess.completed || !sess.ended_at) continue;
            const durationMs = new Date(sess.ended_at).getTime() - new Date(sess.started_at).getTime();
            if (durationMs <= 0) continue;
            const key = `${sess.user_id}:${sess.level_id}`;
            const prev = map.get(key);
            if (prev == null || durationMs < prev) map.set(key, durationMs);
        }
        return map;
    }, [sessions]);

    const filteredProfiles = useMemo(() => {
        let list = profiles;
        if (testUserFilter === "test-only") list = list.filter((p) => p.is_test_user);
        else if (testUserFilter === "non-test") list = list.filter((p) => !p.is_test_user);
        if (!showAdmins) list = list.filter((p) => !adminIds.has(p.id));
        return list;
    }, [profiles, testUserFilter, showAdmins, adminIds]);

    const bestPlayersOverall = useMemo(() => {
        return profiles
            .map((p) => {
                const stats = statsByUser.get(p.id) ?? { levelsCompleted: 0, totalClears: 0, totalAttempts: 0, totalMoves: 0, totalPlayMs: 0 };
                return { profile: p, ...stats };
            })
            .sort((a, b) => {
                if (bestSortBy === "clears") {
                    if (b.levelsCompleted !== a.levelsCompleted) return b.levelsCompleted - a.levelsCompleted;
                    return a.totalMoves - b.totalMoves;
                }
                if (bestSortBy === "moves") {
                    if (a.totalMoves !== b.totalMoves) return a.totalMoves - b.totalMoves;
                    return b.levelsCompleted - a.levelsCompleted;
                }
                if (bestSortBy === "time") {
                    if (a.totalPlayMs !== b.totalPlayMs) return a.totalPlayMs - b.totalPlayMs;
                    return b.levelsCompleted - a.levelsCompleted;
                }
                return 0;
            });
    }, [profiles, statsByUser, bestSortBy]);

    const levelLeaderboardMoves = useMemo(() => {
        // Each entry is a (level, user) pair, not just a user — with "All Levels" selected, the
        // same player legitimately appears once per level they've cleared. Carrying levelId
        // through lets the row key (and the Level column) disambiguate those repeats instead of
        // colliding on userId alone.
        const entries: { levelId: number; userId: string; moves: number }[] = [];
        const targetLevels = leaderboardLevelId === "all" ? levels.map((l) => l.id) : [leaderboardLevelId];
        for (const levelId of targetLevels) {
            const userMoves = new Map<string, number>();
            for (const p of progress) {
                if (p.level_id !== levelId || !p.completed || p.best_moves == null) continue;
                const prev = userMoves.get(p.user_id);
                if (prev == null || p.best_moves < prev) userMoves.set(p.user_id, p.best_moves);
            }
            for (const [userId, moves] of userMoves) {
                entries.push({ levelId, userId, moves });
            }
        }
        return entries.sort((a, b) => a.moves - b.moves);
    }, [progress, levels, leaderboardLevelId]);

    const levelLeaderboardTime = useMemo(() => {
        const entries: { levelId: number; userId: string; timeMs: number }[] = [];
        const targetLevels = leaderboardLevelId === "all" ? levels.map((l) => l.id) : [leaderboardLevelId];
        for (const levelId of targetLevels) {
            const userTime = new Map<string, number>();
            for (const sess of sessions) {
                if (sess.level_id !== levelId || !sess.completed || !sess.ended_at) continue;
                const durationMs = new Date(sess.ended_at).getTime() - new Date(sess.started_at).getTime();
                if (durationMs <= 0) continue;
                const prev = userTime.get(sess.user_id);
                if (prev == null || durationMs < prev) userTime.set(sess.user_id, durationMs);
            }
            for (const [userId, timeMs] of userTime) {
                entries.push({ levelId, userId, timeMs });
            }
        }
        return entries.sort((a, b) => a.timeMs - b.timeMs);
    }, [sessions, levels, leaderboardLevelId]);

    const selectedProgress = useMemo(
        () => progress.filter((p) => p.user_id === selectedUserId).sort((a, b) => a.level_id - b.level_id),
        [progress, selectedUserId],
    );
    const selectedRecentAttempts = useMemo(() => {
        const userSessions: RecentAttemptRow[] = sessions
            .filter((s) => s.user_id === selectedUserId)
            .map((s) => ({
                ...s,
                active_seconds: s.active_seconds ?? null,
                end_reason: s.end_reason ?? null,
                move_history: parseMoveHistory(s.move_history),
                syntheticFromProgress: false,
            }));
        const completedSessionLevels = new Set(
            userSessions.filter((s) => s.completed).map((s) => s.level_id),
        );
        const progressClearsWithoutSession: RecentAttemptRow[] = selectedProgress
            .filter((p) => p.completed && !completedSessionLevels.has(p.level_id))
            .map((p) => {
                const completedAt = p.last_completed_at ?? "1970-01-01T00:00:00.000Z";
                return {
                    id: `progress-clear-${p.user_id}-${p.level_id}`,
                    level_id: p.level_id,
                    started_at: completedAt,
                    ended_at: completedAt,
                    completed: true,
                    moves: p.last_moves ?? p.best_moves,
                    time_left_seconds: p.last_time_left_seconds ?? p.best_time_left_seconds,
                    active_seconds: null,
                    end_reason: "completed",
                    move_history: null,
                    syntheticFromProgress: true,
                };
            });

        return [...userSessions, ...progressClearsWithoutSession]
            .sort((a, b) => {
                const aMs = new Date(a.ended_at ?? a.started_at).getTime() || 0;
                const bMs = new Date(b.ended_at ?? b.started_at).getTime() || 0;
                return bMs - aMs;
            })
            .slice(0, 100);
    }, [sessions, selectedUserId, selectedProgress]);
    const selectedProfile = profiles.find((p) => p.id === selectedUserId) ?? null;

    const toggleTestUser = async (userId: string, current: boolean) => {
        if (!supabase) return;
        const { error } = await supabase
            .from("profiles")
            .update({ is_test_user: !current })
            .eq("id", userId);
        if (error) {
            setError(error.message);
            return;
        }
        setProfiles((prev) => prev.map((p) => (p.id === userId ? { ...p, is_test_user: !current } : p)));
    };

    // beta_testers is a separate allowlist table (like admin_users), not a column on profiles —
    // granting/revoking is an insert/delete, not an update. Never touches admin_users, so this
    // can never grant /mapper or /crm access, only the same in-game level-skip admins get.
    const toggleBetaTester = async (userId: string, currentlyBeta: boolean) => {
        if (!supabase) return;
        if (currentlyBeta) {
            const { error } = await supabase.from("beta_testers").delete().eq("user_id", userId);
            if (error) { setError(error.message); return; }
            setBetaTesterIds((prev) => {
                const next = new Set(prev);
                next.delete(userId);
                return next;
            });
        } else {
            const { error } = await supabase.from("beta_testers").insert({ user_id: userId });
            if (error) { setError(error.message); return; }
            setBetaTesterIds((prev) => new Set(prev).add(userId));
        }
    };

    const confirmDelete = async () => {
        if (!deleteTargetId || !supabase) return;
        setDeleting(true);
        try {
            await supabase.from("play_sessions").delete().eq("user_id", deleteTargetId);
            await supabase.from("player_progress").delete().eq("user_id", deleteTargetId);
            await supabase.from("profiles").delete().eq("id", deleteTargetId);
            setProfiles((prev) => prev.filter((p) => p.id !== deleteTargetId));
            if (selectedUserId === deleteTargetId) setSelectedUserId(null);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Delete failed");
        } finally {
            setDeleting(false);
            setDeleteTargetId(null);
        }
    };

    const testUserCount = profiles.filter((p) => p.is_test_user).length;

    return (
        <div className="flex h-full w-full flex-col overflow-hidden bg-stone-950 text-stone-50">
            <div className="flex items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
                <div>
                    <div className="text-xs font-black uppercase tracking-[0.22em] text-amber-300">Admin</div>
                    <div className="text-xl font-black">Player CRM</div>
                </div>
                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5 rounded-full border border-emerald-300/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-black text-emerald-200">
                        <Circle className="h-2 w-2 fill-emerald-400 text-emerald-400" />
                        {onlineIds.size} online now
                    </div>
                    {testUserCount > 0 && (
                        <Badge variant="outline" className="border-red-300/30 bg-red-500/10 text-red-200">
                            {testUserCount} test user{testUserCount !== 1 ? "s" : ""}
                        </Badge>
                    )}
                    <Button onClick={() => void load()} variant="outline" size="sm" className="gap-1.5 border-white/15 bg-white/5 text-stone-100 hover:bg-white/10">
                        <RefreshCw className="h-3.5 w-3.5" />
                        Refresh
                    </Button>
                </div>
            </div>

            {error && (
                <div className="mx-5 mt-4 rounded-lg border border-red-300/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
                    {error}
                </div>
            )}

            <div className="flex min-h-0 flex-1 flex-row overflow-hidden">
            <Tabs value={tab} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col">
                <div className="shrink-0 border-b border-white/10 px-5 pt-3">
                    <TabsList className="bg-white/5">
                        <TabsTrigger value="players">Players</TabsTrigger>
                        <TabsTrigger value="best">Best Players</TabsTrigger>
                        <TabsTrigger value="leaderboards">Level Leaderboards</TabsTrigger>
                        <TabsTrigger value="data">Data</TabsTrigger>
                    </TabsList>
                </div>

                <TabsContent value="players" className="mt-0 flex min-h-0 flex-1 flex-col">
                    <div className="shrink-0 flex items-center gap-3 border-b border-white/5 px-5 py-2">
                        <span className="text-xs font-black uppercase tracking-wide text-stone-400">Filter:</span>
                        {(["all", "non-test", "test-only"] as TestUserFilter[]).map((f) => (
                            <Button
                                key={f}
                                size="sm"
                                variant={testUserFilter === f ? "default" : "ghost"}
                                className={testUserFilter === f ? "bg-amber-300 text-stone-950 hover:bg-amber-200" : "text-stone-300 hover:text-stone-100"}
                                onClick={() => setTestUserFilter(f)}
                            >
                                {f === "all" ? "All" : f === "non-test" ? "Non-test" : "Test only"}
                            </Button>
                        ))}
                        {adminIds.size > 0 && (
                            <Button
                                size="sm"
                                variant={showAdmins ? "default" : "ghost"}
                                className={showAdmins ? "bg-amber-300 text-stone-950 hover:bg-amber-200" : "text-stone-300 hover:text-stone-100"}
                                onClick={() => setShowAdmins((v) => !v)}
                            >
                                {showAdmins ? "Hide admins" : "Show admins"}
                            </Button>
                        )}
                        <span className="text-xs text-stone-500">{filteredProfiles.length} shown</span>
                    </div>
                    <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
                        {loading ? (
                            <div className="text-sm text-stone-400">Loading…</div>
                        ) : (
                            <Table>
                                <TableHeader>
                                    <TableRow className="border-white/10 hover:bg-transparent">
                                        <TableHead className="text-stone-400">Player</TableHead>
                                        <TableHead className="text-stone-400">Status</TableHead>
                                        <TableHead className="text-stone-400">Tags</TableHead>
                                        <TableHead className="text-stone-400">Levels Cleared</TableHead>
                                        <TableHead className="text-stone-400">Total Attempts</TableHead>
                                        <TableHead className="text-stone-400">Total Moves</TableHead>
                                        <TableHead className="text-stone-400">Time Played</TableHead>
                                        <TableHead className="text-stone-400">Last Seen</TableHead>
                                        <TableHead className="text-stone-400">Joined</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {filteredProfiles.map((p) => {
                                        const stats = statsByUser.get(p.id) ?? { levelsCompleted: 0, totalClears: 0, totalAttempts: 0, totalMoves: 0, totalPlayMs: 0 };
                                        const online = onlineIds.get(p.id);
                                        return (
                                            <TableRow
                                                key={p.id}
                                                onClick={() => setSelectedUserId(p.id)}
                                                className={[
                                                    "cursor-pointer border-white/5 hover:bg-white/5",
                                                    selectedUserId === p.id ? "bg-white/10" : "",
                                                ].join(" ")}
                                            >
                                                <TableCell><PlayerIdentity profile={p} /></TableCell>
                                                <TableCell>
                                                    {online ? (
                                                        <span className="inline-flex items-center gap-1.5 text-xs font-black text-emerald-300">
                                                            <Circle className="h-2 w-2 fill-emerald-400 text-emerald-400" />
                                                            Online · L{online.level_id ?? "?"}
                                                        </span>
                                                    ) : (
                                                        <span className="text-xs text-stone-500">Offline</span>
                                                    )}
                                                </TableCell>
                                                <TableCell>
                                                    <div className="flex flex-wrap items-center gap-1">
                                                        {adminIds.has(p.id) && (
                                                            <Badge variant="outline" className="border-sky-300/30 bg-sky-500/10 text-sky-200">Admin</Badge>
                                                        )}
                                                        {betaTesterIds.has(p.id) && (
                                                            <Badge variant="outline" className="border-violet-300/30 bg-violet-500/10 text-violet-200">Beta</Badge>
                                                        )}
                                                        {p.is_test_user && (
                                                            <Badge variant="outline" className="border-red-300/30 bg-red-500/10 text-red-200">Test</Badge>
                                                        )}
                                                        {!adminIds.has(p.id) && !betaTesterIds.has(p.id) && !p.is_test_user && (
                                                            <span className="text-xs text-stone-500">—</span>
                                                        )}
                                                    </div>
                                                </TableCell>
                                                <TableCell>{stats.levelsCompleted}</TableCell>
                                                <TableCell>{stats.totalAttempts}</TableCell>
                                                <TableCell>{stats.totalMoves}</TableCell>
                                                <TableCell>{formatDuration(stats.totalPlayMs)}</TableCell>
                                                <TableCell className="text-stone-400" title={formatTimestamp(p.last_seen_at)}>
                                                    <div>{timeAgo(p.last_seen_at)}</div>
                                                    <div className="text-[10px] text-stone-600">{formatTimestamp(p.last_seen_at)}</div>
                                                </TableCell>
                                                <TableCell className="text-stone-400" title={formatTimestamp(p.created_at)}>
                                                    <div>{timeAgo(p.created_at)}</div>
                                                    <div className="text-[10px] text-stone-600">{formatTimestamp(p.created_at)}</div>
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })}
                                    {filteredProfiles.length === 0 && (
                                        <TableRow className="border-white/5">
                                            <TableCell colSpan={9} className="py-8 text-center text-stone-500">
                                                No players match the current filter.
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        )}
                    </div>
                </TabsContent>

                <TabsContent value="best" className="mt-0 flex min-h-0 flex-1 flex-col">
                    <div className="shrink-0 flex items-center gap-3 border-b border-white/5 px-5 py-2">
                        <span className="text-xs font-black uppercase tracking-wide text-stone-400">Sort by:</span>
                        {([
                            { key: "clears", label: "Levels Cleared" },
                            { key: "moves", label: "Fewest Moves" },
                            { key: "time", label: "Time Played" },
                        ] as const).map((opt) => (
                            <Button
                                key={opt.key}
                                size="sm"
                                variant={bestSortBy === opt.key ? "default" : "ghost"}
                                className={bestSortBy === opt.key ? "bg-amber-300 text-stone-950 hover:bg-amber-200" : "text-stone-300 hover:text-stone-100"}
                                onClick={() => setBestSortBy(opt.key)}
                            >
                                {opt.label}
                            </Button>
                        ))}
                    </div>
                    <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
                        {loading ? (
                            <div className="text-sm text-stone-400">Loading…</div>
                        ) : (
                            <Table>
                                <TableHeader>
                                    <TableRow className="border-white/10 hover:bg-transparent">
                                        <TableHead className="text-stone-400">#</TableHead>
                                        <TableHead className="text-stone-400">Player</TableHead>
                                        <TableHead className="text-stone-400">Status</TableHead>
                                        <TableHead className="text-stone-400">Levels Cleared</TableHead>
                                        <TableHead className="text-stone-400">Total Attempts</TableHead>
                                        <TableHead className="text-stone-400">Total Moves</TableHead>
                                        <TableHead className="text-stone-400">Time Played</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {bestPlayersOverall.map((row, idx) => {
                                        const stats = row;
                                        const online = onlineIds.get(row.profile.id);
                                        return (
                                            <TableRow
                                                key={row.profile.id}
                                                onClick={() => setSelectedUserId(row.profile.id)}
                                                className={[
                                                    "cursor-pointer border-white/5 hover:bg-white/5",
                                                    selectedUserId === row.profile.id ? "bg-white/10" : "",
                                                ].join(" ")}
                                            >
                                                <TableCell className="text-stone-400">{idx + 1}</TableCell>
                                                <TableCell><PlayerIdentity profile={row.profile} /></TableCell>
                                                <TableCell>
                                                    {online ? (
                                                        <span className="inline-flex items-center gap-1.5 text-xs font-black text-emerald-300">
                                                            <Circle className="h-2 w-2 fill-emerald-400 text-emerald-400" />
                                                            Online
                                                        </span>
                                                    ) : (
                                                        <span className="text-xs text-stone-500">Offline</span>
                                                    )}
                                                </TableCell>
                                                <TableCell>{stats.levelsCompleted}</TableCell>
                                                <TableCell>{stats.totalAttempts}</TableCell>
                                                <TableCell>{stats.totalMoves}</TableCell>
                                                <TableCell>{formatDuration(stats.totalPlayMs)}</TableCell>
                                            </TableRow>
                                        );
                                    })}
                                    {bestPlayersOverall.length === 0 && (
                                        <TableRow className="border-white/5">
                                            <TableCell colSpan={7} className="py-8 text-center text-stone-500">
                                                No players yet.
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        )}
                    </div>
                </TabsContent>

                <TabsContent value="leaderboards" className="mt-0 flex min-h-0 flex-1 flex-col">
                    <div className="shrink-0 flex items-center gap-3 border-b border-white/5 px-5 py-2">
                        <span className="text-xs font-black uppercase tracking-wide text-stone-400">Level:</span>
                        <Select value={leaderboardLevelId.toString()} onValueChange={(v) => setLeaderboardLevelId(v === "all" ? "all" : Number(v))}>
                            <SelectTrigger className="w-[180px] border-white/10 bg-white/5 text-stone-100">
                                <SelectValue placeholder="Select level" />
                            </SelectTrigger>
                            <SelectContent className="bg-stone-900 text-stone-100">
                                <SelectItem value="all">All Levels</SelectItem>
                                {levels.map((l) => (
                                    <SelectItem key={l.id} value={String(l.id)}>Level {l.id}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
                        <div className="mb-4">
                            <div className="text-xs font-black uppercase tracking-wide text-stone-400 mb-2">Best by Minimum Moves</div>
                            <Table>
                                <TableHeader>
                                    <TableRow className="border-white/10 hover:bg-transparent">
                                        <TableHead className="text-stone-400">#</TableHead>
                                        <TableHead className="text-stone-400">Player</TableHead>
                                        {leaderboardLevelId === "all" && <TableHead className="text-stone-400">Level</TableHead>}
                                        <TableHead className="text-stone-400">Best Moves</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {levelLeaderboardMoves.slice(0, 100).map((entry, idx) => {
                                        const profile = profiles.find((p) => p.id === entry.userId);
                                        if (!profile) return null;
                                        return (
                                            <TableRow key={`${entry.levelId}-${entry.userId}`} onClick={() => setSelectedUserId(entry.userId)} className="cursor-pointer border-white/5 hover:bg-white/5">
                                                <TableCell className="text-stone-400">{idx + 1}</TableCell>
                                                <TableCell><PlayerIdentity profile={profile} /></TableCell>
                                                {leaderboardLevelId === "all" && <TableCell className="text-stone-400">L{entry.levelId}</TableCell>}
                                                <TableCell>{entry.moves}</TableCell>
                                            </TableRow>
                                        );
                                    })}
                                    {levelLeaderboardMoves.length === 0 && (
                                        <TableRow className="border-white/5">
                                            <TableCell colSpan={leaderboardLevelId === "all" ? 4 : 3} className="py-8 text-center text-stone-500">No completed runs yet.</TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                        <div>
                            <div className="text-xs font-black uppercase tracking-wide text-stone-400 mb-2">Best by Time to Complete</div>
                            <Table>
                                <TableHeader>
                                    <TableRow className="border-white/10 hover:bg-transparent">
                                        <TableHead className="text-stone-400">#</TableHead>
                                        <TableHead className="text-stone-400">Player</TableHead>
                                        {leaderboardLevelId === "all" && <TableHead className="text-stone-400">Level</TableHead>}
                                        <TableHead className="text-stone-400">Time to Complete</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {levelLeaderboardTime.slice(0, 100).map((entry, idx) => {
                                        const profile = profiles.find((p) => p.id === entry.userId);
                                        if (!profile) return null;
                                        return (
                                            <TableRow key={`${entry.levelId}-${entry.userId}`} onClick={() => setSelectedUserId(entry.userId)} className="cursor-pointer border-white/5 hover:bg-white/5">
                                                <TableCell className="text-stone-400">{idx + 1}</TableCell>
                                                <TableCell><PlayerIdentity profile={profile} /></TableCell>
                                                {leaderboardLevelId === "all" && <TableCell className="text-stone-400">L{entry.levelId}</TableCell>}
                                                <TableCell>{formatDuration(entry.timeMs)}</TableCell>
                                            </TableRow>
                                        );
                                    })}
                                    {levelLeaderboardTime.length === 0 && (
                                        <TableRow className="border-white/5">
                                            <TableCell colSpan={leaderboardLevelId === "all" ? 4 : 3} className="py-8 text-center text-stone-500">No completed runs yet.</TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                    </div>
                </TabsContent>

                <TabsContent value="data" className="mt-0 flex min-h-0 flex-1 flex-col">
                    <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
                        <div className="mb-6">
                            <div className="text-sm font-black text-stone-50 mb-1">Beta Testers — Level Skip Access</div>
                            <div className="text-xs text-stone-400 mb-3">
                                Grants the same free level navigation admins get in the main game — never /mapper or /crm access. Use for beta testing specific players without making them admins.
                            </div>
                            <Table>
                                <TableHeader>
                                    <TableRow className="border-white/10 hover:bg-transparent">
                                        <TableHead className="text-stone-400">Player</TableHead>
                                        <TableHead className="text-stone-400">Email</TableHead>
                                        <TableHead className="text-stone-400">Level Skip Access</TableHead>
                                        <TableHead className="text-stone-400">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {profiles.map((p) => {
                                        const isAdmin = adminIds.has(p.id);
                                        const isBeta = betaTesterIds.has(p.id);
                                        return (
                                            <TableRow key={p.id} className="border-white/5">
                                                <TableCell className="font-medium text-stone-100">
                                                    <div className="flex items-center gap-1.5">
                                                        {p.display_name ?? p.id.slice(0, 8)}
                                                        {isAdmin && (
                                                            <Badge variant="outline" className="border-sky-300/30 bg-sky-500/10 text-sky-200">Admin</Badge>
                                                        )}
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-stone-300">{p.email ?? "—"}</TableCell>
                                                <TableCell>
                                                    {isAdmin ? (
                                                        <span className="text-xs text-stone-500">Admin — always has access</span>
                                                    ) : isBeta ? (
                                                        <Badge variant="outline" className="border-violet-300/30 bg-violet-500/10 text-violet-200">Beta access granted</Badge>
                                                    ) : (
                                                        <span className="text-xs text-stone-500">No level-skip access</span>
                                                    )}
                                                </TableCell>
                                                <TableCell>
                                                    <Button
                                                        size="sm"
                                                        variant="ghost"
                                                        disabled={isAdmin}
                                                        className="gap-1.5 text-stone-300 hover:text-stone-100 disabled:opacity-40"
                                                        onClick={() => toggleBetaTester(p.id, isBeta)}
                                                    >
                                                        {isBeta ? <ZapOff className="h-3.5 w-3.5" /> : <Zap className="h-3.5 w-3.5" />}
                                                        {isBeta ? "Revoke Beta Access" : "Grant Beta Access"}
                                                    </Button>
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })}
                                    {profiles.length === 0 && (
                                        <TableRow className="border-white/5">
                                            <TableCell colSpan={4} className="py-8 text-center text-stone-500">No players yet.</TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                        <div className="mb-6">
                            <div className="text-sm font-black text-stone-50 mb-1">Test Users</div>
                            <div className="text-xs text-stone-400 mb-3">Mark accounts as test data to exclude them from analytics and allow bulk deletion.</div>
                            <Table>
                                <TableHeader>
                                    <TableRow className="border-white/10 hover:bg-transparent">
                                        <TableHead className="text-stone-400">Player</TableHead>
                                        <TableHead className="text-stone-400">Email</TableHead>
                                        <TableHead className="text-stone-400">Joined</TableHead>
                                        <TableHead className="text-stone-400">Last Seen</TableHead>
                                        <TableHead className="text-stone-400">Test Flag</TableHead>
                                        <TableHead className="text-stone-400">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {profiles.map((p) => {
                                        const stats = statsByUser.get(p.id) ?? { levelsCompleted: 0, totalClears: 0, totalAttempts: 0, totalMoves: 0, totalPlayMs: 0 };
                                        return (
                                            <TableRow key={p.id} className="border-white/5">
                                                <TableCell className="font-medium text-stone-100">
                                                    <div className="flex items-center gap-1.5">
                                                        {p.display_name ?? p.id.slice(0, 8)}
                                                        {adminIds.has(p.id) && (
                                                            <Badge variant="outline" className="border-sky-300/30 bg-sky-500/10 text-sky-200">Admin</Badge>
                                                        )}
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-stone-300">{p.email ?? "—"}</TableCell>
                                                <TableCell className="text-stone-400">{timeAgo(p.created_at)}</TableCell>
                                                <TableCell className="text-stone-400">{timeAgo(p.last_seen_at)}</TableCell>
                                                <TableCell>
                                                    {p.is_test_user ? (
                                                        <Badge variant="outline" className="border-red-300/30 bg-red-500/10 text-red-200">Test</Badge>
                                                    ) : (
                                                        <span className="text-xs text-stone-500">—</span>
                                                    )}
                                                </TableCell>
                                                <TableCell>
                                                    <div className="flex items-center gap-2">
                                                        <Button
                                                            size="sm"
                                                            variant="ghost"
                                                            className="gap-1.5 text-stone-300 hover:text-stone-100"
                                                            onClick={() => toggleTestUser(p.id, p.is_test_user)}
                                                        >
                                                            {p.is_test_user ? <ShieldOff className="h-3.5 w-3.5" /> : <Shield className="h-3.5 w-3.5" />}
                                                            {p.is_test_user ? "Unmark" : "Mark Test"}
                                                        </Button>
                                                        <Button
                                                            size="sm"
                                                            variant="ghost"
                                                            className="gap-1.5 text-red-300 hover:text-red-100"
                                                            onClick={() => setDeleteTargetId(p.id)}
                                                        >
                                                            <Trash2 className="h-3.5 w-3.5" />
                                                            Delete
                                                        </Button>
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })}
                                    {profiles.length === 0 && (
                                        <TableRow className="border-white/5">
                                            <TableCell colSpan={6} className="py-8 text-center text-stone-500">No players yet.</TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                    </div>
                </TabsContent>
            </Tabs>

            {selectedProfile && (
                <div className="w-[380px] shrink-0 overflow-y-auto border-l border-white/10 bg-stone-900/60 px-4 py-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <div className="text-sm font-black text-stone-50">{selectedProfile.display_name ?? selectedProfile.email}</div>
                            {selectedProfile.display_name && selectedProfile.email && (
                                <div className="text-[10px] text-stone-500">{selectedProfile.email}</div>
                            )}
                        </div>
                        <button onClick={() => setSelectedUserId(null)} className="text-xs text-stone-400 hover:text-stone-200">Close</button>
                    </div>
                    <div className="mt-1 text-xs text-stone-500">
                        Joined {timeAgo(selectedProfile.created_at)} ({formatTimestamp(selectedProfile.created_at)})
                    </div>
                    <div className="text-xs text-stone-500">
                        Last seen {timeAgo(selectedProfile.last_seen_at)} ({formatTimestamp(selectedProfile.last_seen_at)})
                    </div>
                    <div className="text-xs text-stone-500">
                        Total time played: {formatDuration((statsByUser.get(selectedProfile.id) ?? { totalPlayMs: 0 }).totalPlayMs)}
                    </div>
                    {(adminIds.has(selectedProfile.id) || betaTesterIds.has(selectedProfile.id) || selectedProfile.is_test_user) && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                            {adminIds.has(selectedProfile.id) && (
                                <Badge variant="outline" className="border-sky-300/30 bg-sky-500/10 text-sky-200">Admin</Badge>
                            )}
                            {betaTesterIds.has(selectedProfile.id) && (
                                <Badge variant="outline" className="border-violet-300/30 bg-violet-500/10 text-violet-200">Beta Tester</Badge>
                            )}
                            {selectedProfile.is_test_user && (
                                <Badge variant="outline" className="border-red-300/30 bg-red-500/10 text-red-200">Test User</Badge>
                            )}
                        </div>
                    )}

                    <div className="mt-4 text-xs font-black uppercase tracking-wide text-stone-400">Per-level progress</div>
                    <div className="mt-2 space-y-1.5">
                        {selectedProgress.length === 0 && <div className="text-xs text-stone-500">No levels played yet.</div>}
                        {selectedProgress.map((row) => (
                            <div key={row.level_id} className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs">
                                <span className="font-bold text-stone-200">L{row.level_id}</span>
                                <span className={row.completed ? "text-emerald-300" : "text-stone-400"}>
                                    {row.completed ? "Cleared" : "In progress"}
                                </span>
                                <span className="text-stone-400">×{row.clear_count}</span>
                                <span className="text-stone-400">best {row.best_moves ?? "—"} mv</span>
                                {row.best_time_left_seconds != null && (
                                    <span className="text-stone-400">clock {formatClock(row.best_time_left_seconds)}</span>
                                )}
                            </div>
                        ))}
                    </div>

                    <div className="mt-4 text-xs font-black uppercase tracking-wide text-stone-400">Recent attempts</div>
                    <div className="mt-2 space-y-1.5">
                        {selectedRecentAttempts.length === 0 && <div className="text-xs text-stone-500">No sessions logged yet.</div>}
                        {selectedRecentAttempts.map((s) => (
                            <div key={s.id} className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <span className="font-bold text-stone-200">L{s.level_id}</span>
                                    <span className={s.completed ? "text-emerald-300" : s.end_reason === "timed_out" ? "text-red-300" : s.ended_at ? "text-stone-500" : "text-amber-300"}>
                                        {attemptReasonLabel(s)}
                                    </span>
                                    <span className="text-stone-400">{s.moves ?? "—"} mv</span>
                                    <span className="text-stone-400">left {formatClock(s.time_left_seconds)}</span>
                                    {s.active_seconds != null && <span className="text-stone-400">played {formatDuration(s.active_seconds * 1000)}</span>}
                                    {s.syntheticFromProgress && <span className="text-stone-500">progress record</span>}
                                    <span className="text-stone-500" title={formatTimestamp(s.started_at)}>{timeAgo(s.started_at)}</span>
                                </div>
                                <div className="mt-0.5 text-[10px] text-stone-600">{formatTimestamp(s.started_at)}</div>
                                {s.move_history && (
                                    <details className="mt-1.5 rounded-md border border-white/10 bg-black/20 px-2 py-1">
                                        <summary className="cursor-pointer text-[10px] font-black uppercase tracking-wide text-stone-400">
                                            Move history ({s.move_history.length})
                                        </summary>
                                        <div className="mt-2 flex flex-wrap gap-1.5">
                                            <button
                                                type="button"
                                                onClick={() => printMoveHistory(s, selectedProfile.display_name ?? selectedProfile.email ?? selectedProfile.id)}
                                                className="rounded-md border border-white/10 bg-white/[0.05] px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-stone-200 hover:bg-white/[0.1]"
                                            >
                                                Print
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    saveRecordedRun({
                                                        levelId: s.level_id,
                                                        actions: s.move_history ?? [],
                                                        moves: s.moves ?? s.move_history?.filter((a) => a.type === "move").length ?? 0,
                                                        recordedAt: new Date().toISOString(),
                                                    });
                                                    const base = `${window.location.origin}${import.meta.env.BASE_URL}`;
                                                    window.open(`${base}?replayLevel=${s.level_id}`, "_blank");
                                                }}
                                                className="rounded-md border border-red-300/30 bg-red-500/10 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-red-100 hover:bg-red-500/20"
                                            >
                                                Replay
                                            </button>
                                        </div>
                                        <div className="mt-2 max-h-32 overflow-y-auto rounded bg-black/25 p-2 font-mono text-[10px] leading-relaxed text-stone-300">
                                            {moveHistoryLines(s.move_history).map((line) => (
                                                <div key={`${s.id}-${line}`}>{line}</div>
                                            ))}
                                        </div>
                                    </details>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}
            </div>

            <AlertDialog open={deleteTargetId !== null} onOpenChange={(open) => { if (!open) setDeleteTargetId(null); }}>
                <AlertDialogContent className="bg-stone-950 text-stone-50 border-white/10">
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete user data</AlertDialogTitle>
                        <AlertDialogDescription className="text-stone-400">
                            This will permanently remove this player's profiles, progress, and session history from the CRM.
                            The underlying auth account will remain but will have no associated game data.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel className="border-white/10 text-stone-300 hover:text-stone-100">Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={confirmDelete}
                            disabled={deleting}
                            className="bg-red-500 text-white hover:bg-red-400"
                        >
                            {deleting ? "Deleting…" : "Delete"}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
