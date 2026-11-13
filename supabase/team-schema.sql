-- Team isolation. Existing records are assigned to 갑조 without resetting counts.
begin;
alter table public.work_logs add column if not exists team text not null default '갑조' check (team in ('갑조','을조','병조'));
alter table public.work_log_copies add column if not exists team text not null default '갑조' check (team in ('갑조','을조','병조'));
create index if not exists work_logs_team_idx on public.work_logs(team);
create index if not exists work_log_copies_team_latest_idx on public.work_log_copies(team,copied_at desc,id desc);
create or replace function public.team_usage_counts(p_team text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.can_use_shared_app() then raise exception 'ANONYMOUS_AUTH_REQUIRED' using errcode='42501'; end if;
  if p_team is null or p_team not in ('갑조','을조','병조') then raise exception 'INVALID_TEAM'; end if;
  return coalesce((select jsonb_object_agg(item_key,n) from (
    select e.item_key,count(*) n from public.copy_events e join public.work_logs l on l.id=e.log_id
    where l.team=p_team group by e.item_key) c),'{}'::jsonb);
end;
$$;
create or replace function public.shared_usage_counts() returns jsonb
language sql stable security definer set search_path = '' as $$
  select public.team_usage_counts('갑조');
$$;
create or replace function public.save_work_log_for_team(
  p_team text,
  p_id uuid, p_expected_version integer, p_body text, p_state jsonb,
  p_keys text[] default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare saved public.work_logs; current_version integer;
begin
  if not public.can_use_shared_app() then raise exception 'ANONYMOUS_AUTH_REQUIRED' using errcode = '42501'; end if;
  if p_team is null or p_team not in ('갑조','을조','병조') then raise exception 'INVALID_TEAM'; end if;
  if length(trim(p_body)) = 0 then raise exception 'EMPTY_LOG'; end if;
  if p_expected_version = 0 then
    insert into public.work_logs(id, body, state, updated_by,team)
      values (p_id, p_body, p_state || jsonb_build_object('team',p_team), auth.uid(),p_team) on conflict do nothing returning * into saved;
    if saved.id is null then raise exception 'VERSION_CONFLICT'; end if;
  else
    select version into current_version from public.work_logs where id = p_id and team=p_team for update;
    if current_version is null or current_version <> p_expected_version then raise exception 'VERSION_CONFLICT'; end if;
    update public.work_logs set body = p_body, state = p_state || jsonb_build_object('team',p_team), version = version + 1,
      updated_at = now(), updated_by = auth.uid() where id = p_id returning * into saved;
  end if;
  if p_keys is not null then
    if cardinality(p_keys) > 20 then raise exception 'TOO_MANY_KEYS'; end if;
    insert into public.work_log_copies(log_id,log_version,body,state,copied_by,team)
      values (saved.id,saved.version,saved.body,saved.state,auth.uid(),p_team);
    insert into public.copy_events(log_id,item_key,copied_by)
      select p_id, k, auth.uid() from (select distinct unnest(p_keys) as k) keys
      on conflict do nothing;
  end if;
  return jsonb_build_object('version',saved.version,'updated_at',saved.updated_at,
    'counts',public.team_usage_counts(p_team));
end;
$$;

-- Keep older published clients scoped to 갑조, never to all teams.
create or replace function public.save_work_log(p_id uuid,p_expected_version integer,p_body text,p_state jsonb,p_keys text[] default null)
returns jsonb language sql security definer set search_path = '' as $$
  select public.save_work_log_for_team('갑조',p_id,p_expected_version,p_body,p_state,p_keys);
$$;
create or replace function public.latest_team_copy(p_team text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.can_use_shared_app() then raise exception 'ANONYMOUS_AUTH_REQUIRED' using errcode='42501'; end if;
  if p_team is null or p_team not in ('갑조','을조','병조') then raise exception 'INVALID_TEAM'; end if;
  return (select jsonb_build_object('id',log_id,'version',log_version,'body',body,'state',state,'updated_at',copied_at,'team',team)
    from public.work_log_copies where team=p_team order by copied_at desc,id desc limit 1);
end;
$$;
create or replace view public.team_risk_training_usage with (security_invoker=true) as
select t.team,r.id,r.risk_text,c.category,count(e.log_id) as usage_count
from (values ('갑조'),('을조'),('병조')) t(team)
cross join public.risk_trainings r cross join lateral unnest(array_append(r.categories,'전체')) c(category)
left join (public.copy_events e join public.work_logs l on l.id=e.log_id)
  on l.team=t.team and e.item_key=case when c.category='전체' then r.id::text else c.category||'|'||r.id::text end
 group by t.team,r.id,r.risk_text,c.category;
create or replace view public.team_inspection_item_usage with (security_invoker=true) as
select g.team,t.id as type_id,t.name as type_name,i.item_no,i.content,count(e.log_id) as usage_count
from (values ('갑조'),('을조'),('병조')) g(team)
cross join public.inspection_types t join public.inspection_items i on i.type_id=t.id
left join (public.copy_events e join public.work_logs l on l.id=e.log_id)
  on l.team=g.team and e.item_key='inspection:'||(t.id-1)::text||':'||(i.item_no-1)::text
 group by g.team,t.id,t.name,i.item_no,i.content;
revoke all on public.team_risk_training_usage,public.team_inspection_item_usage from anon;
grant select on public.team_risk_training_usage,public.team_inspection_item_usage to authenticated;
comment on column public.work_logs.team is '조별 일지 구분. 기존 데이터는 갑조';
comment on column public.work_log_copies.team is '최근 복사 상태를 복원할 조';
revoke all on function public.team_usage_counts(text) from public,anon;
grant execute on function public.team_usage_counts(text) to authenticated;
revoke all on function public.save_work_log_for_team(text,uuid,integer,text,jsonb,text[]) from public,anon;
grant execute on function public.save_work_log_for_team(text,uuid,integer,text,jsonb,text[]) to authenticated;
revoke all on function public.latest_team_copy(text) from public,anon;
grant execute on function public.latest_team_copy(text) to authenticated;
revoke all on function public.shared_usage_counts() from public,anon;
grant execute on function public.shared_usage_counts() to authenticated;
revoke all on function public.save_work_log(uuid,integer,text,jsonb,text[]) from public,anon;
grant execute on function public.save_work_log(uuid,integer,text,jsonb,text[]) to authenticated;
notify pgrst, 'reload schema';
commit;
