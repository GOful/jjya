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
    first_context = browser.new_context(permissions=['clipboard-read','clipboard-write'])
    second_context = browser.new_context(permissions=['clipboard-read','clipboard-write'])
    pages = [first_context.new_page(),second_context.new_page()]
    errors = []
    for page in pages:
        page.route('**/supabase-config.js', lambda route: route.fulfill(content_type='application/javascript', body=(ROOT/'supabase-config.js').read_text().replace('enabled: false','enabled: true')))
        page.route('https://*.supabase.co/**', respond)
        page.on('pageerror', lambda error: errors.append(str(error)))
    first, second = pages
    url = f'http://127.0.0.1:{server.server_port}/index.html'
    first.goto(url); first.wait_for_function("!document.querySelector('#workspace').disabled")
    assert first.locator('#login-form').count() == 0
    first.locator('#items button').first.click()
    first.locator('#inspection-items button').first.click()
    first.locator('#inspection-start').fill('2026-03-25');first.locator('#inspection-end').fill('2026-10-15')
    first.locator('#output-heading').click()
    first.locator('#misc-select-0').click()
    first.locator('#output').fill(first.locator('#output').input_value()+'\n공유 메모')
    first.locator('#save-log').click()
    first.wait_for_function("document.querySelector('#cloud-status').textContent.includes('공유 저장 ·')")
    assert counts == {}, 'Save must not increment copy counts'
    second.goto(url);second.wait_for_function("!document.querySelector('#workspace').disabled")
    assert second.locator('#output').input_value().endswith('공유 메모')
    assert second.locator('#inspection-start').input_value() == '2026-03-25'
    # Two independent visitors restore one log; event keys ensure deduplication.
    second.locator('#copy').click();second.wait_for_function("!document.querySelector('#copy').disabled")
    assert counts == {'일상|1':1,'inspection:0:0':1}
    second.locator('#copy').click();second.wait_for_function("!document.querySelector('#copy').disabled")
    assert counts['일상|1'] == 1
    # A newer saved-only draft must not replace the last copied log on entry.
    second.locator('#items button').nth(1).click()
    second.locator('#output').fill(second.locator('#output').input_value()+'\n미복사 초안')
    second.locator('#save-log').click();second.wait_for_function("!document.querySelector('#workspace').disabled")
    third=browser.new_page()
    third.route('https://*.supabase.co/**',respond)
    third.goto(url);third.wait_for_function("!document.querySelector('#workspace').disabled")
    assert third.locator('#output').input_value().endswith('공유 메모')
    assert third.locator('#items button[aria-pressed=true]').inner_text()=='단자대 볼트 조임시 돌출부에 의한 긁힘'
    assert third.locator('#inspection-items button[aria-pressed=true]').count()==1
    assert third.locator('#misc-select-0').get_attribute('aria-pressed')=='true'
    assert third.locator('#inspection-start').input_value()=='2026-03-25'
    third.close()
    # First visitor has an outdated version and cannot overwrite the other visitor.
    first.locator('#output').fill(first.locator('#output').input_value()+'\n충돌 수정')
    first.locator('#save-log').click()
    first.wait_for_function("document.querySelector('#cloud-status').textContent.includes('다른 사람이 먼저 저장')")
    assert not next(iter(logs.values()))['body'].endswith('충돌 수정')
    first.on('dialog',lambda dialog:dialog.accept())
    first.locator('#load-log').click()
    first.wait_for_function("!document.querySelector('#workspace').disabled")
    first.locator('#copy').click();first.wait_for_function("!document.querySelector('#copy').disabled")
    assert counts['일상|1'] == 1
    first.locator('#edit-catalog').click();first.locator('#catalog-dialog').wait_for(state='visible')
    first.locator('#catalog-content').fill('공유 수정된 위험예지훈련')
    first.locator('#save-catalog').click()
    first.wait_for_function("document.querySelector('#catalog-status').textContent.includes('저장됨')")
    first.locator('#close-catalog').click()
    second.on('dialog',lambda dialog:dialog.accept())
    second.reload();second.wait_for_function("!document.querySelector('#workspace').disabled")
    assert second.locator('#items button').first.inner_text() == '공유 수정된 위험예지훈련'
    assert counts['일상|1'] == 1
    second.set_viewport_size({'width':390,'height':844})
    assert second.evaluate('document.documentElement.scrollWidth <= innerWidth')
    # Saving edits to the same log cannot mutate its most recent copy snapshot.
    copied_body=second.locator('#output').input_value()
    second.locator('#output').fill(copied_body+'\n복사 후 수정한 초안')
    second.locator('#save-log').click();second.wait_for_function("!document.querySelector('#workspace').disabled")
    second.reload();second.wait_for_function("!document.querySelector('#workspace').disabled")
    assert second.locator('#output').input_value()==copied_body
    # Before SQL migration, the published client remains compatible with v1.
    def legacy_api(route):
        path=route.request.url.split('.supabase.co',1)[1]
        if '/rpc/get_app_catalog' in path or '/work_log_copies?' in path:
            route.fulfill(status=404,content_type='application/json',body='{}')
        elif '/copy_events?' in path:
            route.fulfill(content_type='application/json',body=json.dumps([{'log_id':copy_snapshots[-1]['log_id'],'copied_at':'2026-11-01T04:00:00Z'}]))
        else:
            respond(route)
    legacy=browser.new_page();legacy.route('https://*.supabase.co/**',legacy_api)
    legacy.goto(url);legacy.wait_for_function("!document.querySelector('#workspace').disabled")
    assert legacy.locator('#items button[aria-pressed=true]').count()==1
    legacy.close()
    # A setup/network failure must not silently fall back to private local counts.
    failed = browser.new_page()
    failed.route('**/supabase-config.js', lambda route: route.fulfill(content_type='application/javascript', body=(ROOT/'supabase-config.js').read_text().replace('enabled: false','enabled: true')))
    failed.route('https://*.supabase.co/**', lambda route: route.fulfill(status=403, content_type='application/json', body='{}'))
    failed.goto(url)
    failed.wait_for_function("document.querySelector('#cloud-status').textContent.length > 0")
    assert failed.locator('#workspace').evaluate('(el) => el.disabled')
    assert failed.locator('#category').is_disabled()
    assert not errors, errors
    browser.close()
server.shutdown()
print('PASS: anonymous entry; two visitors; shared content/dates/counts; save/copy separation; duplicate prevention; version conflicts; catalog edits; mobile layout. (Simulated HTTP API)')
