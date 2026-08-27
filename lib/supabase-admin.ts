import "server-only";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

// Server-only Supabase client using the service role key. Never import this
// file from a Client Component — it must only run in Route Handlers, Server
// Components, or Server Actions. The browser never talks to Supabase directly
// in this app; all reads/writes go through our own API routes.

let cachedClient: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient {
  if (cachedClient) return cachedClient;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars."
    );
  }

  cachedClient = createClient(url, key, {
    auth: { persistSession: false },
  });

  return cachedClient;
}
