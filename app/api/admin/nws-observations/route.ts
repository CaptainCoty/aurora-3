import { NextRequest, NextResponse } from "next/server";
import { fetchKlaxLiveEvidence } from "@/lib/nws/klax";

// Standalone, manually-testable live NWS KLAX fetch (Master Plan Section 7,
// Phase 2 item 3). Not called automatically and nothing here is stored —
// this only runs live, on request. Phase 4's Snapshot Run is the eventual
// caller; for now hit this directly while logged in to confirm it works:
//
//   GET /api/admin/nws-observations
//   GET /api/admin/nws-observations?at=2026-09-08T20:00:00Z
//
// Already behind the app's normal session-password gate (middleware.ts),
// same as every other route except /login and /api/cron/*.

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const atParam = req.nextUrl.searchParams.get("at");
  let at = new Date();

  if (atParam) {
    const parsed = new Date(atParam);
    if (Number.isNaN(parsed.getTime())) {
      return NextResponse.json({ error: `Invalid "at" timestamp: ${atParam}` }, { status: 400 });
    }
    at = parsed;
  }

  try {
    const evidence = await fetchKlaxLiveEvidence(at);
    return NextResponse.json(evidence);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 502 }
    );
  }
}
