-- Run once in Supabase SQL Editor. Enable Anonymous Sign-Ins in Auth settings.
-- Public shared app: every signed-in anonymous visitor can read and edit shared data.
begin;
create or replace function public.can_use_shared_app() returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null;
$$;
revoke all on function public.can_use_shared_app() from public, anon;
grant execute on function public.can_use_shared_app() to authenticated;

create table if not exists public.app_catalog (
  id boolean primary key default true check (id),
  data jsonb not null check (jsonb_typeof(data) = 'object'),
  version integer not null default 1,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);
create table if not exists public.work_logs (
  id uuid primary key,
  body text not null check (length(body) <= 100000),
  state jsonb not null check (jsonb_typeof(state) = 'object'),
  version integer not null default 1,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);
create table if not exists public.copy_events (
  log_id uuid not null references public.work_logs(id) on delete cascade,
  item_key text not null check (length(item_key) between 1 and 100),
  copied_at timestamptz not null default now(),
  copied_by uuid references auth.users(id) on delete set null,
  primary key (log_id, item_key)
);
alter table public.app_catalog enable row level security;
alter table public.work_logs enable row level security;
alter table public.copy_events enable row level security;
drop policy if exists member_catalog_read on public.app_catalog;
create policy member_catalog_read on public.app_catalog for select to authenticated using (public.can_use_shared_app());
drop policy if exists member_logs_read on public.work_logs;
create policy member_logs_read on public.work_logs for select to authenticated using (public.can_use_shared_app());
drop policy if exists member_events_read on public.copy_events;
create policy member_events_read on public.copy_events for select to authenticated using (public.can_use_shared_app());
revoke all on public.app_catalog, public.work_logs, public.copy_events from anon, authenticated;
grant select on public.app_catalog, public.work_logs, public.copy_events to authenticated;

create or replace function public.shared_usage_counts() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.can_use_shared_app() then raise exception 'ANONYMOUS_AUTH_REQUIRED' using errcode = '42501'; end if;
  return coalesce((select jsonb_object_agg(item_key, n) from
    (select item_key, count(*) as n from public.copy_events group by item_key) counts), '{}'::jsonb);
end;
$$;

-- Save and copy are atomic. Repeated copying of the same log/item is counted once.
-- expected_version prevents one user from silently overwriting another user's work.
create or replace function public.save_work_log(
  p_id uuid, p_expected_version integer, p_body text, p_state jsonb,
  p_keys text[] default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare saved public.work_logs; current_version integer;
begin
  if not public.can_use_shared_app() then raise exception 'ANONYMOUS_AUTH_REQUIRED' using errcode = '42501'; end if;
  if length(trim(p_body)) = 0 then raise exception 'EMPTY_LOG'; end if;
  if p_expected_version = 0 then
    insert into public.work_logs(id, body, state, updated_by)
      values (p_id, p_body, p_state, auth.uid()) on conflict do nothing returning * into saved;
    if saved.id is null then raise exception 'VERSION_CONFLICT'; end if;
  else
    select version into current_version from public.work_logs where id = p_id for update;
    if current_version is null or current_version <> p_expected_version then raise exception 'VERSION_CONFLICT'; end if;
    update public.work_logs set body = p_body, state = p_state, version = version + 1,
      updated_at = now(), updated_by = auth.uid() where id = p_id returning * into saved;
  end if;
  if p_keys is not null then
    if cardinality(p_keys) > 20 then raise exception 'TOO_MANY_KEYS'; end if;
    insert into public.copy_events(log_id,item_key,copied_by)
      select p_id, k, auth.uid() from (select distinct unnest(p_keys) as k) keys
      on conflict do nothing;
  end if;
  return jsonb_build_object('version',saved.version,'updated_at',saved.updated_at,
    'counts',public.shared_usage_counts());
end;
$$;
create or replace function public.save_app_catalog(p_expected_version integer, p_data jsonb)
returns integer language plpgsql security definer set search_path = '' as $$
declare next_version integer;
begin
  if not public.can_use_shared_app() then raise exception 'ANONYMOUS_AUTH_REQUIRED' using errcode = '42501'; end if;
  if jsonb_typeof(p_data->'training') is distinct from 'array'
    or jsonb_typeof(p_data->'inspections') is distinct from 'array'
    or jsonb_typeof(p_data->'misc') is distinct from 'array' then raise exception 'INVALID_CATALOG'; end if;
  update public.app_catalog set data = p_data, version = version + 1, updated_at = now(), updated_by = auth.uid()
    where id = true and version = p_expected_version returning version into next_version;
  if next_version is null then raise exception 'VERSION_CONFLICT'; end if;
  return next_version;
end;
$$;
revoke all on function public.shared_usage_counts() from public, anon;
revoke all on function public.save_work_log(uuid,integer,text,jsonb,text[]) from public, anon;
revoke all on function public.save_app_catalog(integer,jsonb) from public, anon;
grant execute on function public.shared_usage_counts() to authenticated;
grant execute on function public.save_work_log(uuid,integer,text,jsonb,text[]) to authenticated;
grant execute on function public.save_app_catalog(integer,jsonb) to authenticated;
commit;
