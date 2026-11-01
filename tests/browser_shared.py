"""Browser integration against a simulated Supabase HTTP API; no live credentials.
Run: python tests/browser_shared.py (requires playwright and Chromium).
"""
import json
import threading
import uuid
from functools import partial
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
seed = (ROOT / 'tests/fixtures/legacy-seed.sql').read_text().split('$catalog$')[1]
catalog = json.loads(seed)
logs, counts = {}, {}
copy_snapshots = []
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
    elif path.startswith('/rest/v1/rpc/shared_usage_counts'):
        result = counts
    elif path.startswith('/rest/v1/work_logs'):
        if '&id=eq.' in path:
            result = [logs[path.split('&id=eq.')[1]]]
        else:
            result = [dict(id=log['id'],version=log['version'],updated_at=log['updated_at']) for log in reversed(list(logs.values()))]
    elif path.startswith('/rest/v1/rpc/save_work_log'):
        identifier = body['p_id']
        existing = logs.get(identifier)
        if body['p_expected_version'] != (existing['version'] if existing else 0):
            status, result = 409, {'message':'VERSION_CONFLICT'}
        else:
            events = set(existing.get('events',[]) if existing else [])
            for key in body['p_keys'] or []:
                if key not in events:
                    counts[key] = counts.get(key,0)+1
                    events.add(key)
            logs[identifier] = dict(id=identifier,body=body['p_body'],state=body['p_state'],version=body['p_expected_version']+1,updated_at='2026-11-01T04:00:00Z',events=list(events))
            if body['p_keys'] is not None:
                copy_snapshots.append(dict(log_id=identifier,log_version=logs[identifier]['version'],body=body['p_body'],state=body['p_state'],copied_at='2026-11-01T04:00:00Z'))
            result = dict(version=logs[identifier]['version'],updated_at=logs[identifier]['updated_at'],counts=counts)
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
    first.locator('#items button').first.click()
    first.locator('#inspection-items button').first.click()
    first.locator('#inspection-start').fill('2026-03-25');first.locator('#inspection-end').fill('2026-10-15')
    first.locator('#output-heading').click();first.locator('#misc-select-0').click()
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
    # Keep v1 database compatibility until the owner applies migration SQL.
    def legacy_api(route):
        path=route.request.url.split('.supabase.co',1)[1]
        if '/rpc/get_app_catalog' in path or '/work_log_copies?' in path:
            route.fulfill(status=404,content_type='application/json',body='{}')
        elif '/copy_events?' in path:
            route.fulfill(content_type='application/json',body=json.dumps([{'log_id':copy_snapshots[-1]['log_id'],'copied_at':'2026-11-01T04:00:00Z'}]))
        else:respond(route)
    legacy=browser.new_page();legacy.route('https://*.supabase.co/**',legacy_api)
    legacy.goto(url);legacy.wait_for_function("!document.querySelector('#workspace').disabled")
    assert legacy.locator('#items button[aria-pressed=true]').count()==1
    legacy.close()
    failed=browser.new_page()
    failed.route('https://*.supabase.co/**',lambda route:route.fulfill(status=403,content_type='application/json',body='{}'))
    failed.goto(url);failed.wait_for_function("document.querySelector('#cloud-status').textContent.length > 0")
    assert failed.locator('#category').is_disabled()
    assert not errors,errors
    browser.close()
server.shutdown()
print('PASS: removed unused controls; copy-only saving/counts; recent copy date; restored selections/dates/body; duplicate prevention; conflicts; DB content editing; legacy compatibility; mobile layout. (Simulated HTTP API)')
