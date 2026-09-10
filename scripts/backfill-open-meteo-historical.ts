// One-time historical backfill: pulls the last ~3 years of real, elapsed
// KLAX hourly weather from Open-Meteo's Historical Forecast API and stores
// it in open_meteo_historical_hourly. Run this yourself; nothing schedules
// it automatically (Master Plan Section 24, Phase 2).
//
// Usage (from repo root, after `npm install`):
//   npm run backfill:open-meteo
//
// Safe to re-run: rows are upserted on valid_time, so re-running refreshes
// any hours Open-Meteo has since revised rather than creating duplicates.

import { config as loadEnv } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { fetchHistoricalHourly, HourlySeries } from "../lib/open-meteo/client";

// "dotenv/config"'s default auto-loader only reads a file named .env — the
// rest of this app (Next.js) reads .env.local instead, so load that
// explicitly to match, rather than requiring a second, redundant env file.
loadEnv({ path: ".env.local" });

const BACKFILL_YEARS = 3;
const ROWS_PER_UPSERT = 1000;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var ${name}. Copy .env.example to .env.local and fill it in.`);
  }
  return value;
}

function toDateString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Splits [start, end] into <=366-day chunks so each Open-Meteo request stays a reasonable size. */
function yearChunks(start: Date, end: Date): Array<{ startDate: string; endDate: string }> {
  const chunks: Array<{ startDate: string; endDate: string }> = [];
  let cursor = new Date(start);
  while (cursor < end) {
    const chunkEnd = new Date(cursor);
    chunkEnd.setUTCFullYear(chunkEnd.getUTCFullYear() + 1);
    chunkEnd.setUTCDate(chunkEnd.getUTCDate() - 1);
    const actualEnd = chunkEnd > end ? end : chunkEnd;
    chunks.push({ startDate: toDateString(cursor), endDate: toDateString(actualEnd) });
    cursor = new Date(actualEnd);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return chunks;
}

function rowsFromHourly(hourly: HourlySeries, variablesUsed: string[]): Array<Record<string, unknown>> {
  const times = hourly.time;
  const rows: Array<Record<string, unknown>> = [];

  for (let i = 0; i < times.length; i++) {
    const data: Record<string, unknown> = {};
    for (const variable of variablesUsed) {
      const series = hourly[variable];
      if (Array.isArray(series)) data[variable] = series[i] ?? null;
    }
    rows.push({
      valid_time: new Date(`${times[i]}Z`).toISOString(),
      source: "open-meteo-historical-forecast",
      variables_used: variablesUsed,
      data,
    });
  }

  return rows;
}

async function main() {
  const supabase = createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false },
  });

  const end = new Date();
  const start = new Date(end);
  start.setUTCFullYear(start.getUTCFullYear() - BACKFILL_YEARS);

  const chunks = yearChunks(start, end);
  console.log(`Backfilling KLAX historical hourly data: ${toDateString(start)} -> ${toDateString(end)} in ${chunks.length} chunk(s).`);

  let totalRows = 0;

  for (const chunk of chunks) {
    console.log(`Fetching ${chunk.startDate} -> ${chunk.endDate} from Open-Meteo...`);
    const { hourly, variablesUsed } = await fetchHistoricalHourly(chunk.startDate, chunk.endDate);
    const rows = rowsFromHourly(hourly, variablesUsed);
    console.log(`  ${rows.length} hourly rows. Upserting in batches of ${ROWS_PER_UPSERT}...`);

    for (let i = 0; i < rows.length; i += ROWS_PER_UPSERT) {
      const batch = rows.slice(i, i + ROWS_PER_UPSERT);
      const { error } = await supabase
        .from("open_meteo_historical_hourly")
        .upsert(batch, { onConflict: "valid_time" });
      if (error) {
        throw new Error(`Supabase upsert failed for ${chunk.startDate}..${chunk.endDate} batch starting at row ${i}: ${error.message}`);
      }
    }

    totalRows += rows.length;
    // Be polite to the free-tier API between chunks.
    await sleep(1000);
  }

  console.log(`Done. Upserted ${totalRows} hourly rows total.`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
