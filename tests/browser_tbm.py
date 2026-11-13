"""Functional HWPX download test using the real browser ZIP/XML writer, no live DB."""
from pathlib import Path
from functools import partial
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from threading import Thread
from zipfile import ZipFile, ZIP_STORED
from io import BytesIO
from lxml import etree as E
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
server=ThreadingHTTPServer(('127.0.0.1',0),partial(SimpleHTTPRequestHandler,directory=str(ROOT)))
Thread(target=server.serve_forever,daemon=True).start()
HP='http://www.hancom.co.kr/hwpml/2011/paragraph'
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
    page=browser.new_page(viewport={'width':1440,'height':1000},accept_downloads=True)
    errors=[];page.on('pageerror',lambda error:errors.append(str(error)))
    page.route('**/supabase-config.js',lambda route:route.fulfill(content_type='application/javascript',body='window.SUPABASE_CONFIG={enabled:false};'))
    page.goto(f'http://127.0.0.1:{server.server_port}/index.html')
    page.locator('#generator-tab-tbm').click()
    assert page.locator('#tbm-generator').is_visible() and not page.locator('#daily-generator').is_visible()
    page.locator('#tbm-date').fill('2026-11-14')
    page.locator('#tbm-area').fill('시험 변전소 <A&B>')
    page.locator('#tbm-leader').fill('테스트교관')
    page.locator('#tbm-railway-manager').fill('시험관리자')
    page.locator('#tbm-attendee-0').fill('시험참석자')
    page.locator('[data-result-target="tbm-fitness-0"][value="적합"]').check()
    page.locator('[data-result-target="tbm-check-0"][value="적합"]').check()
    page.locator('[data-result-target="tbm-check-1"][value="부적합"]').check()
    page.locator('#tbm-action-1').fill('조치 <완료> & 확인')
    page.locator('#tbm-risk-picker summary').click()
    page.locator('[data-risk-id="8"][type=checkbox]').check()
    page.locator('[data-risk-id="9"][type=checkbox]').check()
    page.locator('[data-risk-id="1"][type=checkbox]').click()
    assert page.locator('#tbm-risk-list input:checked').count()==2
    page.locator('#tbm-risk-picker summary').click()
    page.locator('textarea[data-risk-id="8"][data-risk-field=rules]').fill('수정 안전대책 <절연> & 보호구')
    page.select_option('#tbm-extra-education','소화설비 교육')
    assert page.locator('#tbm-cell-6 #tbm-area').input_value()=='시험 변전소 <A&B>'
    assert '수정 안전대책 <절연> & 보호구' in page.locator('#tbm-plan-risk-summary').inner_text()
    assert page.locator('#tbm-document-table td').count()==49
    assert page.evaluate("TBM_FORM_LAYOUT.cells.every(cell=>{const el=document.querySelector('#tbm-cell-'+cell.index);return el.rowSpan===cell.rowSpan&&el.colSpan===cell.colSpan;})")
    assert page.locator('#generator-tab-tbm').get_attribute('aria-pressed')=='true'
    assert page.locator('#generator-tab-daily').get_attribute('aria-pressed')=='false'
    assert page.locator('#tbm-cell-10 textarea').count()==2
    assert page.locator('#tbm-cell-11 textarea').count()==2
    page.select_option('#tbm-zoom','0.7')
    assert abs(page.locator('#tbm-paper').bounding_box()['width']-794*0.7)<2
    page.select_option('#tbm-zoom','1')
    page.screenshot(path='/tmp/tbm-generator-desktop.png',full_page=True)
    with page.expect_download() as info:page.locator('#tbm-download').click()
    download=info.value;assert download.suggested_filename=='작업 전 안전교육(TBM)(2026.11.14_야간).hwpx'
    file=Path(download.path());data=file.read_bytes()
    with ZipFile(BytesIO(data)) as z:
        assert z.testzip() is None
        assert z.infolist()[0].filename=='mimetype' and z.infolist()[0].compress_type==ZIP_STORED
        assert z.read('mimetype')==b'application/hwp+zip'
        assert 'Preview/PrvImage.png' not in z.namelist()
        for name in z.namelist():
            if name.endswith(('.xml','.hpf','.rdf')):E.fromstring(z.read(name))
        doc=E.fromstring(z.read('Contents/section0.xml'));cells=doc.findall('.//{%s}tc'%HP)
        assert len(cells)==49
        text=lambda i:''.join(cells[i].itertext())
        assert '2026. 11. 14. 토요일' in text(0)
        assert '시험 변전소 <A&B>' in text(6)
        assert '테스트교관' in text(6) and '시험참석자' in text(6)
        assert '소화설비 교육' in text(6)
        assert '수정 안전대책 <절연> & 보호구' in text(11)
        assert '☑ 적합' in text(17) and '☑ 부적합' in text(20)
        assert '조치 <완료> & 확인' in text(21)
        assert '☑' not in text(23)
        assert text(31)=='테스트교관' and text(30)=='시험관리자'
        assert text(35)=='시험참석자' and '☑ 적합' in text(45)
        for i in [3,32,40,41,42,43]:assert not text(i).strip(),f'Signature unexpectedly filled: {i}'
        metadata=E.fromstring(z.read('Contents/content.hpf'))
        assert all(not (node.text or '').strip() for node in metadata.xpath('//*[local-name()="meta"][@name="creator" or @name="lastsaveby"]'))
        with ZipFile(ROOT/'assets/tbm-template.hwpx') as original:
            assert z.read('Contents/header.xml')==original.read('Contents/header.xml')
            before=E.fromstring(original.read('Contents/section0.xml'))
            for old,new in zip(before.findall('.//{%s}tc'%HP),cells):
                for local in ['cellAddr','cellSpan','cellSz','cellMargin']:
                    assert old.find('{%s}%s'%(HP,local)).attrib==new.find('{%s}%s'%(HP,local)).attrib
        assert '시험참석자' in z.read('Preview/PrvText.txt').decode()
    # Corruption is rejected instead of producing a damaged download.
    assert page.evaluate('''async()=>{const b=await (await fetch('assets/tbm-template.hwpx')).arrayBuffer();new Uint8Array(b)[38]^=1;try{HwpxBuilder.readZip(b);return false;}catch(_){return true;}}''')
    page.set_viewport_size({'width':390,'height':844})
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
    page.screenshot(path='/tmp/tbm-generator-mobile.png',full_page=True)
    page.locator('#generator-tab-daily').click()
    assert page.locator('#daily-generator').is_visible()
    page.locator('#generator-tab-tbm').click()
    assert page.locator('#tbm-leader').input_value()=='테스트교관'
    assert not errors,errors
    browser.close()
server.shutdown()
print('PASS: generator switch, risk selection/editing, actual HWPX download, CRC/XML validity, form geometry/styles, escaping, date, names, check results, blank signatures, removed sample data, corrupt-template rejection, mobile layout')
