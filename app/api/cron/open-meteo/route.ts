import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { OPEN_METEO_MODELS } from "@/lib/open-meteo/config";
import { fetchModelHourly, fetchModelMeta } from "@/lib/open-meteo/client";

// Ongoing adaptive Open-Meteo collection (Master Plan Section 7, Phase 2).
// Triggered by Vercel Cron (see vercel.json) on a schedule staggered across
// several fixed daily times, since the Hobby plan caps any single cron
// entry at once-per-day. Each of the four selected models is checked
// independently; only a genuinely new run (by last_run_initialisation_time)
// is fetched and stored. One model failing does not block the others —
// consistent with Section 15's "missing/stale source degrades, does not
// hard-stop" behavior extended to collection itself.

export const runtime = "nodejs";
export const maxDuration = 60;

type ModelResult =
  | { model: string; status: "stored"; runAt: string }
  | { model: string; status: "already_have_latest"; runAt: string }
  | { model: string; status: "error"; error: string };

function verifyCronRequest(req: NextRequest): { ok: true } | { ok: false; error: string } {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return { ok: false, error: "CRON_SECRET env var is not configured on the server" };
  }
  const header = req.headers.get("authorization");
  if (header !== `Bearer ${secret}`) {
    return { ok: false, error: "Missing or invalid Authorization bearer token" };
  }
  return { ok: true };
}

export async function GET(req: NextRequest) {
  const auth = verifyCronRequest(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  const results: ModelResult[] = [];

  for (const model of OPEN_METEO_MODELS) {
    try {
      const meta = await fetchModelMeta(model.key);
      const runAtIso = meta.lastRunInitialisationTime.toISOString();

      const { data: existing, error: selectError } = await supabase
        .from("open_meteo_runs")
        .select("run_at")
        .eq("model", model.key)
        .order("run_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (selectError) {
        results.push({ model: model.key, status: "error", error: `Supabase select failed: ${selectError.message}` });
        continue;
      }

      if (existing && new Date(existing.run_at).getTime() >= meta.lastRunInitialisationTime.getTime()) {
        results.push({ model: model.key, status: "already_have_latest", runAt: existing.run_at });
        continue;
      }

      const { hourly, variablesUsed } = await fetchModelHourly(model.key);

      const { error: insertError } = await supabase.from("open_meteo_runs").upsert(
        {
          model: model.key,
          run_at: runAtIso,
          fetched_at: new Date().toISOString(),
          variables_used: variablesUsed,
          data: hourly,
        },
        { onConflict: "model,run_at" }
      );

      if (insertError) {
        results.push({ model: model.key, status: "error", error: `Supabase upsert failed: ${insertError.message}` });
        continue;
      }

      results.push({ model: model.key, status: "stored", runAt: runAtIso });
    } catch (err) {
      results.push({ model: model.key, status: "error", error: err instanceof Error ? err.message : String(err) });
    }
  }

  return NextResponse.json({ checkedAt: new Date().toISOString(), results });
}
