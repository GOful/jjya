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
    # Date and day/night presets are set when the page opens; users can still switch shifts.
    assert page.locator('#tbm-date').input_value()
    page.select_option('#tbm-shift','야간')
    assert page.locator('#tbm-education-start').input_value()=='18:10'
    assert page.locator('#tbm-education-end').input_value()=='18:30'
    assert page.locator('#tbm-start').input_value()=='18:30'
    assert page.locator('#tbm-end').input_value()=='00:20'
    page.locator('#tbm-date').fill('2026-11-14')
    assert page.locator('#tbm-cell-0').get_by_text('대구은행 변전분소').is_visible()
    assert page.locator('#tbm-leader').inner_text()=='김대일'
    assert page.locator('#tbm-attendee-0').inner_text()=='김승오'
    assert page.locator('#tbm-attendee-1').inner_text()=='김범석'
    page.locator('#tbm-worker-picker summary').click()
    page.locator('input[name="tbm-worker"][value="김대일"]').uncheck()
    page.locator('#tbm-worker-picker summary').click()
    assert page.locator('#tbm-leader').inner_text()=='김승오'
    assert page.locator('#tbm-attendee-0').inner_text()=='김범석'
    page.locator('#tbm-area-picker summary').click()
    page.locator('input[name="tbm-area"][value="죽전"]').check()
    page.locator('#tbm-area-picker summary').click()
    assert page.locator('#tbm-railway-manager').count()==0
    assert page.locator('#tbm-area-summary').inner_text()=='죽전, 대구은행 변전소'
    assert '원방 및 수동 오조작에 의한 급전' in page.locator('#tbm-plan-risk-summary').inner_text()
    assert '소화설비 교육' in page.locator('#tbm-plan-risk-summary').inner_text()
    assert page.locator('[data-result-target]').count()==0
    assert page.locator('.document-manual').count()==7
    assert page.locator('#tbm-document-table td').count()==49
    assert page.locator('#tbm-cell-5').get_attribute('colspan')=='2'
    assert page.locator('#tbm-cell-8').get_attribute('colspan')=='6'
    assert page.locator('#tbm-cell-35').get_attribute('colspan')=='2'
    assert page.evaluate("TBM_FORM_LAYOUT.cells.every(cell=>{const el=document.querySelector('#tbm-cell-'+cell.index);return el.rowSpan===cell.rowSpan&&el.colSpan===cell.colSpan;})")
    assert page.locator('#generator-tab-tbm').get_attribute('aria-pressed')=='true'
    assert page.locator('#generator-tab-daily').get_attribute('aria-pressed')=='false'
    assert page.locator('#tbm-cell-10 textarea').count()==0
    assert page.locator('#tbm-cell-11 textarea').count()==0
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
        assert '2026. 11. 14. (토) 18:10 ~ 18:30' in text(0)
        assert '※ 전체 유해‧위험요인은 위험성평가표 참고' in text(10)
        assert '죽전, 대구은행 변전소' in text(6)
        assert '김승오' in text(6) and '김범석' in text(6) and '김대일' not in text(6)
        assert '소화설비 교육' in text(6)
        assert '③ 전력계통 숙지' in text(11)
        assert all('☑' not in text(i) and '□ 적합' in text(i) for i in [17,20,23,45,46,47,48])
        assert text(31)=='김승오' and not text(30).strip()
        assert text(35)=='김범석' and '□ 적합' in text(45)
        for i in [3,32,40,41,42,43]:assert not text(i).strip(),f'Signature unexpectedly filled: {i}'
        metadata=E.fromstring(z.read('Contents/content.hpf'))
        assert all(not (node.text or '').strip() for node in metadata.xpath('//*[local-name()="meta"][@name="creator" or @name="lastsaveby"]'))
        with ZipFile(ROOT/'assets/tbm-template.hwpx') as original:
            assert z.read('Contents/header.xml')==original.read('Contents/header.xml')
            before=E.fromstring(original.read('Contents/section0.xml'))
            for old,new in zip(before.findall('.//{%s}tc'%HP),cells):
                for local in ['cellAddr','cellSpan','cellSz','cellMargin']:
                    assert old.find('{%s}%s'%(HP,local)).attrib==new.find('{%s}%s'%(HP,local)).attrib
        # Paragraph count and alignment follow the supplied HWP; every cell is
        # vertically centered for the downloadable form.
        assert len(cells[6].findall('.//{%s}p'%HP))==12
        assert len(cells[6].findall('.//{%s}lineBreak'%HP))==2
        assert all(''.join(p.itertext()).strip() for p in cells[6].findall('.//{%s}p'%HP))
        assert len(cells[10].findall('.//{%s}p'%HP))==3
        assert len(cells[11].findall('.//{%s}p'%HP))==3
        assert all(len(cells[i].findall('.//{%s}p'%HP))==1 for i in [1,2,3,25,29,33])
        assert all(''.join(p.itertext()).strip() for i in [1,2,25,29,33] for p in cells[i].findall('.//{%s}p'%HP))
        assert all(cell.find('{%s}subList'%HP).get('vertAlign')=='CENTER' for cell in cells)
        assert all(p.get('paraPrIDRef')=='33' for p in cells[6].findall('.//{%s}p'%HP))
        assert all(p.get('paraPrIDRef')=='34' for i in [10,11] for p in cells[i].findall('.//{%s}p'%HP))
        header=E.fromstring(z.read('Contents/header.xml'))
        for style_id,spacing in [('33','150'),('34','160')]:
            style=header.xpath('//*[local-name()="paraPr"][@id="%s"]'%style_id)[0]
            assert style.xpath('./*[local-name()="align"]')[0].get('horizontal')=='LEFT'
            assert all(node.get('value')==spacing for node in style.xpath('.//*[local-name()="lineSpacing"]'))
        for cell_index in [17,20,23,30,31,35,36,37,38,45,46,47,48]:
            paragraph=cells[cell_index].find('.//{%s}p'%HP)
            style=header.xpath('//*[local-name()="paraPr"][@id="%s"]'%paragraph.get('paraPrIDRef'))[0]
            assert style.xpath('./*[local-name()="align"]')[0].get('horizontal')=='CENTER'
        assert '김범석' in z.read('Preview/PrvText.txt').decode()
    # Corruption is rejected instead of producing a damaged download.
    assert page.evaluate('''async()=>{const b=await (await fetch('assets/tbm-template.hwpx')).arrayBuffer();new Uint8Array(b)[38]^=1;try{HwpxBuilder.readZip(b);return false;}catch(_){return true;}}''')
    page.set_viewport_size({'width':390,'height':844})
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
    page.screenshot(path='/tmp/tbm-generator-mobile.png',full_page=True)
    page.locator('#generator-tab-daily').click()
    assert page.locator('#daily-generator').is_visible()
    page.locator('#generator-tab-tbm').click()
    assert page.locator('#tbm-leader').inner_text()=='김승오'
    assert not errors,errors
    browser.close()
server.shutdown()
print('PASS: generator switch, automatic shift/time, ranked workers, multiple areas, fixed risks, manual checkboxes, actual HWPX download, CRC/XML validity, form geometry/styles, blank signatures, mobile layout')
