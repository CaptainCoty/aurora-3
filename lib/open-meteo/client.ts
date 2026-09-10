// Not marked "server-only": these are plain fetches against Open-Meteo's
// public, keyless free-tier endpoints (no secrets here), and this module is
// imported both by API routes and by the standalone backfill script
// (scripts/backfill-open-meteo-historical.ts) run outside Next.js entirely.
import {
  HOURLY_VARIABLES_CORE,
  HOURLY_VARIABLES_EXTENDED,
  KLAX_LATITUDE,
  KLAX_LONGITUDE,
  OPEN_METEO_MODELS,
  OpenMeteoModelKey,
} from "./config";

export class OpenMeteoError extends Error {
  constructor(message: string, public readonly url: string) {
    super(message);
    this.name = "OpenMeteoError";
  }
}

async function fetchJson(url: string): Promise<any> {
  const res = await fetch(url);
  const text = await res.text();
  let body: any;
  try {
    body = JSON.parse(text);
  } catch {
    throw new OpenMeteoError(
      `Open-Meteo returned non-JSON response (HTTP ${res.status}): ${text.slice(0, 300)}`,
      url
    );
  }
  if (!res.ok || body?.error) {
    throw new OpenMeteoError(
      `Open-Meteo request failed (HTTP ${res.status}): ${body?.reason ?? text.slice(0, 300)}`,
      url
    );
  }
  return body;
}

export type ModelMeta = {
  lastRunInitialisationTime: Date;
  lastRunAvailabilityTime: Date;
  updateIntervalSeconds: number;
};

/** Reads the model-status metadata endpoint to find the newest run's init time. */
export async function fetchModelMeta(modelKey: OpenMeteoModelKey): Promise<ModelMeta> {
  const model = OPEN_METEO_MODELS.find((m) => m.key === modelKey);
  if (!model) throw new Error(`Unknown Open-Meteo model key: ${modelKey}`);

  const url = `https://api.open-meteo.com/data/${model.metaSlug}/static/meta.json`;
  const body = await fetchJson(url);

  if (typeof body.last_run_initialisation_time !== "number") {
    throw new OpenMeteoError(
      `meta.json for model "${modelKey}" is missing last_run_initialisation_time`,
      url
    );
  }

  return {
    lastRunInitialisationTime: new Date(body.last_run_initialisation_time * 1000),
    lastRunAvailabilityTime: new Date(body.last_run_availability_time * 1000),
    updateIntervalSeconds: body.update_interval_seconds,
  };
}

export type HourlySeries = {
  time: string[];
  [variable: string]: string[] | number[];
};

/** Fetches the newest available run's KLAX hourly forecast for one model. */
export async function fetchModelHourly(
  modelKey: OpenMeteoModelKey
): Promise<{ hourly: HourlySeries; variablesUsed: string[] }> {
  const model = OPEN_METEO_MODELS.find((m) => m.key === modelKey);
  if (!model) throw new Error(`Unknown Open-Meteo model key: ${modelKey}`);

  const base =
    `https://api.open-meteo.com/v1/forecast?latitude=${KLAX_LATITUDE}&longitude=${KLAX_LONGITUDE}` +
    `&models=${model.forecastSlug}&timezone=UTC&past_days=1&forecast_days=16`;

  try {
    const body = await fetchJson(`${base}&hourly=${HOURLY_VARIABLES_EXTENDED.join(",")}`);
    return { hourly: body.hourly, variablesUsed: HOURLY_VARIABLES_EXTENDED };
  } catch (err) {
    // Not every model exposes every extended (radiation/upper-air) field.
    // Fall back to the core set rather than losing the whole run.
    const body = await fetchJson(`${base}&hourly=${HOURLY_VARIABLES_CORE.join(",")}`);
    return { hourly: body.hourly, variablesUsed: HOURLY_VARIABLES_CORE };
  }
}

/** Fetches KLAX hourly historical data for one [startDate, endDate] range (inclusive, YYYY-MM-DD, UTC). */
export async function fetchHistoricalHourly(
  startDate: string,
  endDate: string
): Promise<{ hourly: HourlySeries; variablesUsed: string[] }> {
  const url =
    `https://historical-forecast-api.open-meteo.com/v1/forecast?latitude=${KLAX_LATITUDE}&longitude=${KLAX_LONGITUDE}` +
    `&timezone=UTC&start_date=${startDate}&end_date=${endDate}` +
    `&hourly=${HOURLY_VARIABLES_EXTENDED.join(",")}`;

  const body = await fetchJson(url);
  return { hourly: body.hourly, variablesUsed: HOURLY_VARIABLES_EXTENDED };
}
