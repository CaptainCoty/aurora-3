-- Aurora 3.0 — Phase 1 schema
-- Run this in the Supabase SQL editor (or via the Supabase CLI) on a fresh project.
-- Safe to re-run: uses IF NOT EXISTS / CREATE OR REPLACE throughout.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- wu_klax_outcomes — manual Weather Underground KLAX final-high backfill.
-- This is the sole training target / settlement truth for the whole product.
-- ---------------------------------------------------------------------------
create table if not exists wu_klax_outcomes (
  id uuid primary key default gen_random_uuid(),
  date date not null unique,
  final_high_f smallint not null,
  source text not null default 'WU',
  entry_time timestamptz not null default now(),
  correction_history jsonb not null default '[]'::jsonb,
  is_verified boolean not null default true,
  updated_at timestamptz not null default now()
);

create index if not exists wu_klax_outcomes_date_idx on wu_klax_outcomes (date desc);

comment on table wu_klax_outcomes is
  'Manually entered KLAX daily final high temperature from Weather Underground. Sole training target / settlement truth (Section 3).';
comment on column wu_klax_outcomes.date is
  'America/Los_Angeles calendar date the high applies to.';
comment on column wu_klax_outcomes.correction_history is
  'Append-only array of {previous_final_high_f, previous_source, previous_entry_time, changed_at} — old values are never overwritten silently.';

-- ---------------------------------------------------------------------------
-- upsert_wu_outcome — insert or correct a single day's outcome, atomically
-- pushing the prior value into correction_history when the value changes.
-- ---------------------------------------------------------------------------
create or replace function upsert_wu_outcome(
  p_date date,
  p_final_high_f smallint,
  p_source text default 'WU',
  p_is_verified boolean default true
) returns wu_klax_outcomes
language plpgsql
as $$
declare
  existing wu_klax_outcomes;
  result wu_klax_outcomes;
begin
  select * into existing from wu_klax_outcomes where date = p_date;

  if existing.id is null then
    insert into wu_klax_outcomes (date, final_high_f, source, entry_time, correction_history, is_verified)
    values (p_date, p_final_high_f, p_source, now(), '[]'::jsonb, p_is_verified)
    returning * into result;
  elsif existing.final_high_f is distinct from p_final_high_f
     or existing.source is distinct from p_source then
    update wu_klax_outcomes
    set
      correction_history = existing.correction_history || jsonb_build_array(
        jsonb_build_object(
          'previous_final_high_f', existing.final_high_f,
          'previous_source', existing.source,
          'previous_entry_time', existing.entry_time,
          'changed_at', now()
        )
      ),
      final_high_f = p_final_high_f,
      source = p_source,
      entry_time = now(),
      is_verified = p_is_verified,
      updated_at = now()
    where date = p_date
    returning * into result;
  else
    -- No material change; just refresh verified flag/updated_at if needed.
    update wu_klax_outcomes
    set is_verified = p_is_verified,
        updated_at = now()
    where date = p_date and is_verified is distinct from p_is_verified
    returning * into result;

    if result.id is null then
      result := existing;
    end if;
  end if;

  return result;
end;
$$;

-- ---------------------------------------------------------------------------
-- upsert_wu_outcomes_batch — apply a jsonb array of entries in one round trip.
-- Each element: {"date": "YYYY-MM-DD", "final_high_f": 84, "source": "WU", "is_verified": true}
-- ---------------------------------------------------------------------------
create or replace function upsert_wu_outcomes_batch(p_entries jsonb)
returns setof wu_klax_outcomes
language plpgsql
as $$
declare
  entry jsonb;
begin
  for entry in select * from jsonb_array_elements(p_entries)
  loop
    return query select * from upsert_wu_outcome(
      (entry->>'date')::date,
      (entry->>'final_high_f')::smallint,
      coalesce(entry->>'source', 'WU'),
      coalesce((entry->>'is_verified')::boolean, true)
    );
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Placeholder tables for later phases. Minimal shape only — Phase 1 does not
-- populate or read these; they exist so later phases have a stable target
-- and so wu_klax_outcomes can eventually be foreign-keyed / joined against
-- them without a breaking migration.
-- ---------------------------------------------------------------------------

-- Phase 3: trained model versions (Section 13).
create table if not exists model_versions (
  id uuid primary key default gen_random_uuid(),
  version_label text not null unique,
  trained_at timestamptz,
  training_cutoff timestamptz,
  feature_contract jsonb,
  training_config jsonb,
  artifact_uri text,
  calibration_artifact_uri text,
  evaluation_results jsonb,
  is_active boolean not null default false,
  created_at timestamptz not null default now()
);

comment on table model_versions is
  'Placeholder for Phase 3. Each row is one immutable trained model version (Section 13).';

-- Phase 4: frozen prediction snapshots (Section 12).
create table if not exists predictions (
  id uuid primary key default gen_random_uuid(),
  klax_date date not null,
  cutoff_at timestamptz not null,
  model_version_id uuid references model_versions (id),
  distribution jsonb,
  inputs_snapshot jsonb,
  warnings jsonb,
  created_at timestamptz not null default now()
);

create index if not exists predictions_klax_date_idx on predictions (klax_date desc);

comment on table predictions is
  'Placeholder for Phase 4. One immutable row per Run, freezing cutoff/evidence/model version (Section 12).';

-- Phase 2: adaptively-collected Open-Meteo model runs (Section 7).
create table if not exists open_meteo_runs (
  id uuid primary key default gen_random_uuid(),
  model text not null check (model in ('gfs', 'hrrr', 'ecmwf_ifs', 'nbm')),
  run_at timestamptz not null,
  fetched_at timestamptz not null default now(),
  data jsonb not null,
  created_at timestamptz not null default now(),
  unique (model, run_at)
);

create index if not exists open_meteo_runs_model_run_at_idx on open_meteo_runs (model, run_at desc);

comment on table open_meteo_runs is
  'Placeholder for Phase 2. One row per genuinely new stored run per selected model (Section 7).';

-- ---------------------------------------------------------------------------
-- Row Level Security: locked down by default. This app never talks to
-- Supabase from the browser — every read/write goes through Next.js API
-- routes using the service role key, which bypasses RLS. Enabling RLS with
-- no policies means the anon/public key (if it were ever exposed) grants
-- zero access.
-- ---------------------------------------------------------------------------
alter table wu_klax_outcomes enable row level security;
alter table model_versions enable row level security;
alter table predictions enable row level security;
alter table open_meteo_runs enable row level security;
