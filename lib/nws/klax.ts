// Not marked "server-only": no secrets live here (NWS needs no API key),
// and keeping this importable from a plain script keeps it testable
// outside Next.js too.
//
// Live NWS KLAX evidence, fetched fresh on every call — never stored
// historically (Master Plan Section 7: the terminal's background KLAX
// refresh is display-only and separate from this; this function is what
// Phase 4's Snapshot Run will eventually call). Point-in-time integrity
// (Section 4) is enforced by always passing `end=<the given timestamp>` to
// NWS, and by deriving "latest" from that bounded result set rather than
// calling NWS's own /observations/latest endpoint — which always returns
// whatever is truly current right now and would leak future-of-cutoff data
// whenever this function is exercised with a non-"now" timestamp (e.g. in
// tests, or a later replay/backtest use).

const NWS_STATION = "KLAX";
const LA_TIME_ZONE = "America/Los_Angeles";

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function formatPartsMap(instant: Date, timeZone: string, opts: Intl.DateTimeFormatOptions): Record<string, string> {
  const dtf = new Intl.DateTimeFormat("en-US", { timeZone, ...opts });
  const parts: Record<string, string> = {};
  for (const p of dtf.formatToParts(instant)) {
    if (p.type !== "literal") parts[p.type] = p.value;
  }
  return parts;
}

function getTimeZoneOffsetMs(instant: Date, timeZone: string): number {
  const parts = formatPartsMap(instant, timeZone, {
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second)
  );
  return asUtc - instant.getTime();
}

function laCalendarDate(instant: Date): { year: number; month: number; day: number } {
  const parts = formatPartsMap(instant, LA_TIME_ZONE, { year: "numeric", month: "2-digit", day: "2-digit" });
  return { year: Number(parts.year), month: Number(parts.month), day: Number(parts.day) };
}

/** The UTC instant corresponding to 00:00:00 America/Los_Angeles on the calendar date `instant` falls on in that zone. */
export function laMidnightUtcInstant(instant: Date): Date {
  const { year, month, day } = laCalendarDate(instant);
  // DST only ever transitions at 2am local, so the offset at `instant`
  // (assumed close to the same local day) is safe to reuse for midnight.
  // Compare at whole-second resolution: getTimeZoneOffsetMs derives its
  // reading from formatted (whole-second) parts, so mixing it with
  // instant's own sub-second component would leak up to 999ms of jitter
  // into what should be an exact midnight boundary.
  const offsetMs = getTimeZoneOffsetMs(instant, LA_TIME_ZONE);
  const wallClockAsUtc = Date.UTC(year, month - 1, day, 0, 0, 0);
  return new Date(Math.round((wallClockAsUtc - offsetMs) / 1000) * 1000);
}

export function laDateString(instant: Date): string {
  const { year, month, day } = laCalendarDate(instant);
  return `${year}-${pad(month)}-${pad(day)}`;
}

export type NwsObservation = {
  timestamp: string;
  raw: Record<string, unknown>;
};

export type KlaxLiveEvidence = {
  station: string;
  ptDate: string;
  requestedAt: string;
  dayStartUtc: string;
  latest: NwsObservation | null;
  observations: NwsObservation[];
};

function nwsUserAgent(): string {
  return process.env.NWS_USER_AGENT || "(aurora-klax-app, contact-not-set)";
}

export async function fetchKlaxLiveEvidence(at: Date): Promise<KlaxLiveEvidence> {
  const dayStart = laMidnightUtcInstant(at);
  const ptDate = laDateString(at);

  const url =
    `https://api.weather.gov/stations/${NWS_STATION}/observations` +
    `?start=${encodeURIComponent(dayStart.toISOString())}&end=${encodeURIComponent(at.toISOString())}&limit=500`;

  const res = await fetch(url, {
    headers: { "User-Agent": nwsUserAgent(), Accept: "application/geo+json" },
  });
  const text = await res.text();

  let body: any;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error(`NWS observations request returned non-JSON (HTTP ${res.status}): ${text.slice(0, 300)}`);
  }
  if (!res.ok) {
    throw new Error(`NWS observations request failed (HTTP ${res.status}) for station ${NWS_STATION}: ${body?.detail ?? text.slice(0, 300)}`);
  }

  const features: any[] = Array.isArray(body.features) ? body.features : [];
  const observations: NwsObservation[] = features
    .map((f) => ({ timestamp: f.properties.timestamp as string, raw: f.properties as Record<string, unknown> }))
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  const latest = observations.length > 0 ? observations[observations.length - 1] : null;

  return {
    station: NWS_STATION,
    ptDate,
    requestedAt: at.toISOString(),
    dayStartUtc: dayStart.toISOString(),
    latest,
    observations,
  };
}
