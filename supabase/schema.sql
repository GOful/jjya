-- Run once in Supabase SQL Editor. Enable Anonymous Sign-Ins in Auth settings.
-- Public shared app: every signed-in anonymous visitor can read and edit shared data.
begin;
create or replace function public.can_use_shared_app() returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null;
$$;
revoke all on function public.can_use_shared_app() from public, anon;
grant execute on function public.can_use_shared_app() to authenticated;

create table if not exists public.catalog_revision (
  id boolean primary key default true check (id),
  version integer not null default 1
);
insert into public.catalog_revision(id) values (true) on conflict do nothing;
create table if not exists public.risk_trainings (
  id integer primary key check (id > 0),
  categories text[] not null check (cardinality(categories) > 0),
  risk_text text not null check (length(trim(risk_text)) > 0),
  safety_rules text not null check (length(trim(safety_rules)) > 0)
);
create table if not exists public.inspection_types (
  id integer primary key check (id > 0),
  name text not null check (length(trim(name)) > 0),
  reference_period text not null default ''
);
create table if not exists public.inspection_items (
  type_id integer not null references public.inspection_types(id),
  item_no integer not null check (item_no > 0),
  content text not null check (length(trim(content)) > 0),
  primary key (type_id,item_no)
);
create table if not exists public.misc_tasks (
  id integer primary key check (id > 0),
  title text not null check (length(trim(title)) > 0),
  log_text text not null check (length(trim(log_text)) > 0)
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
create table if not exists public.work_log_copies (
  id bigint generated always as identity primary key,
  log_id uuid not null references public.work_logs(id) on delete cascade,
  log_version integer not null,
  body text not null,
  state jsonb not null,
  copied_at timestamptz not null default clock_timestamp(),
  copied_by uuid references auth.users(id) on delete set null
);
create index if not exists work_log_copies_latest_idx on public.work_log_copies(copied_at desc,id desc);
alter table public.catalog_revision enable row level security;
drop policy if exists shared_read on public.catalog_revision;
create policy shared_read on public.catalog_revision for select to authenticated using (public.can_use_shared_app());
revoke all on public.catalog_revision from anon, authenticated;
grant select on public.catalog_revision to authenticated;
alter table public.risk_trainings enable row level security;
drop policy if exists shared_read on public.risk_trainings;
create policy shared_read on public.risk_trainings for select to authenticated using (public.can_use_shared_app());
revoke all on public.risk_trainings from anon, authenticated;
grant select on public.risk_trainings to authenticated;
alter table public.inspection_types enable row level security;
drop policy if exists shared_read on public.inspection_types;
create policy shared_read on public.inspection_types for select to authenticated using (public.can_use_shared_app());
revoke all on public.inspection_types from anon, authenticated;
grant select on public.inspection_types to authenticated;
alter table public.inspection_items enable row level security;
drop policy if exists shared_read on public.inspection_items;
create policy shared_read on public.inspection_items for select to authenticated using (public.can_use_shared_app());
revoke all on public.inspection_items from anon, authenticated;
grant select on public.inspection_items to authenticated;
alter table public.misc_tasks enable row level security;
drop policy if exists shared_read on public.misc_tasks;
create policy shared_read on public.misc_tasks for select to authenticated using (public.can_use_shared_app());
revoke all on public.misc_tasks from anon, authenticated;
grant select on public.misc_tasks to authenticated;
alter table public.work_logs enable row level security;
drop policy if exists shared_read on public.work_logs;
create policy shared_read on public.work_logs for select to authenticated using (public.can_use_shared_app());
revoke all on public.work_logs from anon, authenticated;
grant select on public.work_logs to authenticated;
alter table public.copy_events enable row level security;
drop policy if exists shared_read on public.copy_events;
create policy shared_read on public.copy_events for select to authenticated using (public.can_use_shared_app());
revoke all on public.copy_events from anon, authenticated;
grant select on public.copy_events to authenticated;
alter table public.work_log_copies enable row level security;
drop policy if exists shared_read on public.work_log_copies;
create policy shared_read on public.work_log_copies for select to authenticated using (public.can_use_shared_app());
revoke all on public.work_log_copies from anon, authenticated;
grant select on public.work_log_copies to authenticated;
drop policy if exists shared_content_update on public.risk_trainings;
create policy shared_content_update on public.risk_trainings for update to authenticated using (public.can_use_shared_app()) with check (public.can_use_shared_app());
drop policy if exists shared_content_update on public.inspection_types;
create policy shared_content_update on public.inspection_types for update to authenticated using (public.can_use_shared_app()) with check (public.can_use_shared_app());
drop policy if exists shared_content_update on public.inspection_items;
create policy shared_content_update on public.inspection_items for update to authenticated using (public.can_use_shared_app()) with check (public.can_use_shared_app());
drop policy if exists shared_content_update on public.misc_tasks;
create policy shared_content_update on public.misc_tasks for update to authenticated using (public.can_use_shared_app()) with check (public.can_use_shared_app());
grant update(categories,risk_text,safety_rules) on public.risk_trainings to authenticated;
grant update(name,reference_period) on public.inspection_types to authenticated;
grant update(content) on public.inspection_items to authenticated;
grant update(title,log_text) on public.misc_tasks to authenticated;
create or replace function public.bump_catalog_revision() returns trigger
language plpgsql security definer set search_path = '' as $$
begin update public.catalog_revision set version=version+1 where id=true; return null; end;
$$;
revoke all on function public.bump_catalog_revision() from public,anon,authenticated;
drop trigger if exists catalog_changed on public.risk_trainings;
create trigger catalog_changed after insert or update or delete on public.risk_trainings for each statement execute function public.bump_catalog_revision();
drop trigger if exists catalog_changed on public.inspection_types;
create trigger catalog_changed after insert or update or delete on public.inspection_types for each statement execute function public.bump_catalog_revision();
drop trigger if exists catalog_changed on public.inspection_items;
create trigger catalog_changed after insert or update or delete on public.inspection_items for each statement execute function public.bump_catalog_revision();
drop trigger if exists catalog_changed on public.misc_tasks;
create trigger catalog_changed after insert or update or delete on public.misc_tasks for each statement execute function public.bump_catalog_revision();
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
    insert into public.work_log_copies(log_id,log_version,body,state,copied_by)
      values (saved.id,saved.version,saved.body,saved.state,auth.uid());
    insert into public.copy_events(log_id,item_key,copied_by)
      select p_id, k, auth.uid() from (select distinct unnest(p_keys) as k) keys
      on conflict do nothing;
  end if;
  return jsonb_build_object('version',saved.version,'updated_at',saved.updated_at,
    'counts',public.shared_usage_counts());
end;
$$;
comment on table public.risk_trainings is '위험예지훈련: 한 항목당 한 행. 분류, 위험 내용, 작업 전 안전수칙';
comment on table public.inspection_types is '기간별 안전점검 종류: 여름철, 겨울철 등';
comment on table public.inspection_items is '안전점검 세부 항목: type_id로 점검 종류와 연결';
comment on table public.misc_tasks is '기타업무: 표시 이름과 업무일지에 넣을 문구';
comment on table public.catalog_revision is '점검 항목 변경 버전. 동시에 수정할 때 덮어쓰기 방지용';
comment on table public.work_logs is '현재 저장된 업무일지. state는 선택 상태 복원을 위한 UI 스냅샷';
comment on table public.copy_events is '사용 횟수 원장. 같은 일지/항목은 한 번만 집계';
comment on table public.work_log_copies is '복사 시점의 본문과 선택 상태. 이후 저장해도 변경되지 않음';

-- JSON here is an API response only; all content is stored in individual rows.
create or replace function public.get_app_catalog() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.can_use_shared_app() then raise exception 'ANONYMOUS_AUTH_REQUIRED' using errcode='42501'; end if;
  return jsonb_build_object('version',(select version from public.catalog_revision where id=true),
    'data',jsonb_build_object(
      'training',coalesce((select jsonb_agg(jsonb_build_array(id,array_to_string(categories,','),risk_text,safety_rules) order by id) from public.risk_trainings),'[]'::jsonb),
      'inspections',coalesce((select jsonb_agg(jsonb_build_array(t.name,t.reference_period,
        coalesce((select jsonb_agg(i.content order by i.item_no) from public.inspection_items i where i.type_id=t.id),'[]'::jsonb)) order by t.id) from public.inspection_types t),'[]'::jsonb),
      'misc',coalesce((select jsonb_agg(jsonb_build_array(title,log_text) order by id) from public.misc_tasks),'[]'::jsonb)));
end;
$$;
create or replace function public.save_app_catalog(p_expected_version integer, p_data jsonb)
returns integer language plpgsql security definer set search_path = '' as $$
declare current_version integer; next_version integer; group_data jsonb; group_pos integer;
begin
  if not public.can_use_shared_app() then raise exception 'ANONYMOUS_AUTH_REQUIRED' using errcode='42501'; end if;
  select version into current_version from public.catalog_revision where id=true for update;
  if current_version<>p_expected_version then raise exception 'VERSION_CONFLICT'; end if;
  if jsonb_typeof(p_data->'training') is distinct from 'array'
    or jsonb_typeof(p_data->'inspections') is distinct from 'array'
    or jsonb_typeof(p_data->'misc') is distinct from 'array' then raise exception 'INVALID_CATALOG'; end if;
  if jsonb_array_length(p_data->'training')<>(select count(*) from public.risk_trainings)
    or jsonb_array_length(p_data->'inspections')<>(select count(*) from public.inspection_types)
    or jsonb_array_length(p_data->'misc')<>(select count(*) from public.misc_tasks) then raise exception 'INVALID_CATALOG'; end if;
  if exists(select 1 from jsonb_array_elements(p_data->'training') e where not exists(select 1 from public.risk_trainings where id=(e->>0)::integer))
    or (select count(distinct e->>0) from jsonb_array_elements(p_data->'training') e)<>(select count(*) from public.risk_trainings) then raise exception 'INVALID_CATALOG'; end if;
  update public.risk_trainings r set categories=string_to_array(e->>1,','),risk_text=e->>2,safety_rules=e->>3
    from jsonb_array_elements(p_data->'training') e where r.id=(e->>0)::integer;
  for group_data,group_pos in select value,ordinality::integer from jsonb_array_elements(p_data->'inspections') with ordinality loop
    if jsonb_array_length(group_data->2)<>(select count(*) from public.inspection_items where type_id=group_pos) then raise exception 'INVALID_CATALOG'; end if;
    update public.inspection_types set name=group_data->>0,reference_period=group_data->>1 where id=group_pos;
    update public.inspection_items i set content=e.value #>> '{}' from jsonb_array_elements(group_data->2) with ordinality e where i.type_id=group_pos and i.item_no=e.ordinality;
  end loop;
  update public.misc_tasks m set title=e.value->>0,log_text=e.value->>1 from jsonb_array_elements(p_data->'misc') with ordinality e where m.id=e.ordinality;
  select version into next_version from public.catalog_revision where id=true;
  return next_version;
end;
$$;
-- Human-readable usage views; no need to parse copy_events.item_key in the editor.
create or replace view public.risk_training_usage with (security_invoker=true) as
select r.id,r.risk_text,c.category,count(e.log_id) as usage_count
from public.risk_trainings r cross join lateral unnest(array_append(r.categories,'전체')) c(category)
left join public.copy_events e on e.item_key=case when c.category='전체' then r.id::text else c.category||'|'||r.id::text end
 group by r.id,r.risk_text,c.category;
create or replace view public.inspection_item_usage with (security_invoker=true) as
select t.id as type_id,t.name as type_name,i.item_no,i.content,count(e.log_id) as usage_count
from public.inspection_types t join public.inspection_items i on i.type_id=t.id
left join public.copy_events e on e.item_key='inspection:'||(t.id-1)::text||':'||(i.item_no-1)::text
 group by t.id,t.name,i.item_no,i.content;
revoke all on public.risk_training_usage, public.inspection_item_usage from anon;
grant select on public.risk_training_usage, public.inspection_item_usage to authenticated;
revoke all on function public.shared_usage_counts() from public, anon;
grant execute on function public.shared_usage_counts() to authenticated;
revoke all on function public.save_work_log(uuid,integer,text,jsonb,text[]) from public, anon;
grant execute on function public.save_work_log(uuid,integer,text,jsonb,text[]) to authenticated;
revoke all on function public.save_app_catalog(integer,jsonb) from public, anon;
grant execute on function public.save_app_catalog(integer,jsonb) to authenticated;
revoke all on function public.get_app_catalog() from public, anon;
grant execute on function public.get_app_catalog() to authenticated;
commit;
