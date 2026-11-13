/* Supabase Auth and PostgREST over the documented HTTP APIs; no admin credentials. */
(() => {
  'use strict';
  const config = window.SUPABASE_CONFIG || {};
  const enabled = Boolean(config.enabled !== false && config.url && config.publishableKey);
  const base = enabled ? config.url.replace(/\/$/, '') : '';
  if (enabled && (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(base))) {
    throw new Error('Supabase Project URL을 확인하세요.');
  }
  if (enabled && !config.publishableKey.startsWith('sb_publishable_')) {
    let role;
    try { role = JSON.parse(atob(config.publishableKey.split('.')[1])).role; } catch (_) { /* Invalid key. */ }
    if (role !== 'anon') throw new Error('Publishable key 또는 anon public key만 사용할 수 있습니다.');
  }
  const storageKey = `jjya.auth:${base}`;
  let session = null, refreshing = null, reauthorizing = null;
  try { session = JSON.parse(sessionStorage.getItem(storageKey) || 'null'); } catch (_) { /* Memory-only session. */ }
  function keep(value) {
    session = value;
    try { value ? sessionStorage.setItem(storageKey, JSON.stringify(value)) : sessionStorage.removeItem(storageKey); } catch (_) { /* Memory-only session. */ }
  }
  async function request(path, {method = 'GET', body, token, prefer} = {}) {
    const headers = {apikey:config.publishableKey};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (prefer) headers.Prefer=prefer;
    if (token) headers.Authorization = `Bearer ${token}`;
    const response = await fetch(base + path, {method, headers, body:body === undefined ? undefined : JSON.stringify(body)});
    const text = await response.text();
    let result; try { result = text ? JSON.parse(text) : null; } catch (_) { result = null; }
    if (!response.ok) {
      const error = new Error(result?.message || result?.msg || result?.error_description || '서버 요청에 실패했습니다.');
      error.status = response.status; throw error;
    }
    return result;
  }
  async function token() {
    if (!session?.access_token) throw new Error('로그인해 주세요.');
    if (!session.expires_at || session.expires_at * 1000 < Date.now() + 60000) {
      if (!refreshing) refreshing = request('/auth/v1/token?grant_type=refresh_token', {
        method:'POST',body:{refresh_token:session.refresh_token}
      }).then(value => { keep({...value, expires_at:Date.now()/1000 + value.expires_in}); return value.access_token; })
        .catch(error => { keep(null); throw error; }).finally(() => { refreshing = null; });
      return refreshing;
    }
    return session.access_token;
  }
  async function anonymousSession() {
    const value=await request('/auth/v1/signup',{method:'POST',body:{data:{}}});
    if(!value.access_token)throw new Error('익명 로그인을 활성화하세요.');
    keep({...value,expires_at:Date.now()/1000+value.expires_in});
    return value.user;
  }
  async function db(path, options = {}) {
    const access=await token();
    try{return await request('/rest/v1/'+path,{...options,token:access});}
    catch(error){
      if(error.status!==401)throw error;
      // Expired/revoked cached sessions recover once, without an extra check on every visit.
      if(session?.access_token===access){
        if(!reauthorizing)reauthorizing=anonymousSession().finally(()=>{reauthorizing=null;});
        await reauthorizing;
      }
      return request('/rest/v1/'+path,{...options,token:await token()});
    }
  }
  let teamsReady = false, catalogPromise = null;
  const CATALOG_TTL = 60000;
  let catalogFetchedAt = 0;
  const validTeam = team => { if(!['갑조','을조','병조'].includes(team)) throw new Error('INVALID_TEAM'); };
  window.SharedStore = {
    get teamsReady() { return teamsReady; },
    enabled,
    async start() {
      if (session) {
        // Reuse a valid session; the data API still verifies every access token.
        try { await token(); if(session?.user?.id) return session.user; } catch (_) { keep(null); }
      }
      return anonymousSession();
    },
    async user() { if (!session) return null; return request('/auth/v1/user', {token:await token()}); },
    async snapshot(team = '갑조') {
      const [catalog, counts, copied] = await Promise.all([
        this.readCatalog(),
        this.counts(team),
        this.latestCopy(team)
      ]);
      return {catalog,counts,copied};
    },
    async readCatalog({force = false} = {}) {
      // Team contents are common. Share one in-flight request and cache it briefly.
      // Counts and the last copied log are never cached.
      if(!force && catalogPromise && Date.now()-catalogFetchedAt<CATALOG_TTL)return catalogPromise;
      catalogFetchedAt=Date.now();
      catalogPromise=(async()=>{
        try { return await db('rpc/get_app_catalog',{method:'POST',body:{}}); }
        catch(error) {
          if(error.status !== 404) throw error;
          const rows = await db('app_catalog?select=data,version&id=eq.true');
          if(!rows.length) throw new Error('점검 데이터 초기화를 확인하세요.');
          return rows[0];
        }
      })();
      try{return await catalogPromise;}catch(error){catalogPromise=null;throw error;}
    },
    async latestCopy(team = '갑조') {
      validTeam(team);
      // This request is independent of the counts/catalog requests, so it can start immediately.
      try { return await db('rpc/latest_team_copy',{method:'POST',body:{p_team:team}}); }
      catch(error) { if(error.status!==404)throw error; }
      if(team!=='갑조') throw new Error('TEAM_MIGRATION_REQUIRED');
      try {
        const rows=await db('work_log_copies?select=log_id,log_version,body,state,copied_at&order=copied_at.desc,id.desc&limit=1');
        if(!rows.length)return null;
        const copy=rows[0];
        return {id:copy.log_id,version:copy.log_version,body:copy.body,state:copy.state,updated_at:copy.copied_at};
      } catch(error) {
        if(error.status!==404)throw error;
        // Older schemas record item usage, but cannot preserve historical body edits.
        const events=await db('copy_events?select=log_id,copied_at&order=copied_at.desc,log_id.desc&limit=1');
        return events.length ? this.load(events[0].log_id) : null;
      }
    },
    async counts(team = '갑조') {
      validTeam(team);
      try { const result = await db('rpc/team_usage_counts',{method:'POST',body:{p_team:team}});teamsReady=true;return result; }
      catch(error) {
        if(error.status!==404)throw error;
        teamsReady=false;
        if(team!=='갑조')throw new Error('TEAM_MIGRATION_REQUIRED');
        return db('rpc/shared_usage_counts',{method:'POST',body:{}});
      }
    },
    async updateTraining(original,riskText,safetyRules) {
      if(!Number.isInteger(original.id)||!riskText.trim()||!safetyRules.trim())throw new Error('EMPTY_TRAINING_CONTENT');
      // Match the previously read content to avoid silently overwriting another editor.
      const quoted=value=>'eq."'+value.replaceAll('\\','\\\\').replaceAll('"','\\"')+'"';
      const query=new URLSearchParams({id:`eq.${original.id}`,risk_text:quoted(original.riskText),safety_rules:quoted(original.safetyRules)});
      let rows;
      try{rows=await db(`risk_trainings?${query}`,{method:'PATCH',prefer:'return=representation',body:{risk_text:riskText.trim(),safety_rules:safetyRules.trim()}});}
      catch(error){if(error.status===404)throw new Error('CONTENT_EDIT_MIGRATION_REQUIRED');throw error;}
      if(!Array.isArray(rows)||rows.length!==1)throw new Error('CONTENT_VERSION_CONFLICT');
      catalogPromise=null;catalogFetchedAt=0;
      return rows[0];
    },
    async adjustCount(team,key,delta,requestId) {
      validTeam(team);
      try{return await db('rpc/adjust_usage_count',{method:'POST',body:{p_team:team,p_item_key:key,p_delta:delta,p_request_id:requestId}});}
      catch(error){if(error.status===404)throw new Error('COUNT_EDIT_MIGRATION_REQUIRED');throw error;}
    },
    async load(id) {
      const rows = await db(`work_logs?select=*&id=eq.${encodeURIComponent(id)}`);
      if (!rows.length) throw new Error('저장된 일지가 없습니다.');
      return rows[0];
    },
    async save({id,version,body,state,keys = null,team = '갑조'}) {
      validTeam(team);
      if(teamsReady) return db('rpc/save_work_log_for_team',{method:'POST',body:{p_team:team,p_id:id,p_expected_version:version,p_body:body,p_state:state,p_keys:keys}});
      if(team!=='갑조')throw new Error('TEAM_MIGRATION_REQUIRED');
      return db('rpc/save_work_log',{method:'POST',body:{p_id:id,p_expected_version:version,p_body:body,p_state:state,p_keys:keys}});
    }
  };
})();
