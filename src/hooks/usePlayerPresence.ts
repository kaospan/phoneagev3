import { useEffect, useRef } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabaseClient";

const PRESENCE_CHANNEL = "game-presence";

/** Tracks this player as "online" on a shared Realtime presence channel the CRM reads from. */
export function usePlayerPresence(userId: string | null, email: string | null, levelId: number | null) {
    const channelRef = useRef<RealtimeChannel | null>(null);
    const subscribedRef = useRef(false);

    useEffect(() => {
        if (!supabase || !userId) return;
        const channel = supabase.channel(PRESENCE_CHANNEL, { config: { presence: { key: userId } } });
        channelRef.current = channel;
        channel.subscribe((status) => {
            if (status === "SUBSCRIBED") {
                subscribedRef.current = true;
                void channel.track({ email, level_id: levelId, online_at: new Date().toISOString() });
            }
        });
        return () => {
            subscribedRef.current = false;
            void supabase.removeChannel(channel);
            channelRef.current = null;
        };
        // Re-subscribing on every level change would thrash the channel; level updates go through
        // the effect below instead via .track() on the already-open channel.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [userId]);

    useEffect(() => {
        if (!subscribedRef.current || !channelRef.current) return;
        void channelRef.current.track({ email, level_id: levelId, online_at: new Date().toISOString() });
    }, [email, levelId]);
}
