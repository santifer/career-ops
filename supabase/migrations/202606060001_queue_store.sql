-- career-ops queue store migration
--
-- Run this file in the Supabase SQL editor for the Sydney
-- (ap-southeast-2) project. It is intentionally idempotent: safe to re-run.
--
-- PII boundary: active_roles stores discovery data only. Candidate-generated
-- fields such as reason, visa_answer, drafts, cv_pdf, cover_letter_path, and
-- ksc_path are intentionally absent from this schema and remain local-only.

begin;

-- Split API roles. These are Postgres roles used by PostgREST via JWT `role`
-- claims; they are not service_role, because service_role bypasses RLS.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'career_ops_cron') then
    create role career_ops_cron;
  end if;

  if not exists (select 1 from pg_roles where rolname = 'career_ops_dashboard') then
    create role career_ops_dashboard;
  end if;
end
$$;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticator') then
    grant career_ops_cron to authenticator;
    grant career_ops_dashboard to authenticator;
  end if;

  if exists (select 1 from pg_roles where rolname = 'anon') then
    grant anon to career_ops_cron;
    grant anon to career_ops_dashboard;
  end if;
end
$$;

create table if not exists public.active_roles (
  id text primary key,
  company text not null,
  title text not null,
  url text not null,
  ats text not null,
  source text not null default 'manual',
  location text,
  jd_text text,
  jd_path text,
  status text not null default 'new',
  score numeric(2,1),
  score_raw numeric(2,1),
  size_bucket text,
  eligibility text,
  employment_type text,
  confidence text,
  flags text[] default '{}'::text[],
  free_text_fields jsonb,
  upload_fields jsonb,
  ksc_criteria text[],
  cover_letter_required boolean default false,
  requirements_snippet text,
  created_at timestamptz not null default now(),
  scored_at timestamptz,
  prepared_at timestamptz,
  prefilled_at timestamptz,
  filled_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.active_roles
  add column if not exists source text not null default 'manual';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'active_roles_status_check'
      and conrelid = 'public.active_roles'::regclass
  ) then
    alter table public.active_roles
      add constraint active_roles_status_check
      check (status in ('new','scored','prepare-queued','prepared','prefilled','filled'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'active_roles_score_check'
      and conrelid = 'public.active_roles'::regclass
  ) then
    alter table public.active_roles
      add constraint active_roles_score_check
      check (score is null or (score >= 0 and score <= 5));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'active_roles_score_raw_check'
      and conrelid = 'public.active_roles'::regclass
  ) then
    alter table public.active_roles
      add constraint active_roles_score_raw_check
      check (score_raw is null or (score_raw >= 0 and score_raw <= 5));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'active_roles_source_not_blank_check'
      and conrelid = 'public.active_roles'::regclass
  ) then
    alter table public.active_roles
      add constraint active_roles_source_not_blank_check
      check (length(btrim(source)) > 0);
  end if;
end
$$;

create unique index if not exists active_roles_url_key
  on public.active_roles (url);
create index if not exists idx_active_roles_status
  on public.active_roles (status);
create index if not exists idx_active_roles_company_title
  on public.active_roles (lower(company), lower(title));
create index if not exists idx_active_roles_source
  on public.active_roles (source);

create table if not exists public.seen_urls (
  url text primary key,
  company text,
  title text,
  final_status text not null,
  first_seen date not null default current_date,
  decided_at timestamptz
);

create index if not exists idx_seen_company_title
  on public.seen_urls (lower(company), lower(title));
create index if not exists idx_seen_final_status
  on public.seen_urls (final_status);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end
$$;

drop trigger if exists active_roles_set_updated_at on public.active_roles;
create trigger active_roles_set_updated_at
before update on public.active_roles
for each row
execute function public.set_updated_at();

alter table public.active_roles enable row level security;
alter table public.seen_urls enable row level security;
alter table public.active_roles force row level security;
alter table public.seen_urls force row level security;

revoke all on public.active_roles from anon, authenticated;
revoke all on public.seen_urls from anon, authenticated;
grant usage on schema public to career_ops_cron, career_ops_dashboard;

grant select, insert, update, delete on public.active_roles to career_ops_dashboard;
grant select, insert, update, delete on public.seen_urls to career_ops_dashboard;

-- Supabase sb_secret_ keys authorize as service_role. That trusted local
-- dashboard path intentionally bypasses RLS, but still needs table/RPC grants
-- when public-schema privileges have been tightened explicitly.
grant usage on schema public to service_role;
grant select, insert, update, delete on public.active_roles to service_role;
grant select, insert, update, delete on public.seen_urls to service_role;

grant select, insert, delete on public.active_roles to career_ops_cron;
grant select, insert on public.seen_urls to career_ops_cron;

drop policy if exists career_ops_dashboard_active_select on public.active_roles;
drop policy if exists career_ops_dashboard_active_insert on public.active_roles;
drop policy if exists career_ops_dashboard_active_update on public.active_roles;
drop policy if exists career_ops_dashboard_active_delete on public.active_roles;
drop policy if exists career_ops_cron_active_select on public.active_roles;
drop policy if exists career_ops_cron_active_insert_new on public.active_roles;
drop policy if exists career_ops_cron_active_delete_new on public.active_roles;

create policy career_ops_dashboard_active_select
  on public.active_roles for select
  to career_ops_dashboard
  using (true);

create policy career_ops_dashboard_active_insert
  on public.active_roles for insert
  to career_ops_dashboard
  with check (status in ('new','scored','prepare-queued','prepared','prefilled','filled'));

create policy career_ops_dashboard_active_update
  on public.active_roles for update
  to career_ops_dashboard
  using (true)
  with check (status in ('new','scored','prepare-queued','prepared','prefilled','filled'));

create policy career_ops_dashboard_active_delete
  on public.active_roles for delete
  to career_ops_dashboard
  using (true);

create policy career_ops_cron_active_select
  on public.active_roles for select
  to career_ops_cron
  using (true);

create policy career_ops_cron_active_insert_new
  on public.active_roles for insert
  to career_ops_cron
  with check (status = 'new');

create policy career_ops_cron_active_delete_new
  on public.active_roles for delete
  to career_ops_cron
  using (status = 'new');

drop policy if exists career_ops_dashboard_seen_select on public.seen_urls;
drop policy if exists career_ops_dashboard_seen_insert on public.seen_urls;
drop policy if exists career_ops_dashboard_seen_update on public.seen_urls;
drop policy if exists career_ops_dashboard_seen_delete on public.seen_urls;
drop policy if exists career_ops_cron_seen_select on public.seen_urls;
drop policy if exists career_ops_cron_seen_insert_limited on public.seen_urls;

create policy career_ops_dashboard_seen_select
  on public.seen_urls for select
  to career_ops_dashboard
  using (true);

create policy career_ops_dashboard_seen_insert
  on public.seen_urls for insert
  to career_ops_dashboard
  with check (true);

create policy career_ops_dashboard_seen_update
  on public.seen_urls for update
  to career_ops_dashboard
  using (true)
  with check (true);

create policy career_ops_dashboard_seen_delete
  on public.seen_urls for delete
  to career_ops_dashboard
  using (true);

create policy career_ops_cron_seen_select
  on public.seen_urls for select
  to career_ops_cron
  using (true);

create policy career_ops_cron_seen_insert_limited
  on public.seen_urls for insert
  to career_ops_cron
  with check (final_status in ('expired','filtered'));

-- Atomic queue write used by queue-store.mjs. A Postgres function runs in a
-- single transaction, so active-role upserts and terminal seen-url writes move
-- together. It is SECURITY INVOKER so RLS still applies to the caller role.
create or replace function public.save_queue(
  active_payload jsonb default '[]'::jsonb,
  seen_payload jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  active_count integer := coalesce(jsonb_array_length(active_payload), 0);
  seen_count integer := coalesce(jsonb_array_length(seen_payload), 0);
begin
  insert into public.active_roles (
    id, company, title, url, ats, source, location, jd_text, jd_path, status,
    score, score_raw, size_bucket, eligibility, employment_type, confidence,
    flags, free_text_fields, upload_fields, ksc_criteria,
    cover_letter_required, requirements_snippet, created_at, scored_at,
    prepared_at, prefilled_at, filled_at
  )
  select
    r.id,
    r.company,
    r.title,
    r.url,
    r.ats,
    coalesce(nullif(r.source, ''), 'manual'),
    r.location,
    r.jd_text,
    r.jd_path,
    r.status,
    r.score,
    r.score_raw,
    r.size_bucket,
    r.eligibility,
    r.employment_type,
    r.confidence,
    coalesce(r.flags, '{}'::text[]),
    r.free_text_fields,
    r.upload_fields,
    r.ksc_criteria,
    coalesce(r.cover_letter_required, false),
    r.requirements_snippet,
    coalesce(r.created_at, now()),
    r.scored_at,
    r.prepared_at,
    r.prefilled_at,
    r.filled_at
  from jsonb_to_recordset(coalesce(active_payload, '[]'::jsonb)) as r(
    id text,
    company text,
    title text,
    url text,
    ats text,
    source text,
    location text,
    jd_text text,
    jd_path text,
    status text,
    score numeric,
    score_raw numeric,
    size_bucket text,
    eligibility text,
    employment_type text,
    confidence text,
    flags text[],
    free_text_fields jsonb,
    upload_fields jsonb,
    ksc_criteria text[],
    cover_letter_required boolean,
    requirements_snippet text,
    created_at timestamptz,
    scored_at timestamptz,
    prepared_at timestamptz,
    prefilled_at timestamptz,
    filled_at timestamptz
  )
  where r.id is not null
    and r.company is not null
    and r.title is not null
    and r.url is not null
    and r.ats is not null
    and r.status in ('new','scored','prepare-queued','prepared','prefilled','filled')
  on conflict (id) do update set
    company = excluded.company,
    title = excluded.title,
    url = excluded.url,
    ats = excluded.ats,
    source = excluded.source,
    location = excluded.location,
    jd_text = excluded.jd_text,
    jd_path = excluded.jd_path,
    status = excluded.status,
    score = excluded.score,
    score_raw = excluded.score_raw,
    size_bucket = excluded.size_bucket,
    eligibility = excluded.eligibility,
    employment_type = excluded.employment_type,
    confidence = excluded.confidence,
    flags = excluded.flags,
    free_text_fields = excluded.free_text_fields,
    upload_fields = excluded.upload_fields,
    ksc_criteria = excluded.ksc_criteria,
    cover_letter_required = excluded.cover_letter_required,
    requirements_snippet = excluded.requirements_snippet,
    created_at = excluded.created_at,
    scored_at = excluded.scored_at,
    prepared_at = excluded.prepared_at,
    prefilled_at = excluded.prefilled_at,
    filled_at = excluded.filled_at;

  with seen_rows as (
    select *
    from jsonb_to_recordset(coalesce(seen_payload, '[]'::jsonb)) as s(
      url text,
      company text,
      title text,
      final_status text,
      first_seen date,
      decided_at timestamptz
    )
    where s.url is not null and s.final_status is not null
  ),
  terminal_rows as (
    select *
    from seen_rows
    where final_status in ('submitted','skipped','reviewed','closed','expired','filtered')
  )
  delete from public.active_roles a
  using terminal_rows s
  where a.url = s.url;

  insert into public.seen_urls (
    url, company, title, final_status, first_seen, decided_at
  )
  select
    s.url,
    s.company,
    s.title,
    s.final_status,
    coalesce(s.first_seen, current_date),
    s.decided_at
  from jsonb_to_recordset(coalesce(seen_payload, '[]'::jsonb)) as s(
    url text,
    company text,
    title text,
    final_status text,
    first_seen date,
    decided_at timestamptz
  )
  where s.url is not null and s.final_status is not null
  on conflict (url) do update set
    company = coalesce(excluded.company, public.seen_urls.company),
    title = coalesce(excluded.title, public.seen_urls.title),
    final_status = excluded.final_status,
    first_seen = least(public.seen_urls.first_seen, excluded.first_seen),
    decided_at = coalesce(excluded.decided_at, public.seen_urls.decided_at);

  return jsonb_build_object('active_payload', active_count, 'seen_payload', seen_count);
end
$$;

grant execute on function public.save_queue(jsonb, jsonb) to career_ops_dashboard;
grant execute on function public.save_queue(jsonb, jsonb) to service_role;

commit;
