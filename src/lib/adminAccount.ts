import { supabase } from "@/lib/supabaseClient";

/**
 * Server-verified check of whether a signed-in user is an admin (row exists in admin_users).
 * Unlike the stone-age-admin-mode localStorage flag, this can't be spoofed by editing
 * localStorage — RLS only lets a user read their OWN admin_users row, so the check is
 * authoritative regardless of what the client claims.
 */
export async function checkIsAdminAccount(userId: string): Promise<boolean> {
  if (!supabase) return false;
  const { data, error } = await supabase
    .from("admin_users")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    console.warn("[adminAccount] check failed:", error.message);
    return false;
  }
  return Boolean(data);
}
