# Aurora 3.0 — Phases 1 & 2

Private, KLAX-only weather-prediction and trading-decision-support tool.
Single operator, single shared password.

- **Phase 1**: project scaffold, Supabase schema, password auth, and the
  Outcomes batch-entry page for manually backfilling Weather Underground
  KLAX final highs.
- **Phase 2**: a one-time historical Open-Meteo backfill script, an ongoing
  Vercel Cron job that adaptively collects new GFS/HRRR/ECMWF IFS/NBM model
  runs, and a standalone live NWS KLAX fetch route.

No ML model, Snapshot page, Models page, or Settings page yet — those are
later phases.

## Stack

- Next.js 14 (App Router) + TypeScript
- Tailwind CSS (dark terminal/dashboard styling)
- Supabase (Postgres) as the database, accessed only from the server via the
  service role key — the browser never talks to Supabase directly
- Single shared password, stored as plaintext in an env var and compared
  server-side with a constant-time check, session held in a signed httpOnly
  cookie (JWT via `jose`)
- Deploy target: Vercel

## 1. Create the Supabase project

1. Create a new project at [supabase.com](https://supabase.com).
2. Open the SQL editor and run the contents of [`supabase/schema.sql`](supabase/schema.sql)
   once. It's idempotent (`if not exists` / `create or replace`), so re-running
   it later is safe.
3. From Project Settings -> API, note:
   - Project URL -> `SUPABASE_URL`
   - `service_role` secret key -> `SUPABASE_SERVICE_ROLE_KEY` (**never** expose
     this in client-side code or `NEXT_PUBLIC_*` vars — it bypasses row-level
     security)

## 2. Configure environment variables

Copy the example file:

```powershell
Copy-Item .env.example .env.local
```

Fill in `.env.local`:

- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` — from step 1.
- `AURORA_PASSWORD` — your login password, stored as plaintext. This is a
  deliberate simplicity tradeoff for a private single-operator tool: anyone
  who can read this env var (locally, or in Vercel's project settings) can
  read your password directly, unlike a hashed value. If the password
  contains a literal `$`, escape each one as `$$` — Next.js's `.env` loader
  (`dotenv-expand`) otherwise treats `$` as the start of a variable
  reference and silently mangles the value.
- `SESSION_SECRET` — a long random string used to sign the session cookie:
  ```powershell
  node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
  ```
- `CRON_SECRET` — a long random string (generate the same way) that the
  Open-Meteo collection cron job checks on every trigger. You set this in
  Vercel's Environment Variables too; Vercel automatically sends it back as
  `Authorization: Bearer <value>` when it invokes crons for this project.
- `NWS_USER_AGENT` — e.g. `(aurora-klax-app, you@example.com)`. NWS's API
  etiquette asks every client to self-identify with a contact so they can
  reach you if something misbehaves; fill in your own address rather than
  leaving the example placeholder.

## 3. Run locally

Requires Node.js 18.18+ (Node 20 LTS recommended).

```powershell
npm install
npm run dev
```

Visit `http://localhost:3000`. You'll be redirected to `/login`; enter the
password you set in step 2. On success you land on `/outcomes`.

> This project was scaffolded in an environment without Node.js installed, so
> `npm install` / `npm run build` have not been run or verified here. Run
> both locally before trusting the build, and check `npm run lint` too.

## 4. Using the Outcomes page

- **Batch entry**: type a date and whole-degree final high per row. Pressing
  Enter in the temperature field jumps to (or creates) the next row, so you
  can keep typing without touching the mouse. Click **Save batch** to persist
  every filled row in one request.
- **Editing a past entry**: click `edit` on a saved row, change the value,
  click `save`. The previous value is preserved in that day's correction
  history (visible via the `N corrections` link) rather than being silently
  overwritten — enforced atomically in the database, not just in the UI.
- **Verified**: defaults to checked. Uncheck it for a value you've entered
  but haven't double-checked against Weather Underground yet; later phases
  use `is_verified` to decide whether an outcome is trusted enough to score
  predictions against.

## 5. Run the one-time Open-Meteo historical backfill

Pulls the last ~3 years of real, elapsed KLAX hourly weather from
Open-Meteo's free Historical Forecast API and stores it in
`open_meteo_historical_hourly`. This is a script **you** run once yourself —
nothing schedules it automatically.

1. Make sure you've run the latest `supabase/schema.sql` in the Supabase SQL
   editor (it adds `open_meteo_historical_hourly` and `open_meteo_runs`'
   Phase 2 columns; it's idempotent, safe to re-run).
2. Make sure `.env.local` has `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`
   set (step 2 above).
3. Run:
   ```powershell
   npm run backfill:open-meteo
   ```
   It fetches in yearly chunks with a short pause between requests, logs
   progress per chunk, and upserts rows in batches of 1000 keyed on
   `valid_time` — safe to re-run later if you want to refresh the window or
   Open-Meteo revises past hours.
4. Expect roughly 26,000 hourly rows (3 years × ~8,760 hours) and a few
   minutes of runtime, most of it spent waiting on Open-Meteo's API.

## 6. Ongoing adaptive Open-Meteo collection (Vercel Cron)

`app/api/cron/open-meteo` checks the four selected models — GFS, HRRR,
ECMWF IFS, and NBM — for a genuinely new run (by Open-Meteo's own
`last_run_initialisation_time`) and stores only runs it doesn't already
have, in `open_meteo_runs`, one model at a time so one model failing never
blocks the others.

**Vercel's Hobby (free) plan caps every individual cron schedule at once per
day** — an expression that would fire more than once daily is rejected at
deploy time. Since HRRR and NBM publish a new run roughly every hour,
`vercel.json` works around this by registering the same cron path six times
at staggered fixed UTC hours (00:00, 04:00, 08:00, 12:00, 16:00, 20:00),
giving ~6 chances a day to catch a new run per model instead of 1. GFS and
ECMWF IFS update every 6 hours, so 6 checks/day should catch effectively all
of their runs; HRRR/NBM will still miss some hourly runs on the free plan —
that's an inherent Hobby-plan tradeoff, not a bug. If you're on Vercel Pro,
you can simplify `vercel.json` to one entry with an hourly schedule
(`"0 * * * *"`) instead.

Setup:
1. Set `CRON_SECRET` in both `.env.local` and Vercel's Environment Variables
   (see step 2 above).
2. Deploy — Vercel reads `vercel.json`'s `crons` array automatically.
3. To trigger it manually for testing (e.g. locally, or against a deployed
   URL) without waiting for the schedule:
   ```powershell
   curl -H "Authorization: Bearer $env:CRON_SECRET" http://localhost:3000/api/cron/open-meteo
   ```
   It returns a JSON summary per model: `stored`, `already_have_latest`, or
   `error` with the actual failing reason.

## 7. Live NWS KLAX fetch (manual test route)

`GET /api/admin/nws-observations` fetches, live and on-demand, the latest
NWS KLAX observation plus every KLAX observation from that same
America/Los_Angeles calendar day up to the given timestamp. Nothing here is
called automatically or stored — it exists so you can confirm it works
before Phase 4 wires it into the Snapshot page.

It's behind the same password-session gate as the rest of the app, so log
in via the browser first, then hit it in the same browser tab (or copy the
session cookie into `curl`):

```
GET /api/admin/nws-observations
GET /api/admin/nws-observations?at=2026-09-08T20:00:00Z
```

`at` is optional and defaults to now. The response includes `ptDate` (the
resolved America/Los_Angeles calendar date), `dayStartUtc`, `latest` (the
most recent observation at or before `at`), and the full `observations`
array for that day up to `at`.

## 8. Deploy to Vercel

1. Push this repo to GitHub (or your Git provider of choice).
2. Import the repo in Vercel.
3. Add all environment variables from `.env.local` in the Vercel project's
   Settings -> Environment Variables (Production and Preview), including
   `CRON_SECRET` and `NWS_USER_AGENT`.
4. Deploy. Vercel auto-detects Next.js and the `crons` array in
   `vercel.json`; no build command changes needed.

## Project structure

```
app/
  login/              password gate UI
  outcomes/           batch-entry backfill page (server component + client table)
  api/auth/           login/logout route handlers
  api/outcomes/       GET (list) / POST (batch upsert with correction history)
  api/cron/open-meteo/       adaptive collection cron target (CRON_SECRET-gated)
  api/admin/nws-observations/  standalone live NWS KLAX test route (session-gated)
lib/
  auth.ts             session token creation/verification (jose)
  supabase-admin.ts    server-only Supabase client (service role)
  rate-limit.ts        best-effort in-memory login rate limiting
  types.ts             shared TS types
  open-meteo/config.ts  KLAX coords, model slugs, hourly variable lists
  open-meteo/client.ts  Open-Meteo fetch helpers (meta/run/historical)
  nws/klax.ts           live NWS KLAX fetch + America/Los_Angeles day-boundary math
components/
  LogoutButton.tsx
scripts/
  backfill-open-meteo-historical.ts  one-time historical backfill (run yourself)
supabase/
  schema.sql            full schema + RPCs, run this in Supabase
middleware.ts            enforces the password gate on every route except /login and /api/cron/*
vercel.json              staggered daily cron schedule for adaptive collection
```

## Notes on what's intentionally not here yet

Per the approved phase plan, this repo does **not** yet include the ML
model, the Snapshot page, the Models page, or the Settings page. The
`model_versions` and `predictions` tables exist in `schema.sql` as minimal
placeholders only, so later phases have a stable schema to build against
without a breaking migration.

Point-in-time integrity for the Phase 2 data (Master Plan Section 4) is
enforced structurally, not just by convention: `open_meteo_historical_hourly`
rows carry the real elapsed hour they describe (`valid_time`), `open_meteo_runs`
rows carry both the model's own run time (`run_at`) and when Aurora actually
captured it (`fetched_at`), and `open_meteo_historical_asof(cutoff)` /
`open_meteo_runs_asof(cutoff, model)` are the SQL functions later phases
should read through rather than querying the tables directly, so a training
or prediction cutoff can never accidentally join evidence Aurora didn't
actually have yet at that simulated moment.
