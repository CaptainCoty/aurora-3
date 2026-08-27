import { getSupabaseAdmin } from "@/lib/supabase-admin";
import type { WuOutcome } from "@/lib/types";
import OutcomesClient from "./OutcomesClient";
import LogoutButton from "@/components/LogoutButton";

export const dynamic = "force-dynamic";

export default async function OutcomesPage() {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("wu_klax_outcomes")
    .select("*")
    .order("date", { ascending: false });

  const initialOutcomes: WuOutcome[] = error || !data ? [] : (data as WuOutcome[]);

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <header className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="font-mono text-lg font-semibold tracking-wide text-ink">
            AURORA <span className="text-accent">3.0</span>
          </h1>
          <p className="mt-1 text-xs text-muted">
            Outcomes &middot; KLAX manual WU final-high backfill
          </p>
        </div>
        <LogoutButton />
      </header>

      {error && (
        <p className="mb-4 rounded border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">
          Failed to load outcomes: {error.message}
        </p>
      )}

      <OutcomesClient initialOutcomes={initialOutcomes} />
    </main>
  );
}
