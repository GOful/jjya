-- NEW PROJECTS ONLY. Existing projects: run migrate-normalized.sql instead.
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

-- Default content, one record per row. Existing edited rows are preserved.
begin;
insert into public.risk_trainings(id,categories,risk_text,safety_rules) values (1,string_to_array('일상',','),'단자대 볼트 조임시 돌출부에 의한 긁힘','적절한 공구 사용, 작업전 안전교육, 안전모, 절연장갑 착용') on conflict do nothing;
insert into public.risk_trainings(id,categories,risk_text,safety_rules) values (2,string_to_array('일상',','),'분전반 쇄정','모든 작업후 및 일상점검 시 분전반 쇄정확인 철저') on conflict do nothing;
insert into public.risk_trainings(id,categories,risk_text,safety_rules) values (3,string_to_array('일상',','),'전기,기계기구를 이용한 작업시 각종 안전사고','안전화, 안전모 착용, 작업전 안전교육, 보안경 착용, 그라인더·고속절단기 작업안전수칙 준수') on conflict do nothing;
insert into public.risk_trainings(id,categories,risk_text,safety_rules) values (4,string_to_array('일상',','),'조작반 오조작에 의한 전원 투입','작업 전 안전교육, 작업 전 계통 숙지, 작업중 표지판 부착, 작업안전수칙 준수') on conflict do nothing;
insert into public.risk_trainings(id,categories,risk_text,safety_rules) values (5,string_to_array('일상',','),'모선,케이블헤드, 볼트 등 돌출부 충돌','작업전 안전교육, 안전모, 절연장갑 착용, 전방주시 철저') on conflict do nothing;
insert into public.risk_trainings(id,categories,risk_text,safety_rules) values (6,string_to_array('일상',','),'진공 인터럽터 절연불량으로 인한 가압','작업전 안전교육, 절연장갑 및 절연화 착용, 작업개소 전원차단 및 검전 실시, 절연상태 확인, 작업안전수칙 준수') on conflict do nothing;
insert into public.risk_trainings(id,categories,risk_text,safety_rules) values (7,string_to_array('일상',','),'교육훈련 및 절차 미준수','직무교육 실시, 비상대응훈련 실시 사고사례 교육 실시') on conflict do nothing;
insert into public.risk_trainings(id,categories,risk_text,safety_rules) values (8,string_to_array('일상',','),'배전반내 공간 협소 및 돌출부로 인한 외상','작업전 안전교육, 안전모, 절연장갑 착용, 전방주시 철저') on conflict do nothing;
insert into public.risk_trainings(id,categories,risk_text,safety_rules) values (9,string_to_array('일상',','),'점검중 활선 충전부 접근 및 접촉','작업전 안전교육, 작업개소 전원차단 및 작업중 표지설치, 절연장갑착용') on conflict do nothing;
insert into public.risk_trainings(id,categories,risk_text,safety_rules) values (10,string_to_array('일상,3개월,6개월,1년',','),'분전반 내부작업시 날카로운 부위에 긁힘','작업전 안전교육, 안전모, 절연화, 절연장갑 착용, 내부 돌출부 및 날카로운 부위 확인, 무리한 작업자세 금지') on conflict do nothing;
insert into public.risk_trainings(id,categories,risk_text,safety_rules) values (11,string_to_array('일상,3개월,6개월,1년',','),'수동 및 자동 오취급에 의한 감전사고','작업 전 안전교육, 안전작업을 위한 접지 설치, 작업안전수칙 준수') on conflict do nothing;
insert into public.risk_trainings(id,categories,risk_text,safety_rules) values (12,string_to_array('일상,3개월,6개월,1년',','),'작업구간이 협소하여 구조물과 충돌 발생','작업전 안전교육, 안전모 착용, 작업공간 및 주변 돌출부 확인, 이동 동선 확보, 전방주시 철저') on conflict do nothing;
insert into public.risk_trainings(id,categories,risk_text,safety_rules) values (13,string_to_array('3개월',','),'평활용 콘덴서 잔류전하에 의한 전류접촉','작업전 안전교육, 계통숙지, 절연장갑착용,접촉전방전실시') on conflict do nothing;
insert into public.risk_trainings(id,categories,risk_text,safety_rules) values (14,string_to_array('3개월',','),'축전지 단자전압 측정시 단락으로 인한 화상','작업전 안전교육, 절연보호덮개취부, 절연장갑착용, 전기안전수칙준수') on conflict do nothing;
insert into public.risk_trainings(id,categories,risk_text,safety_rules) values (15,string_to_array('3개월,6개월,1년',','),'정류부, 축전지 등 충전부 활선 접촉','작업전 안전교육, 절연보호덮개취부, 절연장갑착용,전기안전수칙준수') on conflict do nothing;
insert into public.risk_trainings(id,categories,risk_text,safety_rules) values (16,string_to_array('6개월,1년',','),'인출작업중 차단기 중량으로 인한 손, 발 끼임','작업전 안전교육, 안전모, 절연장갑, 절연화 착용, 중량물 취급 매뉴얼 숙지') on conflict do nothing;
insert into public.risk_trainings(id,categories,risk_text,safety_rules) values (17,string_to_array('수전선로',','),'맨홀, 트라프 등 중량물에 의한 손, 발 끼임','작업전 안전교육, 안전모, 안전화, 보호장갑 착용, 중량물 취급 안전수칙 준수, 2인 1조 작업 및 협착 주의') on conflict do nothing;
insert into public.risk_trainings(id,categories,risk_text,safety_rules) values (18,string_to_array('MCC',','),'MCC반 주변설비에 부딪힘','작업전안전교육 및 사전위험 요소 파악, 안전모착용') on conflict do nothing;
insert into public.risk_trainings(id,categories,risk_text,safety_rules) values (19,string_to_array('MCC',','),'MCC반 미 쇄정','MCC반 쇄정상태 확인, 잠금장치 파손여부 확인') on conflict do nothing;
insert into public.risk_trainings(id,categories,risk_text,safety_rules) values (20,string_to_array('MCC',','),'MCC반 내부 점검시 날카로운 부위에 긁힘','안전모, 절연장갑 착용, 내부 돌출부 및 날카로운 부위 확인, 작업안전수칙 준수') on conflict do nothing;
insert into public.risk_trainings(id,categories,risk_text,safety_rules) values (21,string_to_array('MCC',','),'MCC 오동작으로 인한 전원 투입','작업전 안전교육, 작업개소 전원차단 및 작업중 표지설치, 절연장갑 착용, 전기안전수칙준수') on conflict do nothing;
insert into public.risk_trainings(id,categories,risk_text,safety_rules) values (22,string_to_array('MCC',','),'콘덴서 폭발','안전모, 보안경, 절연장갑 착용, 콘덴서 외관 및 이상징후 확인, 잔류전하 방전 및 무전압 확인') on conflict do nothing;
insert into public.risk_trainings(id,categories,risk_text,safety_rules) values (23,string_to_array('MCC',','),'콘덴서 잔류전하에 의한 전류 접촉','작업전 안전교육, 작업개소 전원차단 및 작업중 표지설치, 절연장갑착용, 접촉전방전실시') on conflict do nothing;
insert into public.inspection_types(id,name,reference_period) values (1,'여름철 대비 안전점검','제공 기간: ''25.03.25. ~ 10.15.') on conflict do nothing;
insert into public.inspection_items(type_id,item_no,content) values (1,1,'비상 복구자재ㆍ장비ㆍ비상연락망 정비상태') on conflict do nothing;
insert into public.inspection_items(type_id,item_no,content) values (1,2,'각종 교육(안전ㆍ직무ㆍ소방 등) 실시상태') on conflict do nothing;
insert into public.inspection_items(type_id,item_no,content) values (1,3,'각 기능실 소화기 등 소방시설물 관리상태') on conflict do nothing;
insert into public.inspection_items(type_id,item_no,content) values (1,4,'취약(주의)개소 점검 및 관리상태') on conflict do nothing;
insert into public.inspection_items(type_id,item_no,content) values (1,5,'낙뢰 보호장비 및 예방시설물 점검(서지보호기 등)') on conflict do nothing;
insert into public.inspection_items(type_id,item_no,content) values (1,6,'현장조치매뉴얼 현행화 및 숙지상태') on conflict do nothing;
insert into public.inspection_items(type_id,item_no,content) values (1,7,'전기설비 구조물(변전소,전기실) 균열 및 누수점검') on conflict do nothing;
insert into public.inspection_items(type_id,item_no,content) values (1,8,'수․송배전선로 맨홀, 관로 침수 여부 점검') on conflict do nothing;
insert into public.inspection_items(type_id,item_no,content) values (1,9,'취약개소(변압기,이행구간,MCC 등) 점검') on conflict do nothing;
insert into public.inspection_items(type_id,item_no,content) values (1,10,'보호계전기(GIPAM, 변전설비 등) 설정치 점검') on conflict do nothing;
insert into public.inspection_types(id,name,reference_period) values (2,'겨울철 대비 안전점검','제공 기간: ''22.11.15. ~ ''23.03.15.') on conflict do nothing;
insert into public.inspection_items(type_id,item_no,content) values (2,1,'비상 복구자재‧장비‧비상연락망 및 개인대응수칙 정비') on conflict do nothing;
insert into public.inspection_items(type_id,item_no,content) values (2,2,'각종 교육(안전‧직무‧소방 등) 실시상태') on conflict do nothing;
insert into public.inspection_items(type_id,item_no,content) values (2,3,'각 기능실 소화기 등 소방시설물 관리상태') on conflict do nothing;
insert into public.inspection_items(type_id,item_no,content) values (2,4,'취약개소 점검 및 관리상태') on conflict do nothing;
insert into public.inspection_items(type_id,item_no,content) values (2,5,'비상전원설비(UPS, 축전지 등) 동작상태') on conflict do nothing;
insert into public.inspection_items(type_id,item_no,content) values (2,6,'전기설비 구조물(변전소, 전기실) 침하, 균열, 누수점검') on conflict do nothing;
insert into public.inspection_types(id,name,reference_period) values (3,'해빙기 대비 안전점검','제공 기간: ''25.01.15. ~ ''23.03.31. (연도 확인 필요)') on conflict do nothing;
insert into public.inspection_items(type_id,item_no,content) values (3,1,'비상 복구자재ㆍ수방용장비ㆍ비상연락망 정비') on conflict do nothing;
insert into public.inspection_items(type_id,item_no,content) values (3,2,'개인대응수칙 및 현장조치매뉴얼 정비 및 숙지상태') on conflict do nothing;
insert into public.inspection_items(type_id,item_no,content) values (3,3,'각종 교육(안전ㆍ직무ㆍ소방 등) 실시상태') on conflict do nothing;
insert into public.inspection_items(type_id,item_no,content) values (3,4,'각 기능실 소화기 등 소방시설물 관리상태') on conflict do nothing;
insert into public.inspection_items(type_id,item_no,content) values (3,5,'취약(주의)개소 점검 및 관리상태') on conflict do nothing;
insert into public.inspection_items(type_id,item_no,content) values (3,6,'전기설비 구조물(변전소) 균열, 누수점검') on conflict do nothing;
insert into public.inspection_items(type_id,item_no,content) values (3,7,'수전선로 맨홀 침하 여부 점검') on conflict do nothing;
insert into public.inspection_items(type_id,item_no,content) values (3,8,'기타') on conflict do nothing;
insert into public.inspection_types(id,name,reference_period) values (4,'풍수해 대비 안전점검','제공 기간: ''25.05.20. ~ 10.15.') on conflict do nothing;
insert into public.inspection_items(type_id,item_no,content) values (4,1,'비상 복구장비‧자재 관리 및 동작상태 점검') on conflict do nothing;
insert into public.inspection_items(type_id,item_no,content) values (4,2,'취약(주의)개소점검 및 관리상태 점검') on conflict do nothing;
insert into public.inspection_items(type_id,item_no,content) values (4,3,'기능실 구조물 균열․누수 및 배수로 상태 점검') on conflict do nothing;
insert into public.inspection_items(type_id,item_no,content) values (4,4,'낙뢰 보호 장비 및 예방시설물 점검(피뢰기, 서지보호기 등)') on conflict do nothing;
insert into public.inspection_items(type_id,item_no,content) values (4,5,'수․송배전선로 관로 및 맨홀침수 여부 점검') on conflict do nothing;
insert into public.inspection_items(type_id,item_no,content) values (4,6,'비상연락망 및 현장조치 매뉴얼 현행화 상태점검') on conflict do nothing;
insert into public.inspection_items(type_id,item_no,content) values (4,7,'우수기 취약 MCC반 점검') on conflict do nothing;
insert into public.inspection_types(id,name,reference_period) values (5,'시설물 일제 안전점검','매월 1~10일 / 공문 확인: N월 전기통신분야 시설물 일제 안전점검 시행') on conflict do nothing;
insert into public.inspection_items(type_id,item_no,content) values (5,1,'배전반 각종 절연애자 균열 및 파손 여부') on conflict do nothing;
insert into public.inspection_items(type_id,item_no,content) values (5,2,'변성기 외관 상태 및 온도라벨 상태') on conflict do nothing;
insert into public.inspection_items(type_id,item_no,content) values (5,3,'변압기 소음 및 온도 이상유무') on conflict do nothing;
insert into public.inspection_items(type_id,item_no,content) values (5,4,'정류기 각종 제어기능 이상유무') on conflict do nothing;
insert into public.inspection_items(type_id,item_no,content) values (5,5,'서지보호장치 전원램프 및 배선 취부상태') on conflict do nothing;
insert into public.inspection_items(type_id,item_no,content) values (5,6,'충전장치 부동 및 균등전압 설정값 상태') on conflict do nothing;
insert into public.inspection_items(type_id,item_no,content) values (5,7,'소공간 자동소화장치 약제 실린더 압력상태') on conflict do nothing;
insert into public.inspection_items(type_id,item_no,content) values (5,8,'원격소장치 표시등 점등상태 및 통신상태') on conflict do nothing;
insert into public.inspection_items(type_id,item_no,content) values (5,9,'변전소 환기설비 정상가동 여부') on conflict do nothing;
insert into public.inspection_items(type_id,item_no,content) values (5,10,'변전소 콘센트, 조명등기구 등 취부상태 등') on conflict do nothing;
insert into public.inspection_items(type_id,item_no,content) values (5,11,'변전소 구축물 균열 및 누수 여부') on conflict do nothing;
insert into public.inspection_items(type_id,item_no,content) values (5,12,'접지선 배열 및 단자 조임 상태') on conflict do nothing;
insert into public.inspection_items(type_id,item_no,content) values (5,13,'변전소(제한구역) 출입문 잠금장치 상태') on conflict do nothing;
insert into public.inspection_types(id,name,reference_period) values (6,'설 연휴 대비 자체 안전점검','제공 기간: ''25.01.07. ~ 01.17.') on conflict do nothing;
insert into public.inspection_items(type_id,item_no,content) values (6,1,'역사 MCC설비 및 분전반 관리상태') on conflict do nothing;
insert into public.inspection_items(type_id,item_no,content) values (6,2,'이례사태 대비 비상연락망 구축 및 정비 상태') on conflict do nothing;
insert into public.misc_tasks(id,title,log_text) values (1,'전력량 검침','* 변전소 전력량 검침(대구은행)') on conflict do nothing;
insert into public.misc_tasks(id,title,log_text) values (2,'안전점검의 날','* 안전점검의 날 행사 실시
  - 소화기, 양수기 및 비상복구용 자재 점검') on conflict do nothing;
insert into public.misc_tasks(id,title,log_text) values (3,'소화기 점검','* 변전소 소화기점검(대실, 대구은행, 대공원, 영남대)') on conflict do nothing;
insert into public.misc_tasks(id,title,log_text) values (4,'음주측정기 점검','* 음주측정기 작동상태 점검: 이상없음') on conflict do nothing;
insert into public.misc_tasks(id,title,log_text) values (5,'소방점검 입회','* 변전소 소방점검 입회(영남대)') on conflict do nothing;
insert into public.misc_tasks(id,title,log_text) values (6,'바닥왁스 작업 입회','* 변전소 바닥왁스 작업 입회(대구은행)') on conflict do nothing;
commit;
