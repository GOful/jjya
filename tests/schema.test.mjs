import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const root = new URL('../', import.meta.url);
test('shared database: row permissions, atomic counting, retries, versions and catalog', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated;
      create schema auth; create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;
      insert into auth.users values ('00000000-0000-0000-0000-000000000001'),('00000000-0000-0000-0000-000000000002');`);
    await db.exec(await readFile(new URL('supabase/schema.sql', root),'utf8'));
    await db.exec(await readFile(new URL('supabase/seed.sql', root),'utf8'));
    // Re-running setup must retain edited rows and counts.
    await db.exec(await readFile(new URL('supabase/schema.sql', root),'utf8'));
    await db.exec(`set role anon;`);
    await assert.rejects(db.query('select * from public.work_logs'), /permission denied/);
    await assert.rejects(db.query("select public.shared_usage_counts()"), /permission denied/);
    await db.exec(`reset role;set role authenticated;select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);`);
    const id='10000000-0000-0000-0000-000000000001';
    const save=async(version,keys=null)=> (await db.query('select public.save_work_log($1,$2,$3,$4,$5) as saved',[id,version,'일지 본문',{},keys])).rows[0].saved;
    let result=await save(0); assert.equal(result.version,1);assert.deepEqual(result.counts,{});
    result=await save(1,['일상|1','inspection:0:0']); assert.equal(result.version,2);assert.equal(result.counts['일상|1'],1);
    result=await save(2,['일상|1','inspection:0:0']);assert.equal(result.counts['일상|1'],1);
    await assert.rejects(save(1,['일상|1']),/VERSION_CONFLICT/);
    await db.exec(`select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false);`);
    assert.equal((await db.query('select * from public.work_logs')).rows.length,1);
    result=await save(3,['일상|1','inspection:0:1']);assert.equal(result.counts['inspection:0:1'],1);
    await assert.rejects(db.query("insert into public.copy_events(log_id,item_key) values ($1,'일상|1')",[id]),/permission denied/);
    await assert.rejects(db.query("update public.work_logs set body='overwrite'"),/permission denied/);
    const catalog=(await db.query('select data from public.app_catalog')).rows[0].data;
    catalog.misc[0][0]='공유 검침';
    assert.equal((await db.query('select public.save_app_catalog($1,$2) as version',[1,catalog])).rows[0].version,2);
    await assert.rejects(db.query('select public.save_app_catalog($1,$2)',[1,catalog]),/VERSION_CONFLICT/);
    // Invalid event rolls back the associated log write too.
    await assert.rejects(save(4,['x'.repeat(101)]),/check constraint/);
    assert.equal((await db.query('select version from public.work_logs')).rows[0].version,4);
    await db.exec("select set_config('request.jwt.claim.sub','',false)");
    assert.equal((await db.query('select * from public.work_logs')).rows.length,0);
    await assert.rejects(save(4),/ANONYMOUS_AUTH_REQUIRED/);
  } finally { await db.close(); }
});
