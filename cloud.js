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
  let session = null, refreshing = null;
  try { session = JSON.parse(sessionStorage.getItem(storageKey) || 'null'); } catch (_) { /* Memory-only session. */ }
  function keep(value) {
    session = value;
    try { value ? sessionStorage.setItem(storageKey, JSON.stringify(value)) : sessionStorage.removeItem(storageKey); } catch (_) { /* Memory-only session. */ }
  }
  async function request(path, {method = 'GET', body, token} = {}) {
    const headers = {apikey:config.publishableKey};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
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
  async function db(path, options = {}) { return request('/rest/v1/' + path, {...options, token:await token()}); }
  window.SharedStore = {
    enabled,
    async start() {
      if (session) {
        try { return await this.user(); } catch (_) { keep(null); }
      }
      const value = await request('/auth/v1/signup', {method:'POST', body:{data:{}}});
      if (!value.access_token) throw new Error('익명 로그인을 활성화하세요.');
      keep({...value, expires_at:Date.now()/1000 + value.expires_in});
      return value.user;
    },
    async user() { if (!session) return null; return request('/auth/v1/user', {token:await token()}); },
    async logout() {
      try { if (session) await request('/auth/v1/logout',{method:'POST',token:await token()}); } finally { keep(null); }
    },
    async snapshot() {
      const [catalog, counts, logs] = await Promise.all([
        db('app_catalog?select=data,version&id=eq.true'),
        db('rpc/shared_usage_counts', {method:'POST',body:{}}),
        db('work_logs?select=id,version,updated_at&order=updated_at.desc&limit=30')
      ]);
      if (!catalog.length) throw new Error('점검 데이터 초기화를 확인하세요.');
      return {catalog:catalog[0],counts,logs};
    },
    async counts() { return db('rpc/shared_usage_counts',{method:'POST',body:{}}); },
    async logs() { return db('work_logs?select=id,version,updated_at&order=updated_at.desc&limit=30'); },
    async load(id) {
      const rows = await db(`work_logs?select=*&id=eq.${encodeURIComponent(id)}`);
      if (!rows.length) throw new Error('저장된 일지가 없습니다.');
      return rows[0];
    },
    async save({id,version,body,state,keys = null}) {
      return db('rpc/save_work_log',{method:'POST',body:{p_id:id,p_expected_version:version,p_body:body,p_state:state,p_keys:keys}});
    },
    async catalog(version,data) { return db('rpc/save_app_catalog',{method:'POST',body:{p_expected_version:version,p_data:data}}); }
  };
})();
