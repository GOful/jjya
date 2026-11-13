import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../cloud.js',import.meta.url),'utf8');
function client({stored=true,failCatalog=false,revoked=false,saveConflict=false}={}){
  const calls=[];let active=0,peak=0,fail=failCatalog;
  let catalogVersion=1;
  let trainingRow=[1,'일상','위험 \"인용\", (항목) \\ 경로','첫째 줄\n둘째 줄'];
  let catalogData={training:[trainingRow],inspections:[['여름철','',['여름 점검1','여름 점검2']]],misc:Array.from({length:6},(_,i)=>[`업무 ${i+1}`,`* 본문 ${i+1}`])};
  const base='https://example.supabase.co';
  const session={access_token:'test-token',refresh_token:'test-refresh',expires_at:Date.now()/1000+3600,user:{id:'test-user'}};
  const values=new Map(stored?[[`jjya.auth:${base}`,JSON.stringify(session)]]:[]);
  const window={SUPABASE_CONFIG:{enabled:true,url:base,publishableKey:'sb_publishable_test'}};
  const fetch=async(url,options)=>{
    const path=url.slice(base.length),body=options.body?JSON.parse(options.body):{};
    calls.push({path,body,method:options.method,headers:options.headers});active++;peak=Math.max(peak,active);
    await new Promise(resolve=>setTimeout(resolve,25));active--;
    let result,status=200;
    if(revoked && options.headers.Authorization==='Bearer test-token'){status=401;result={message:'revoked'};}
    else if(path==='/auth/v1/signup')result={...session,access_token:revoked?'fresh-token':session.access_token,expires_in:3600};
    else if(path==='/rest/v1/rpc/get_app_catalog'){
      if(fail){fail=false;status=500;result={message:'temporary failure'};}
      else result={version:catalogVersion,data:catalogData};
    }else if(path==='/rest/v1/rpc/team_usage_counts')result={[body.p_team]:calls.length};
    else if(path==='/rest/v1/rpc/latest_team_copy')result={id:body.p_team,version:calls.length};
    else if(path==='/rest/v1/rpc/save_app_catalog'){
      if(saveConflict){status=400;result={code:'P0001',message:'VERSION_CONFLICT'};}
      else {catalogData=body.p_data;result=++catalogVersion;}
    }
    else throw new Error(`Unexpected request: ${path}`);
    return {ok:status===200,status,text:async()=>JSON.stringify(result)};
  };
  vm.runInNewContext(source,{window,fetch,Date,JSON,Error,Boolean,atob,URLSearchParams,sessionStorage:{getItem:key=>values.get(key),setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)}});
  return {api:window.SharedStore,calls,peak:()=>peak};
}
test('valid sessions avoid an auth round trip; snapshot reads run in parallel',async()=>{
  const c=client();assert.equal((await c.api.start()).id,'test-user');assert.equal(c.calls.length,0);
  const snapshot=await c.api.snapshot('갑조');
  assert.equal(c.calls.length,3);assert.equal(c.peak(),3);assert.equal(snapshot.copied.id,'갑조');
});
test('catalog requests coalesce and cache, but team counts/copies are always fresh',async()=>{
  const c=client();await c.api.start();
  const [first,second]=await Promise.all([c.api.snapshot('갑조'),c.api.snapshot('을조')]);
  assert.equal(c.calls.filter(call=>call.path.endsWith('/get_app_catalog')).length,1);
  assert.equal(first.copied.id,'갑조');assert.equal(second.copied.id,'을조');
  const before=c.calls.length;await c.api.snapshot('갑조');assert.equal(c.calls.length-before,2);
  assert.equal(c.calls.filter(call=>call.path.endsWith('/team_usage_counts')).length,3);
  assert.equal(c.calls.filter(call=>call.path.endsWith('/latest_team_copy')).length,3);
});
test('failed catalog loads are not cached and new visitors still authenticate',async()=>{
  const c=client({stored:false,failCatalog:true});await c.api.start();
  assert.equal(c.calls[0].path,'/auth/v1/signup');
  await assert.rejects(c.api.snapshot('갑조'),/temporary failure/);
  await c.api.snapshot('갑조');
  assert.equal(c.calls.filter(call=>call.path.endsWith('/get_app_catalog')).length,2);
});

test('revoked cached sessions recover once for concurrent requests',async()=>{
  const c=client({revoked:true});await c.api.start();
  const result=await c.api.snapshot('갑조');
  assert.equal(result.copied.id,'갑조');
  assert.equal(c.calls.filter(call=>call.path==='/auth/v1/signup').length,1);
});

test('training edits use transactional JSON RPC, preserve IDs/categories and invalidate cached data',async()=>{
  const c=client();await c.api.start();await c.api.readCatalog();
  const original={id:1,riskText:'위험 "인용", (항목) \\ 경로',safetyRules:'첫째 줄\n둘째 줄'};
  const result=await c.api.updateTraining(original,' 새 위험내용 "따옴표", (괄호) ',' 새 안전수칙\n차단 확인 ');
  assert.equal(result.risk_text,'새 위험내용 "따옴표", (괄호)');assert.equal(result.safety_rules,'새 안전수칙\n차단 확인');
  const saved=c.calls.find(call=>call.path==='/rest/v1/rpc/save_app_catalog');
  assert.equal(saved.method,'POST');assert.equal(saved.body.p_expected_version,1);
  assert.deepEqual(saved.body.p_data.training[0],[1,'일상','새 위험내용 "따옴표", (괄호)','새 안전수칙\n차단 확인']);
  assert.equal(c.calls.filter(call=>call.method==='PATCH').length,0);
  await c.api.readCatalog();assert.equal(c.calls.filter(call=>call.path.endsWith('/get_app_catalog')).length,3);
  const conflicting=client({saveConflict:true});await conflicting.api.start();
  await assert.rejects(conflicting.api.updateTraining(original,'다른 내용','안전수칙'),/CONTENT_VERSION_CONFLICT/);
  await assert.rejects(c.api.updateTraining(original,'이전 데이터로 덮어쓰기','안전수칙'),/CONTENT_VERSION_CONFLICT/);
  const writes=c.calls.filter(call=>call.path==='/rest/v1/rpc/save_app_catalog').length;
  // Exact retry after a response loss does not write the whole catalog twice.
  await c.api.updateTraining(original,'새 위험내용 "따옴표", (괄호)','새 안전수칙\n차단 확인');
  assert.equal(c.calls.filter(call=>call.path==='/rest/v1/rpc/save_app_catalog').length,writes);
});

test('inspection and misc edits preserve positions, share common data, reject stale edits and keep exact retries idempotent',async()=>{
  const c=client();await c.api.start();
  const inspection={typeIndex:0,itemIndex:0,content:'여름 점검1'};
  assert.equal((await c.api.updateInspection(inspection,'수정된 점검\n공통')).content,'수정된 점검\n공통');
  let data=(await c.api.readCatalog()).data;
  assert.equal(data.inspections[0][2][0],'수정된 점검\n공통');assert.equal(data.inspections[0][2][1],'여름 점검2');
  await assert.rejects(c.api.updateInspection(inspection,'이전 점검으로 덮어쓰기'),/CONTENT_VERSION_CONFLICT/);
  const original={index:0,title:'업무 1',logText:'* 본문 1'};
  const changed=await c.api.updateMisc(original,'검침 관리','* 공통 검침 기록');
  assert.equal(changed.index,0);assert.equal(changed.logText,'* 공통 검침 기록');
  data=(await c.api.readCatalog()).data;
  assert.deepEqual(data.misc[0],['검침 관리','* 공통 검침 기록']);assert.deepEqual(data.misc[1],['업무 2','* 본문 2']);
  const saves=c.calls.filter(call=>call.path==='/rest/v1/rpc/save_app_catalog').length;
  await c.api.updateMisc(original,'검침 관리','* 공통 검침 기록');
  assert.equal(c.calls.filter(call=>call.path==='/rest/v1/rpc/save_app_catalog').length,saves);
  await assert.rejects(c.api.updateMisc(original,'이전 내용 덮어쓰기','* 실패'),/CONTENT_VERSION_CONFLICT/);
  await assert.rejects(c.api.updateMisc({index:6,title:'서무업무',logText:'* 분소행정업무처리'},'서무업무','* 수정된 서무업무'),/OFFICE_TASK_MIGRATION_REQUIRED/);
});
