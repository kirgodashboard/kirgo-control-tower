import { createClient } from "@supabase/supabase-js";

// Service-role client for Next.js API routes (server-side only).
// Never expose SUPABASE_SERVICE_ROLE_KEY to the browser.
export function makeSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}
