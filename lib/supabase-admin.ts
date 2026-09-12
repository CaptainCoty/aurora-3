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
    global: {
      // Next.js's server-side Data Cache intercepts every fetch() made
      // during a Server Component render or Route Handler — including this
      // client's internal requests to Supabase's REST API — and caches the
      // response indefinitely (default revalidate: 1 year) unless told
      // otherwise. Route-level `export const dynamic = "force-dynamic"`
      // does not reliably reach fetches made inside a third-party client
      // like this one, so an old cached response (e.g. from when a table
      // was empty) can keep being served forever regardless of what's
      // actually in Postgres now. Force "no-store" here so every query
      // always hits the database live.
      fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }),
    },
  });

  return cachedClient;
}
