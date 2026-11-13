"""Browser integration against a simulated Supabase HTTP API; no live credentials.
Run: python tests/browser_shared.py (requires playwright and Chromium).
"""
import json
import threading
import uuid
import re
from urllib.parse import urlparse, parse_qs
from functools import partial
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
seed = (ROOT / 'tests/fixtures/legacy-seed.sql').read_text().split('$catalog$')[1]
catalog = json.loads(seed)
logs, counts = {}, {}
team_counts = {'갑조':counts,'을조':{},'병조':{}}
copy_snapshots = []
adjustment_requests = {}
catalog_version = 1
server = ThreadingHTTPServer(('127.0.0.1', 0), partial(SimpleHTTPRequestHandler, directory=str(ROOT)))
threading.Thread(target=server.serve_forever, daemon=True).start()

def respond(route):
    global catalog_version, catalog
    request = route.request
    path = request.url.split('.supabase.co', 1)[1]
    body = request.post_data_json if request.post_data else {}
    status, result = 200, None
    if path.startswith('/auth/v1/signup'):
        assert 'email' not in body
        result = {'access_token':'test-access-token', 'refresh_token':'test-refresh', 'expires_in':3600, 'user':{'id':str(uuid.uuid4())}}
    elif path.startswith('/auth/v1/user'):
        result = {'id':str(uuid.uuid4())}
    elif path.startswith('/rest/v1/rpc/get_app_catalog'):
        result = {'data':catalog,'version':catalog_version}
    elif path.startswith('/rest/v1/work_log_copies'):
        result = copy_snapshots[-1:]
    elif path.startswith('/rest/v1/app_catalog'):
        result = [{'data':catalog,'version':catalog_version}]
    elif path.startswith('/rest/v1/rpc/team_usage_counts'):
        result=team_counts[body['p_team']]
    elif path.startswith('/rest/v1/rpc/adjust_usage_count'):
        team,key,delta,identifier=body['p_team'],body['p_item_key'],body['p_delta'],body['p_request_id']
        if identifier not in adjustment_requests:
            team_counts[team][key]=max(0,team_counts[team].get(key,0)+delta)
            adjustment_requests[identifier]=body
        result=team_counts[team]
    elif path.startswith('/rest/v1/rpc/latest_team_copy'):
        rows=[copy for copy in copy_snapshots if copy.get('team','갑조')==body['p_team']]
        copy=rows[-1] if rows else None
        result=dict(id=copy['log_id'],version=copy['log_version'],body=copy['body'],state=copy['state'],updated_at=copy['copied_at'],team=body['p_team']) if copy else None
    elif path.startswith('/rest/v1/rpc/shared_usage_counts'):
        result = counts
    elif path.startswith('/rest/v1/risk_trainings?'):
        assert request.method=='PATCH'
        assert request.headers.get('prefer')=='return=representation'
        query=parse_qs(urlparse(request.url).query)
        identifier=int(query['id'][0].removeprefix('eq.'))
        def unquote_filter(value):
            assert value.startswith('eq.\"') and value.endswith('\"')
            return re.sub(r'\\(.)',r'\1',value[4:-1])
        item=next(item for item in catalog['training'] if item[0]==identifier)
        assert set(body)=={'risk_text','safety_rules'}
        if item[2]!=unquote_filter(query['risk_text'][0]) or item[3]!=unquote_filter(query['safety_rules'][0]):
            result=[]
        else:
            item[2]=body['risk_text'];item[3]=body['safety_rules'];catalog_version+=1
            result=[{'id':identifier,'categories':item[1].split(','),'risk_text':item[2],'safety_rules':item[3]}]
    elif path.startswith('/rest/v1/work_logs'):
        if '&id=eq.' in path:
            result = [logs[path.split('&id=eq.')[1]]]
        else:
            result = [dict(id=log['id'],version=log['version'],updated_at=log['updated_at']) for log in reversed(list(logs.values()))]
    elif path.startswith('/rest/v1/rpc/save_work_log'):
        identifier = body['p_id']
        team=body.get('p_team','갑조');target_counts=team_counts[team]
        existing = logs.get(identifier)
        if body['p_expected_version'] != (existing['version'] if existing else 0) or (existing and existing.get('team','갑조')!=team):
            status, result = 409, {'message':'VERSION_CONFLICT'}
        else:
            events = set(existing.get('events',[]) if existing else [])
            for key in body['p_keys'] or []:
                if key not in events:
                    target_counts[key] = target_counts.get(key,0)+1
                    events.add(key)
            logs[identifier] = dict(id=identifier,team=team,body=body['p_body'],state=body['p_state'],version=body['p_expected_version']+1,updated_at='2026-11-01T04:00:00Z',events=list(events))
            if body['p_keys'] is not None:
                copy_snapshots.append(dict(team=team,log_id=identifier,log_version=logs[identifier]['version'],body=body['p_body'],state=body['p_state'],copied_at='2026-11-01T04:00:00Z'))
            result = dict(version=logs[identifier]['version'],updated_at=logs[identifier]['updated_at'],counts=target_counts)
    elif path.startswith('/rest/v1/rpc/save_app_catalog'):
        if body['p_expected_version'] != catalog_version:
            status, result = 409, {'message':'VERSION_CONFLICT'}
        else:
            catalog = body['p_data'];catalog_version += 1;result=catalog_version
    else:
        raise AssertionError(path)
    route.fulfill(status=status, content_type='application/json', body=json.dumps(result))

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox'])
    contexts=[browser.new_context(permissions=['clipboard-read','clipboard-write']) for _ in range(2)]
    first,second=[context.new_page() for context in contexts]
    errors=[]
    for page in [first,second]:
        page.route('https://*.supabase.co/**',respond)
        page.on('pageerror',lambda error:errors.append(str(error)))
    url=f'http://127.0.0.1:{server.server_port}/index.html'
    first.goto(url);first.wait_for_function("!document.querySelector('#workspace').disabled")
    assert first.locator('#shared-tools,#save-log,#catalog-dialog,#cloud-mode').count()==0
    assert first.locator('#last-copied').inner_text()==''
    assert first.locator('#misc-items button span:last-child').all_text_contents()==['서무업무','전력량 검침','안전점검의 날','소화기 점검','음주측정기 점검','소방점검 입회','바닥왁스 작업 입회']
    assert first.locator('#misc-items .number').all_text_contents()==[str(i) for i in range(1,8)]
    first.locator('#misc-select-6').click()
    first.locator('#items button').first.click()
    first.locator('#inspection-items button').first.click()
    first.locator('#inspection-start').fill('2026-03-25');first.locator('#inspection-end').fill('2026-10-15')
    first.locator('#output-heading').click();first.locator('#misc-select-0').click()
    text=first.locator('#output').input_value()
    assert text.index('* 근골격계질환 대비 스트레칭 실시') < text.index('* 분소행정업무처리') < text.index('* 위험예지훈련 실시')
    assert text.index('* 변전소 전력량 검침') < text.index('작업 후 :')
    first.locator('#misc-select-6').click()
    assert '* 분소행정업무처리' not in first.locator('#output').input_value()
    assert '* 변전소 전력량 검침' in first.locator('#output').input_value()
    first.locator('#misc-select-6').click()
    assert first.locator('#output').input_value().count('* 분소행정업무처리')==1
    first.locator('#output').fill(first.locator('#output').input_value()+'\n공유 메모')
    first.locator('#copy').click();first.wait_for_function("!document.querySelector('#copy').disabled")
    assert first.locator('#last-copied').inner_text().startswith('최근 복사 · ')
    assert counts=={'일상|1':1,'inspection:0:0':1}
    assert first.evaluate('navigator.clipboard.readText()')==first.locator('#output').input_value()
    copied_body=first.locator('#output').input_value()
    copied_date=first.locator('#last-copied').inner_text()
    first.locator('#copy').click();first.wait_for_function("!document.querySelector('#copy').disabled")
    assert counts['일상|1']==1
    # A newer saved-only document is deliberately ignored on entry.
    logs['30000000-0000-0000-0000-000000000001']=dict(id='30000000-0000-0000-0000-000000000001',version=1,body='저장만 한 초안',state=first.evaluate('captureState()'),updated_at='2026-11-02T00:00:00Z',events=[])
    second.goto(url);second.wait_for_function("!document.querySelector('#workspace').disabled")
    assert second.locator('#output').input_value()==copied_body
    assert second.locator('#last-copied').inner_text()==copied_date
    assert second.locator('#items button[aria-pressed=true]').count()==1
    assert second.locator('#inspection-items button[aria-pressed=true]').count()==1
    assert second.locator('#misc-select-0').get_attribute('aria-pressed')=='true'
    assert second.locator('#misc-select-6').get_attribute('aria-pressed')=='true'
    assert second.locator('#inspection-start').input_value()=='2026-03-25'
    second.locator('#copy').click();second.wait_for_function("!document.querySelector('#copy').disabled")
    assert counts['일상|1']==1
    # An outdated browser cannot overwrite another visitor's new copy.
    first.locator('#output').fill(copied_body+'\n충돌 수정')
    first.locator('#copy').click();first.wait_for_function("!document.querySelector('#copy').disabled")
    assert '다른 사람이 먼저' in first.locator('#cloud-status').inner_text()
    assert first.locator('#last-copied').inner_text()==copied_date
    first.on('dialog',lambda dialog:dialog.accept())
    first.reload();first.wait_for_function("!document.querySelector('#workspace').disabled")
    assert first.locator('#output').input_value()==copied_body
    # Changes made directly in the database are reflected on the next visit.
    catalog['training'][0][2]='DB에서 수정한 위험예지훈련'
    second.reload();second.wait_for_function("!document.querySelector('#workspace').disabled")
    assert second.locator('#items button').first.inner_text()=='DB에서 수정한 위험예지훈련'
    second.set_viewport_size({'width':390,'height':844})
    assert second.evaluate('document.documentElement.scrollWidth <= innerWidth')
    # Common content with independent counters, sorting, copied state and browser preference.
    def switch(team):
        second.locator(f'[data-team="{team}"]').click()
        second.wait_for_function("!document.querySelector('#workspace').disabled")
        assert second.locator(f'[data-team="{team}"]').get_attribute('aria-pressed')=='true'
    switch('을조')
    assert second.locator('#output').input_value()==''
    assert second.locator('#items tr td:last-child').first.inner_text()=='0회'
    second.locator('#items button').nth(1).click();second.locator('#inspection-items button').nth(1).click()
    second.locator('#copy').click();second.wait_for_function("!document.querySelector('#copy').disabled")
    assert team_counts['을조']=={'일상|2':1,'inspection:0:1':1}
    assert counts=={'일상|1':1,'inspection:0:0':1}
    second.locator('#copy').click();second.wait_for_function("!document.querySelector('#copy').disabled")
    assert team_counts['을조']['일상|2']==1
    switch('갑조')
    assert second.locator('#items button[aria-pressed=true]').inner_text()=='DB에서 수정한 위험예지훈련'
    assert second.locator('#items tr td:last-child').first.inner_text()=='1회'
    switch('병조')
    assert second.locator('#output').input_value()==''
    assert second.locator('#items tr td:last-child').first.inner_text()=='0회'
    switch('을조')
    assert second.locator('#items button[aria-pressed=true]').inner_text()=='분전반 쇄정'
    second.reload();second.wait_for_function("!document.querySelector('#workspace').disabled")
    assert second.locator('[data-team="을조"]').get_attribute('aria-pressed')=='true'
    second.locator('#output').fill(second.locator('#output').input_value()+'\n을조 미복사 수정')
    switch('갑조');switch('을조')
    assert second.locator('#output').input_value().endswith('을조 미복사 수정')
    # Count editing must save immediately, stay team-scoped and keep rows stable.
    second.locator('.count-edit-toggle').first.click()
    cell=second.locator('[data-count-key="일상|1"]')
    date_before=second.locator('#last-copied').inner_text()
    order_before=second.locator('#items tr').evaluate_all('(rows)=>rows.map(row=>row.dataset.itemId)')
    cell.locator('[data-delta="1"]').click();second.wait_for_function("!document.querySelector('#workspace').disabled")
    assert cell.locator('.count-value').inner_text()=='1회'
    cell.locator('[data-delta="1"]').click();second.wait_for_function("!document.querySelector('#workspace').disabled")
    assert cell.locator('.count-value').inner_text()=='2회'
    assert second.locator('#items tr').evaluate_all('(rows)=>rows.map(row=>row.dataset.itemId)')==order_before
    assert counts['일상|1']==1
    inspection_cell=second.locator('[data-count-key="inspection:0:0"]')
    inspection_cell.locator('[data-delta="1"]').click();second.wait_for_function("!document.querySelector('#workspace').disabled")
    assert inspection_cell.locator('.count-value').inner_text()=='1회'
    inspection_cell.locator('[data-delta="-1"]').click();second.wait_for_function("!document.querySelector('#workspace').disabled")
    assert inspection_cell.locator('.count-value').inner_text()=='0회'
    assert inspection_cell.locator('[data-delta="-1"]').is_disabled()
    assert second.locator('#last-copied').inner_text()==date_before
    second.locator('.count-edit-toggle').first.click()
    assert second.locator('.adjust-count').count()==0
    assert second.locator('#items button').first.inner_text()=='DB에서 수정한 위험예지훈련'
    second.reload();second.wait_for_function("!document.querySelector('#workspace').disabled")
    assert second.locator('#items tr td:last-child').first.inner_text()=='2회'
    # If a response is lost after commit, retry the SAME action without double incrementing.
    second.locator('.count-edit-toggle').first.click()
    lost_once=[True]
    def lossy_adjust(route):
        if not lost_once[0]:return respond(route)
        lost_once[0]=False
        class LostResponse:
            request=route.request
            def fulfill(self,**kwargs):
                route.fulfill(status=500,content_type='application/json',body='{}')
        respond(LostResponse())
    second.route('**/rest/v1/rpc/adjust_usage_count',lossy_adjust)
    retry_cell=second.locator('[data-count-key="일상|3"]')
    retry_cell.locator('[data-delta="1"]').click();second.wait_for_function("!document.querySelector('#workspace').disabled")
    assert retry_cell.locator('.count-value').inner_text()=='0회'
    retry_cell.locator('[data-delta="1"]').click();second.wait_for_function("!document.querySelector('#workspace').disabled")
    assert retry_cell.locator('.count-value').inner_text()=='1회'
    assert team_counts['을조']['일상|3']==1
    second.locator('.count-edit-toggle').first.click()
    # Content editing applies to all teams without resetting counts or modifying an existing draft.
    original_body=first.locator('#output').input_value()
    original_date=first.locator('#last-copied').inner_text()
    counts_before=json.dumps(team_counts,sort_keys=True)
    first.locator('#edit-training').click();first.locator('#training-editor').wait_for(state='visible')
    first.select_option('#training-edit-item','1')
    first.locator('#training-edit-risk').fill('수정된 위험 "항목", (공통)')
    first.locator('#training-edit-rules').fill('공통 안전수칙\n작업 전 차단 확인')
    first.locator('#save-training').click()
    first.wait_for_function("document.querySelector('#training-edit-status').textContent.includes('공통으로 저장')")
    first.locator('#close-training-editor').click()
    assert first.locator('#output').input_value()==original_body
    assert first.locator('#last-copied').inner_text()==original_date
    assert first.locator('#items tr[data-item-id="1"] button').inner_text()=='수정된 위험 "항목", (공통)'
    # Existing pending snapshots keep their original anchors for later inspection/misc selection.
    first.locator('#misc-select-0').click();first.locator('#misc-select-0').click()
    assert first.locator('#output').input_value()==original_body
    assert json.dumps(team_counts,sort_keys=True)==counts_before
    # Concurrent edits must not silently overwrite the database or clear the typed input.
    first.locator('#edit-training').click();first.locator('#training-editor').wait_for(state='visible')
    first.select_option('#training-edit-item','1')
    catalog['training'][0][2]='다른 사람이 먼저 수정'
    first.locator('#training-edit-risk').fill('덮어쓰면 안 되는 입력')
    first.locator('#save-training').click()
    first.wait_for_function("document.querySelector('#training-edit-status').textContent.includes('다른 사람이')")
    assert first.locator('#training-edit-risk').input_value()=='덮어쓰면 안 되는 입력'
    assert catalog['training'][0][2]=='다른 사람이 먼저 수정'
    first.locator('#close-training-editor').click()
    first.locator('#edit-training').click();first.locator('#training-editor').wait_for(state='visible')
    first.select_option('#training-edit-item','1')
    assert first.locator('#training-edit-risk').input_value()=='다른 사람이 먼저 수정'
    first.locator('#training-edit-risk').fill('공통 최종 위험항목')
    first.locator('#save-training').click()
    first.wait_for_function("document.querySelector('#training-edit-status').textContent.includes('공통으로 저장')")
    first.locator('#close-training-editor').click()
    second.reload();second.wait_for_function("!document.querySelector('#workspace').disabled")
    for team in ['갑조','을조','병조']:
        switch(team)
        assert second.locator('#items tr[data-item-id="1"] button').inner_text()=='공통 최종 위험항목'
    second.locator('#items tr[data-item-id="1"] button').click()
    assert '공통 최종 위험항목' in second.locator('#output').input_value()
    assert '공통 안전수칙\n작업 전 차단 확인' in second.locator('#output').input_value()
    assert json.dumps(team_counts,sort_keys=True)==counts_before
    second.locator('#edit-training').click();second.locator('#training-editor').wait_for(state='visible')
    assert second.locator('#training-editor').bounding_box()['width']<=390
    second.locator('#close-training-editor').click()
    # Keep v1 database compatibility until the owner applies migration SQL.
    def legacy_api(route):
        path=route.request.url.split('.supabase.co',1)[1]
        if '/rpc/get_app_catalog' in path or '/work_log_copies?' in path or '/rpc/team_usage_counts' in path or '/rpc/latest_team_copy' in path:
            route.fulfill(status=404,content_type='application/json',body='{}')
        elif '/copy_events?' in path:
            route.fulfill(content_type='application/json',body=json.dumps([{'log_id':next(copy for copy in reversed(copy_snapshots) if copy.get('team','갑조')=='갑조')['log_id'],'copied_at':'2026-11-01T04:00:00Z'}]))
        else:respond(route)
    legacy=browser.new_page();legacy.route('https://*.supabase.co/**',legacy_api)
    legacy.goto(url);legacy.wait_for_function("!document.querySelector('#workspace').disabled")
    assert legacy.locator('#items button[aria-pressed=true]').count()==1
    assert legacy.locator('[data-team=을조]').is_disabled()
    legacy.close()
    failed=browser.new_page()
    failed.route('https://*.supabase.co/**',lambda route:route.fulfill(status=403,content_type='application/json',body='{}'))
    failed.goto(url);failed.wait_for_function("document.querySelector('#cloud-status').textContent.length > 0")
    assert failed.locator('#category').is_disabled()
    assert not errors,errors
    browser.close()
server.shutdown()
print('PASS: removed unused controls; copy-only saving/counts; recent copy date; restored selections/dates/body; duplicate prevention; conflicts; DB content editing; legacy compatibility; mobile layout. (Simulated HTTP API)')
