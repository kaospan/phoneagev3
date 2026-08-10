import { supabase } from "@/lib/supabaseClient";

/**
 * Server-verified check of whether a signed-in user has beta-tester level-skip access
 * (row exists in beta_testers). Deliberately separate from admin_users — granting this can
 * never imply /mapper or /crm access, only the same free level navigation admins get in-game.
 */
export async function checkIsBetaTester(userId: string): Promise<boolean> {
  if (!supabase) return false;
  const { data, error } = await supabase
    .from("beta_testers")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    console.warn("[betaTesters] check failed:", error.message);
    return false;
  }
  return Boolean(data);
}
