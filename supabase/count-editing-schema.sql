-- Run after team-schema.sql. Adjustments are separate from immutable copy history.
begin;
create table if not exists public.usage_adjustments (
  request_id uuid primary key,
  team text not null check (team in ('갑조','을조','병조')),
  item_key text not null check (length(item_key) between 1 and 100),
  requested_delta smallint not null check (requested_delta in (-1,1)),
  delta smallint not null check (delta in (-1,0,1)),
  adjusted_at timestamptz not null default clock_timestamp(),
  adjusted_by uuid references auth.users(id) on delete set null
);
alter table public.usage_adjustments enable row level security;
drop policy if exists shared_read on public.usage_adjustments;
create policy shared_read on public.usage_adjustments for select to authenticated using (public.can_use_shared_app());
revoke all on public.usage_adjustments from anon,authenticated;
grant select on public.usage_adjustments to authenticated;
create index if not exists usage_adjustments_team_key_idx on public.usage_adjustments(team,item_key);
create or replace view public.effective_usage_counts with (security_invoker=true) as
select team,item_key,greatest(sum(n),0)::bigint as usage_count from (
  select l.team,e.item_key,count(*)::bigint n from public.copy_events e join public.work_logs l on l.id=e.log_id group by l.team,e.item_key
  union all
  select team,item_key,sum(delta)::bigint n from public.usage_adjustments group by team,item_key
) totals group by team,item_key;
revoke all on public.effective_usage_counts from anon;
grant select on public.effective_usage_counts to authenticated;
create or replace function public.team_usage_counts(p_team text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
begin
  if not public.can_use_shared_app() then raise exception 'ANONYMOUS_AUTH_REQUIRED' using errcode='42501'; end if;
  if p_team is null or p_team not in ('갑조','을조','병조') then raise exception 'INVALID_TEAM'; end if;
  return coalesce((select jsonb_object_agg(item_key,usage_count) from public.effective_usage_counts where team=p_team),'{}'::jsonb);
end;
$$;
create or replace function public.adjust_usage_count(p_team text,p_item_key text,p_delta integer,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare existing public.usage_adjustments; current_count bigint; actual_delta integer;
begin
  if not public.can_use_shared_app() then raise exception 'ANONYMOUS_AUTH_REQUIRED' using errcode='42501'; end if;
  if p_team is null or p_team not in ('갑조','을조','병조') then raise exception 'INVALID_TEAM'; end if;
  if p_delta is null or p_delta not in (-1,1) or p_request_id is null then raise exception 'INVALID_ADJUSTMENT'; end if;
  -- Accept only keys for real training/category or inspection items.
  if not exists (
    select 1 from public.risk_trainings r where p_item_key=r.id::text
      or exists(select 1 from unnest(r.categories) category where p_item_key=category||'|'||r.id::text)
  ) and not exists (
    select 1 from public.inspection_items i where p_item_key='inspection:'||(i.type_id-1)::text||':'||(i.item_no-1)::text
  ) then raise exception 'INVALID_ITEM_KEY'; end if;
  perform pg_advisory_xact_lock(hashtext(p_team),hashtext(p_item_key));
  select * into existing from public.usage_adjustments where request_id=p_request_id;
  if existing.request_id is not null then
    if existing.team<>p_team or existing.item_key<>p_item_key or existing.requested_delta<>p_delta then raise exception 'REQUEST_ID_CONFLICT'; end if;
    return public.team_usage_counts(p_team);
  end if;
  current_count=coalesce((public.team_usage_counts(p_team)->>p_item_key)::bigint,0);
  actual_delta=case when p_delta=-1 and current_count=0 then 0 else p_delta end;
  insert into public.usage_adjustments(request_id,team,item_key,requested_delta,delta,adjusted_by)
    values (p_request_id,p_team,p_item_key,p_delta,actual_delta,auth.uid());
  return public.team_usage_counts(p_team);
end;
$$;
create or replace view public.team_risk_training_usage with (security_invoker=true) as
select t.team,r.id,r.risk_text,c.category,coalesce(e.usage_count,0)::bigint as usage_count
from (values ('갑조'),('을조'),('병조')) t(team)
cross join public.risk_trainings r cross join lateral unnest(array_append(r.categories,'전체')) c(category)
left join public.effective_usage_counts e on e.team=t.team and e.item_key=case when c.category='전체' then r.id::text else c.category||'|'||r.id::text end;
create or replace view public.team_inspection_item_usage with (security_invoker=true) as
select g.team,t.id as type_id,t.name as type_name,i.item_no,i.content,coalesce(e.usage_count,0)::bigint as usage_count
from (values ('갑조'),('을조'),('병조')) g(team)
cross join public.inspection_types t join public.inspection_items i on i.type_id=t.id
left join public.effective_usage_counts e on e.team=g.team and e.item_key='inspection:'||(t.id-1)::text||':'||(i.item_no-1)::text;
comment on table public.usage_adjustments is '조별 수동 횟수 수정 이력. 복사 기록을 삭제하지 않고 +/- 보정. request_id로 재시도 중복 방지';
revoke all on function public.adjust_usage_count(text,text,integer,uuid) from public,anon;
grant execute on function public.adjust_usage_count(text,text,integer,uuid) to authenticated;
revoke all on function public.team_usage_counts(text) from public,anon;
grant execute on function public.team_usage_counts(text) to authenticated;
notify pgrst, 'reload schema';
commit;
