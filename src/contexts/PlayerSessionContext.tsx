import { createContext, useContext } from "react";
import type { User } from "@supabase/supabase-js";

export interface PlayerSessionValue {
  user: User;
  signOut: () => void;
}

const PlayerSessionContext = createContext<PlayerSessionValue | null>(null);

export const PlayerSessionProvider = PlayerSessionContext.Provider;

/** The authenticated player's session. Only valid inside <PlayerAuthGate>; returns null outside it. */
export function usePlayerSession(): PlayerSessionValue | null {
  return useContext(PlayerSessionContext);
}
