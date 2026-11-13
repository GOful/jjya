import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../cloud.js',import.meta.url),'utf8');
function client({stored=true,failCatalog=false,revoked=false,patchConflict=false}={}){
  const calls=[];let active=0,peak=0,fail=failCatalog;
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
      else result={version:1,data:{training:[],inspections:[],misc:[]}};
    }else if(path==='/rest/v1/rpc/team_usage_counts')result={[body.p_team]:calls.length};
    else if(path==='/rest/v1/rpc/latest_team_copy')result={id:body.p_team,version:calls.length};
    else if(path.startsWith('/rest/v1/risk_trainings?'))result=patchConflict?[]:[{id:1,risk_text:body.risk_text,safety_rules:body.safety_rules}];
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

test('training edits guard original content, patch only text fields and invalidate catalog cache',async()=>{
  const c=client();await c.api.start();await c.api.readCatalog();
  const original={id:1,riskText:'위험 "인용", (항목) \\ 경로',safetyRules:'첫째 줄\n둘째 줄'};
  const result=await c.api.updateTraining(original,' 새 위험내용 ',' 새 안전수칙 ');
  assert.equal(result.risk_text,'새 위험내용');assert.equal(result.safety_rules,'새 안전수칙');
  const patch=c.calls.find(call=>call.method==='PATCH');
  assert.deepEqual(Object.keys(patch.body).sort(),['risk_text','safety_rules']);
  assert.equal(patch.headers.Prefer,'return=representation');
  const query=new URLSearchParams(patch.path.split('?')[1]);
  assert.equal(query.get('id'),'eq.1');
  const decode=value=>value.slice(4,-1).replace(/\\(.)/gs,'$1');
  assert.equal(decode(query.get('risk_text')),original.riskText);assert.equal(decode(query.get('safety_rules')),original.safetyRules);
  await c.api.readCatalog();assert.equal(c.calls.filter(call=>call.path.endsWith('/get_app_catalog')).length,2);
  const conflicting=client({patchConflict:true});await conflicting.api.start();
  await assert.rejects(conflicting.api.updateTraining(original,'다른 내용','안전수칙'),/CONTENT_VERSION_CONFLICT/);
});
