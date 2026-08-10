import { VIEW_MODES, type ViewMode } from '@/components/PuzzleGame';
import { supabase } from '@/lib/supabaseClient';

// Which camera view-modes the main game's view-cycle button should skip — a real, universal
// setting in Supabase (see schema_disabled_view_modes.sql) rather than a per-browser preference,
// so an admin disabling a mode in the Mapper actually affects every player, not just themselves.
// Reads are cached in-memory and kept fresh via a Realtime subscription; writes are admin-only
// (enforced by RLS, not just hidden UI).

export { VIEW_MODES };
export type { ViewMode };

export const DISABLED_VIEW_MODES_UPDATED_EVENT = 'disabled-view-modes-updated';

let cache: ViewMode[] = [];
let loaded = false;
let inFlight: Promise<ViewMode[]> | null = null;

const isViewMode = (m: string): m is ViewMode => (VIEW_MODES as readonly string[]).includes(m);

const notify = () => {
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event(DISABLED_VIEW_MODES_UPDATED_EVENT));
    }
};

/** Synchronous best-effort read — returns whatever's cached (empty until the first fetch resolves). */
export const getDisabledViewModes = (): ViewMode[] => cache;

export const isViewModeSkipped = (mode: ViewMode): boolean => cache.includes(mode);

/** Fetches the current server state once (de-duped) and refreshes the in-memory cache. */
export const fetchDisabledViewModes = async (): Promise<ViewMode[]> => {
    if (!supabase) return cache;
    if (inFlight) return inFlight;
    inFlight = (async () => {
        const { data, error } = await supabase.from('disabled_view_modes').select('view_mode');
        inFlight = null;
        if (error) {
            console.warn('[viewModePrefs] fetch error:', error.message);
            return cache;
        }
        cache = (data ?? []).map((r) => r.view_mode as string).filter(isViewMode);
        loaded = true;
        notify();
        return cache;
    })();
    return inFlight;
};

export const isDisabledViewModesLoaded = (): boolean => loaded;

/**
 * Admin-only (RLS-enforced) — non-admin writes are rejected server-side and logged, not silently
 * no-op. Returns whether it actually succeeded so callers doing an optimistic UI update know to
 * revert it on failure.
 */
export const setViewModeSkipped = async (mode: ViewMode, skip: boolean): Promise<boolean> => {
    if (!supabase) return false;
    if (skip) {
        const { error } = await supabase.from('disabled_view_modes').upsert({ view_mode: mode });
        if (error) { console.warn('[viewModePrefs] disable error:', error.message); return false; }
        if (!cache.includes(mode)) cache = [...cache, mode];
    } else {
        const { error } = await supabase.from('disabled_view_modes').delete().eq('view_mode', mode);
        if (error) { console.warn('[viewModePrefs] enable error:', error.message); return false; }
        cache = cache.filter((m) => m !== mode);
    }
    notify();
    return true;
};

let realtimeSubscribed = false;

/** Call once (e.g. from PuzzleGame's mount) to keep the cache live across all connected clients. */
export const subscribeToDisabledViewModes = (): (() => void) => {
    if (!supabase) return () => {};
    void fetchDisabledViewModes();
    if (realtimeSubscribed) return () => {};
    realtimeSubscribed = true;
    const channel = supabase
        .channel('disabled-view-modes-sync')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'disabled_view_modes' }, () => {
            void fetchDisabledViewModes();
        })
        .subscribe();
    return () => {
        realtimeSubscribed = false;
        void supabase.removeChannel(channel);
    };
};
