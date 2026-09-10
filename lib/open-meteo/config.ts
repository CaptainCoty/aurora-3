// KLAX is a permanent system boundary (never another airport, never inland
// LA) — see Master Plan Section 3 — so these coordinates are a constant,
// not configuration.
export const KLAX_LATITUDE = 33.9425;
export const KLAX_LONGITUDE = -118.4081;

export type OpenMeteoModelKey = "gfs" | "hrrr" | "ecmwf_ifs" | "nbm";

export const OPEN_METEO_MODELS: Array<{
  key: OpenMeteoModelKey;
  label: string;
  /** Slug for the model-status metadata endpoint (…/data/<slug>/static/meta.json). */
  metaSlug: string;
  /** Slug for the `&models=` param on the regular Forecast API. */
  forecastSlug: string;
}> = [
  { key: "gfs", label: "GFS (NCEP, 0.13°)", metaSlug: "ncep_gfs013", forecastSlug: "ncep_gfs013" },
  { key: "hrrr", label: "HRRR (NCEP Conus)", metaSlug: "ncep_hrrr_conus", forecastSlug: "ncep_hrrr_conus" },
  { key: "ecmwf_ifs", label: "ECMWF IFS (0.25° open-data)", metaSlug: "ecmwf_ifs025", forecastSlug: "ecmwf_ifs025" },
  { key: "nbm", label: "NBM (NCEP Conus)", metaSlug: "ncep_nbm_conus", forecastSlug: "ncep_nbm_conus" },
];

// Core set: confirmed available across the historical-forecast API and all
// four forecast models. Kept separate from EXTENDED so a 400 from one
// model's less-complete variable support can be retried without losing the
// whole fetch (Section 15: missing evidence degrades gracefully, it never
// hard-stops collection).
export const HOURLY_VARIABLES_CORE = [
  "temperature_2m",
  "dew_point_2m",
  "relative_humidity_2m",
  "apparent_temperature",
  "wind_speed_10m",
  "wind_direction_10m",
  "wind_gusts_10m",
  "cloud_cover",
  "cloud_cover_low",
  "cloud_cover_mid",
  "cloud_cover_high",
  "pressure_msl",
  "surface_pressure",
  "precipitation",
];

// Best-effort additions: consistently documented for the Historical Forecast
// API; attempted for live per-model collection with fallback to core-only
// on failure (not every model exposes every upper-air/radiation field).
export const HOURLY_VARIABLES_EXTENDED = [
  ...HOURLY_VARIABLES_CORE,
  "shortwave_radiation",
  "direct_radiation",
  "diffuse_radiation",
  "visibility",
  "cape",
  "freezing_level_height",
  "temperature_850hPa",
  "geopotential_height_500hPa",
];
