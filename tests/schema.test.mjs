import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const root = new URL('../supabase/', import.meta.url);
const sql = name => readFile(name.startsWith('legacy-') ? new URL('fixtures/'+name,import.meta.url) : new URL(name,root),'utf8');
async function database() {
  const db=new PGlite();
  await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;
    insert into auth.users values ('00000000-0000-0000-0000-000000000001'),('00000000-0000-0000-0000-000000000002');`);
  return db;
}
async function asUser(db,id='00000000-0000-0000-0000-000000000001') {
  await db.exec(`reset role;set role authenticated;select set_config('request.jwt.claim.sub','${id}',false)`);
}
test('normalized catalog, policies, atomic counts and immutable last-copy snapshot', async () => {
  const db=await database();
  try {
    await db.exec(await sql('schema.sql'));await db.exec(await sql('seed.sql'));
    await db.exec(await sql('schema.sql'));
    assert.equal((await db.query('select count(*)::integer as n from public.risk_trainings')).rows[0].n,23);
    assert.equal((await db.query('select count(*)::integer as n from public.inspection_items')).rows[0].n,46);
    await db.exec('set role anon');
    await assert.rejects(db.query('select * from public.work_logs'),/permission denied/);
    await assert.rejects(db.query('select public.get_app_catalog()'),/permission denied/);
    await asUser(db);
    const id='10000000-0000-0000-0000-000000000001';
    const save=async(version,keys=null,body='복사된 일지')=>(await db.query('select public.save_work_log($1,$2,$3,$4,$5) as saved',[id,version,body,{selected:'one'},keys])).rows[0].saved;
    let result=await save(0);assert.equal(result.version,1);assert.deepEqual(result.counts,{});
    assert.equal((await db.query('select count(*)::integer n from public.work_log_copies')).rows[0].n,0);
    result=await save(1,['일상|1','inspection:0:0']);assert.equal(result.counts['일상|1'],1);
    result=await save(2,['일상|1','inspection:0:0']);assert.equal(result.counts['일상|1'],1);
    await assert.rejects(save(1),/VERSION_CONFLICT/);
    await asUser(db,'00000000-0000-0000-0000-000000000002');
    result=await save(3,null,'복사 이후 저장한 초안');assert.equal(result.version,4);
    const latest=(await db.query('select * from public.work_log_copies order by copied_at desc,id desc limit 1')).rows[0];
    assert.equal(latest.body,'복사된 일지');assert.equal(latest.log_version,3);assert.deepEqual(latest.state,{selected:'one'});
    assert.equal((await db.query("select usage_count from public.risk_training_usage where id=1 and category='일상'")).rows[0].usage_count,1);
    assert.equal((await db.query('select usage_count from public.inspection_item_usage where type_id=1 and item_no=1')).rows[0].usage_count,1);
    const catalog=(await db.query('select public.get_app_catalog() c')).rows[0].c;
    catalog.data.misc[0][0]='행으로 관리하는 검침';
    const changed=(await db.query('select public.save_app_catalog($1,$2) v',[catalog.version,catalog.data])).rows[0].v;
    assert(changed>catalog.version);
    assert.equal((await db.query('select title from public.misc_tasks where id=1')).rows[0].title,'행으로 관리하는 검침');
    await assert.rejects(db.query('select public.save_app_catalog($1,$2)',[catalog.version,catalog.data]),/VERSION_CONFLICT/);
    await db.query("update public.inspection_items set content='개별 행 직접 수정' where type_id=1 and item_no=1");
    assert((await db.query('select version from public.catalog_revision')).rows[0].version>changed);
    await assert.rejects(db.query('update public.risk_trainings set id=100 where id=1'),/permission denied/);
    await assert.rejects(db.query("insert into public.copy_events(log_id,item_key) values ($1,'일상|1')",[id]),/permission denied/);
    await assert.rejects(save(4,['x'.repeat(101)]),/check constraint/);
    assert.equal((await db.query('select version from public.work_logs')).rows[0].version,4);
    assert.equal((await db.query('select count(*)::integer n from public.work_log_copies')).rows[0].n,2);
    await db.exec("select set_config('request.jwt.claim.sub','',false)");
    assert.equal((await db.query('select * from public.work_logs')).rows.length,0);
    await assert.rejects(save(4),/ANONYMOUS_AUTH_REQUIRED/);
  }finally{await db.close();}
});
test('legacy migration preserves edited content, counts/logs, stable IDs and repeatability',async()=>{
  const db=await database();
  try{
    await db.exec(await sql('legacy-schema.sql'));await db.exec(await sql('legacy-seed.sql'));
    await db.exec("update public.app_catalog set data=jsonb_set(data,'{training,0,2}','\"기존 수정된 위험항목\"')");
    await asUser(db);
    const id='20000000-0000-0000-0000-000000000001';
    await db.query('select public.save_work_log($1,0,$2,$3,$4)',[id,'기존 일지',{original:true},['일상|1','inspection:0:0']]);
    await db.exec('reset role');await db.exec(await sql('migrate-normalized.sql'));
    assert.equal((await db.query('select risk_text from public.risk_trainings where id=1')).rows[0].risk_text,'기존 수정된 위험항목');
    assert.equal((await db.query("select to_regclass('public.app_catalog') v")).rows[0].v,null);
    assert((await db.query("select to_regclass('jjya_archive.app_catalog_legacy') v")).rows[0].v);
    assert.equal((await db.query('select body from public.work_log_copies')).rows[0].body,'기존 일지');
    await db.exec("update public.misc_tasks set title='이전 후 편집' where id=1");
    await db.exec(await sql('migrate-normalized.sql'));
    assert.equal((await db.query('select count(*)::integer n from public.work_log_copies')).rows[0].n,1);
    assert.equal((await db.query('select title from public.misc_tasks where id=1')).rows[0].title,'이전 후 편집');
    await asUser(db);
    assert.equal((await db.query('select public.shared_usage_counts() c')).rows[0].c['일상|1'],1);
    await assert.rejects(db.query('select * from jjya_archive.app_catalog_legacy'),/permission denied/);
  }finally{await db.close();}
});
test('team migration assigns old counts to 갑조 and isolates counters/copies across all teams',async()=>{
  const db=await database();
  try{
    await db.exec(await sql('schema.sql'));await db.exec(await sql('seed.sql'));await asUser(db);
    const oldId='30000000-0000-0000-0000-000000000001';
    await db.query('select public.save_work_log($1,0,$2,$3,$4)',[oldId,'기존 갑조 기록',{original:true},['일상|1','inspection:0:0']]);
    await db.exec('reset role');await db.exec(await sql('migrate-teams.sql'));await asUser(db);
    const counts=async team=>(await db.query('select public.team_usage_counts($1) c',[team])).rows[0].c;
    assert.equal((await counts('갑조'))['일상|1'],1);
    assert.deepEqual(await counts('을조'),{});assert.deepEqual(await counts('병조'),{});
    const save=async(team,id,version=0)=> (await db.query('select public.save_work_log_for_team($1,$2,$3,$4,$5,$6) r',[team,id,version,`${team} 본문`,{selected:'one'},['일상|1','inspection:0:0']])).rows[0].r;
    const eulId='30000000-0000-0000-0000-000000000002',byeongId='30000000-0000-0000-0000-000000000003';
    await save('을조',eulId);await save('을조',eulId,1);await save('병조',byeongId);
    for(const team of ['갑조','을조','병조'])assert.equal((await counts(team))['일상|1'],1);
    assert.equal((await db.query('select public.shared_usage_counts() c')).rows[0].c['일상|1'],1);
    const copied=(await db.query("select public.latest_team_copy('을조') c")).rows[0].c;
    assert.equal(copied.id,eulId);assert.equal(copied.state.team,'을조');
    assert.equal((await db.query("select public.latest_team_copy('갑조') c")).rows[0].c.id,oldId);
    await assert.rejects(save('병조',eulId,2),/VERSION_CONFLICT/);
    await assert.rejects(save('정조',eulId,2),/INVALID_TEAM/);
    assert.equal((await db.query("select usage_count from public.team_risk_training_usage where team='을조' and id=1 and category='일상'")).rows[0].usage_count,1);
    assert.equal((await db.query("select usage_count from public.team_inspection_item_usage where team='병조' and type_id=1 and item_no=1")).rows[0].usage_count,1);
    await db.exec('reset role');await db.exec(await sql('migrate-teams.sql'));await asUser(db);
    for(const team of ['갑조','을조','병조'])assert.equal((await counts(team))['일상|1'],1);
    assert.equal((await db.query('select count(*)::integer n from public.work_log_copies')).rows[0].n,4);
    await db.exec('reset role;set role anon');
    await assert.rejects(db.query("select public.team_usage_counts('갑조')"),/permission denied/);
  }finally{await db.close();}
});
test('manual counts: atomic delta, retry idempotence, zero floor, copy semantics and team isolation',async()=>{
  const db=await database();
  try{
    await db.exec(await sql('schema.sql'));await db.exec(await sql('seed.sql'));await db.exec(await sql('team-schema.sql'));await db.exec(await sql('count-editing-schema.sql'));await asUser(db);
    let n=1;const request=()=>`40000000-0000-0000-0000-${String(n++).padStart(12,'0')}`;
    const adjust=async(team,key,delta,id=request())=>(await db.query('select public.adjust_usage_count($1,$2,$3,$4) c',[team,key,delta,id])).rows[0].c;
    const retry=request();assert.equal((await adjust('갑조','일상|1',1,retry))['일상|1'],1);
    assert.equal((await adjust('갑조','일상|1',1,retry))['일상|1'],1);
    await assert.rejects(adjust('을조','일상|1',1,retry),/REQUEST_ID_CONFLICT/);
    assert.equal((await adjust('갑조','일상|1',-1))['일상|1'],0);
    const zeroRetry=request();assert.equal((await adjust('갑조','일상|1',-1,zeroRetry))['일상|1'],0);
    const log='41000000-0000-0000-0000-000000000001';
    await db.query('select public.save_work_log_for_team($1,$2,0,$3,$4,$5)',['갑조',log,'본문',{},['일상|1','inspection:0:0']]);
    // Retrying a decrement originally made at zero must not subtract a later copy.
    assert.equal((await adjust('갑조','일상|1',-1,zeroRetry))['일상|1'],1);
    assert.equal((await adjust('갑조','일상|1',-1))['일상|1'],0);
    await db.query('select public.save_work_log_for_team($1,$2,1,$3,$4,$5)',['갑조',log,'본문',{},['일상|1','inspection:0:0']]);
    assert.equal((await db.query("select public.team_usage_counts('갑조') c")).rows[0].c['일상|1'],0);
    assert.equal((await adjust('갑조','inspection:0:0',1))['inspection:0:0'],2);
    assert.equal((await adjust('을조','일상|1',1))['일상|1'],1);
    assert.equal((await db.query("select public.team_usage_counts('갑조') c")).rows[0].c['일상|1'],0);
    assert.deepEqual((await db.query("select public.team_usage_counts('병조') c")).rows[0].c,{});
    assert.equal((await db.query("select usage_count from public.team_inspection_item_usage where team='갑조' and type_id=1 and item_no=1")).rows[0].usage_count,2);
    assert.equal((await db.query('select count(*)::integer n from public.copy_events')).rows[0].n,2);
    await assert.rejects(adjust('갑조','invalid:key',1),/INVALID_ITEM_KEY/);
    await assert.rejects(adjust('갑조','일상|1',5),/INVALID_ADJUSTMENT/);
    await assert.rejects(db.query('delete from public.usage_adjustments'),/permission denied/);
    await db.exec('reset role');await db.exec(await sql('migrate-count-editing.sql'));await asUser(db);
    assert.equal((await db.query("select public.team_usage_counts('갑조') c")).rows[0].c['inspection:0:0'],2);
    assert.equal((await db.query("select public.team_usage_counts('을조') c")).rows[0].c['일상|1'],1);
    await db.exec('reset role;set role anon');
    await assert.rejects(adjust('갑조','일상|1',1),/permission denied/);
  }finally{await db.close();}
});
