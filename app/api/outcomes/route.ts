import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import type { OutcomeEntryInput } from "@/lib/types";

export const runtime = "nodejs";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MIN_TEMP_F = -30;
const MAX_TEMP_F = 140;

function validateEntry(entry: unknown): { ok: true; value: OutcomeEntryInput } | { ok: false; error: string } {
  if (typeof entry !== "object" || entry === null) {
    return { ok: false, error: "Entry must be an object" };
  }
  const e = entry as Record<string, unknown>;

  if (typeof e.date !== "string" || !DATE_RE.test(e.date)) {
    return { ok: false, error: `Invalid date: ${String(e.date)}` };
  }

  const finalHigh = typeof e.final_high_f === "number" ? e.final_high_f : Number(e.final_high_f);
  if (!Number.isFinite(finalHigh) || !Number.isInteger(finalHigh)) {
    return { ok: false, error: `final_high_f must be a whole number (date ${e.date})` };
  }
  if (finalHigh < MIN_TEMP_F || finalHigh > MAX_TEMP_F) {
    return { ok: false, error: `final_high_f out of range (date ${e.date})` };
  }

  const source = typeof e.source === "string" && e.source.trim().length > 0 ? e.source.trim() : "WU";
  const isVerified = typeof e.is_verified === "boolean" ? e.is_verified : true;

  return {
    ok: true,
    value: { date: e.date, final_high_f: finalHigh, source, is_verified: isVerified },
  };
}

export async function GET() {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("wu_klax_outcomes")
    .select("*")
    .order("date", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ outcomes: data });
}

export async function POST(req: NextRequest) {
  let body: { entries?: unknown[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!Array.isArray(body.entries) || body.entries.length === 0) {
    return NextResponse.json({ error: "entries must be a non-empty array" }, { status: 400 });
  }

  const validated: OutcomeEntryInput[] = [];
  for (const raw of body.entries) {
    const result = validateEntry(raw);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    validated.push(result.value);
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.rpc("upsert_wu_outcomes_batch", {
    p_entries: validated,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ outcomes: data });
}
