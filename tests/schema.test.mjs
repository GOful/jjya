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
