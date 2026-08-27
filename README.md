# Aurora 3.0 — Phase 1

Private, KLAX-only weather-prediction and trading-decision-support tool.
Single operator, single shared password. This is **Phase 1 only**: project
scaffold, Supabase schema, password auth, and the Outcomes batch-entry page
for manually backfilling Weather Underground KLAX final highs. No Open-Meteo
integration, NWS integration, ML model, Snapshot page, Models page, or
Settings page yet — those are later phases.

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

## 5. Deploy to Vercel

1. Push this repo to GitHub (or your Git provider of choice).
2. Import the repo in Vercel.
3. Add the same four environment variables from `.env.local` in the Vercel
   project's Settings -> Environment Variables (Production and Preview).
4. Deploy. Vercel auto-detects Next.js; no build command changes needed.

## Project structure

```
app/
  login/              password gate UI
  outcomes/           batch-entry backfill page (server component + client table)
  api/auth/           login/logout route handlers
  api/outcomes/       GET (list) / POST (batch upsert with correction history)
lib/
  auth.ts             session token creation/verification (jose)
  supabase-admin.ts    server-only Supabase client (service role)
  rate-limit.ts        best-effort in-memory login rate limiting
  types.ts             shared TS types
components/
  LogoutButton.tsx
supabase/
  schema.sql            full Phase 1 schema + RPCs, run this in Supabase
middleware.ts            enforces the password gate on every route except /login
```

## Notes on what's intentionally not here yet

Per the Phase 1 scope, this repo does **not** include Open-Meteo collection,
NWS fetching, the ML model, the Snapshot page, the Models page, or the
Settings page. The `model_versions`, `predictions`, and `open_meteo_runs`
tables exist in `schema.sql` as minimal placeholders only, per the approved
phase plan, so later phases have a stable schema to build against without a
breaking migration.
