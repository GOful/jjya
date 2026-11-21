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
    assert page.locator('#tbm-folder,#tbm-folder-status').count()==0
    assert page.locator('#tbm-download').inner_text()=='안전교육일지 다운로드'
    # Date and day/night presets are set when the page opens; users can still switch shifts.
    assert page.locator('#tbm-date').input_value()
    page.select_option('#tbm-shift','야간')
    assert page.locator('#tbm-shift').evaluate("el=>el.getBoundingClientRect().width>=62")
    assert page.locator('#tbm-shift option').all_inner_texts()==['야간','주간']
    assert page.locator('#tbm-work-preset option').all_inner_texts()==['변전설비 일상점검']
    assert page.locator('#tbm-work-title').count()==0
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
    assert page.locator('.tbm-risk-editor').count()==2
    assert all(page.locator('.tbm-risk-select').nth(i).locator('option').count()==16 for i in range(2))
    assert page.locator('.tbm-risk-select').first.evaluate("el=>new Set([...el.options].map(o=>o.value)).size===el.options.length")
    risk_summaries=page.locator('.tbm-risk-editor .document-risk-picker>summary')
    assert risk_summaries.count()==2
    assert page.locator('.tbm-risk-done').all_text_contents()==['완료','완료']
    assert risk_summaries.all_inner_texts()==['원방 및 수동 오조작에 의한 급전','배전반내 공간 협소 및 돌출부로 인한 외상']
    risk_summary=risk_summaries.first
    worker_summary=page.locator('#tbm-worker-picker>summary')
    assert risk_summary.evaluate("el=>getComputedStyle(el).display")=='list-item'
    assert risk_summary.evaluate("el=>getComputedStyle(el).color")==worker_summary.evaluate("el=>getComputedStyle(el).color")
    assert risk_summary.evaluate("el=>getComputedStyle(el).borderBottomStyle")=='dotted'
    first_editor=page.locator('.tbm-risk-editor').nth(0)
    second_editor=page.locator('.tbm-risk-editor').nth(1)
    assert second_editor.locator('option[value="원방 및 수동 오조작에 의한 급전"]').is_disabled()
    assert first_editor.locator('option[value="배전반내 공간 협소 및 돌출부로 인한 외상"]').is_disabled()
    second_editor.locator('.document-risk-picker>summary').click()
    second_editor.locator('.tbm-risk-select').select_option('교육 및 훈련의 미흡')
    assert first_editor.locator('option[value="교육 및 훈련의 미흡"]').is_disabled()
    assert not first_editor.locator('option[value="배전반내 공간 협소 및 돌출부로 인한 외상"]').is_disabled()
    second_editor.locator('.tbm-activity-list input').nth(0).check()
    second_editor.locator('.tbm-activity-list input').nth(1).check()
    assert second_editor.locator('.tbm-activity-list input').evaluate_all("els=>new Set(els.map(el=>el.value)).size===els.length")
    second_editor.locator('.tbm-risk-done').click()
    assert not second_editor.locator('.document-risk-picker').evaluate('el=>el.open')
    assert risk_summaries.all_inner_texts()==['원방 및 수동 오조작에 의한 급전','교육 및 훈련의 미흡']
    assert '원방 및 수동 오조작에 의한 급전' in page.locator('#tbm-risk-editors').inner_text()
    assert '작업 전 TBM 실시, 주기적 안전교육' in page.locator('#tbm-risk-editors').inner_text()
    assert '소화설비 교육' not in page.locator('#tbm-risk-editors').inner_text()
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
    assert all(name not in page.locator('.document-work-title').inner_text() for name in ['김대일','김승오','김범석'])
    assert page.locator('#tbm-worker-picker').evaluate("el=>!!el.closest('#tbm-paper')")
    assert page.evaluate("""()=>{
      const time=document.querySelector('#tbm-work-time-row');
      const worker=document.querySelector('#tbm-worker-row');
      const area=document.querySelector('#tbm-area-row');
      return Boolean(time.compareDocumentPosition(worker)&Node.DOCUMENT_POSITION_FOLLOWING) && Boolean(worker.compareDocumentPosition(area)&Node.DOCUMENT_POSITION_FOLLOWING);
    }""")
    assert page.locator('#tbm-cell-25').inner_text().splitlines()==['확 인 자','(교육교관)']
    assert page.locator('#tbm-cell-26').inner_text().splitlines()==['작업','책임자']
    assert page.locator('#tbm-cell-33').inner_text().splitlines()==['교육참석자,','작업적합성','평가','(업무일지','참조)']
    assert all(page.locator(f'#tbm-cell-{i}').text_content().startswith(' ') for i in [10,11,16,19,22])
    web_style=page.evaluate('''()=>{
      const style=id=>getComputedStyle(document.querySelector(id));
      return {
        plan:[style('#tbm-cell-6').fontSize,style('#tbm-cell-6').lineHeight,style('#tbm-cell-6').paddingTop],
        risk:[style('#tbm-cell-10').fontSize,style('#tbm-cell-10').lineHeight],
        instructor:style('#tbm-cell-25').fontSize,
        attendance:style('#tbm-cell-33').fontSize,
        signature:style('#tbm-cell-27').fontSize,
        riskRow:document.querySelector('#tbm-cell-10').closest('tr').style.height
      };
    }''')
    assert all(abs(float(value.removesuffix('px'))-expected)<.02 for value,expected in zip(web_style['plan'],[14.6667,22,7.559]))
    assert all(abs(float(value.removesuffix('px'))-expected)<.02 for value,expected in zip(web_style['risk'],[14.6667,22]))
    assert abs(float(web_style['instructor'].removesuffix('px'))-14.6667)<.02
    assert abs(float(web_style['attendance'].removesuffix('px'))-13.3333)<.02
    assert abs(float(web_style['signature'].removesuffix('px'))-16)<.02
    assert abs(float(web_style['riskRow'].removesuffix('px'))-(7917-566)/75)<.02
    assert abs(float(page.locator('#tbm-cell-0 .document-line').first.evaluate("el=>getComputedStyle(el).fontSize").removesuffix('px'))-14.6667)<.02
    assert abs(float(page.locator('#tbm-weekday').evaluate("el=>getComputedStyle(el).fontSize").removesuffix('px'))-14.6667)<.02
    assert all(page.locator(f'#tbm-cell-{i}').evaluate("el=>getComputedStyle(el).textAlign")=='center' for i in [30,31,35,36,37,38])
    method_label=page.locator('.document-methods>span')
    assert method_label.inner_text()=='- 작업방법:'
    assert method_label.evaluate("el=>getComputedStyle(el).whiteSpace")=='nowrap'
    assert page.locator('input[name="tbm-method"],#tbm-extra-methods,.document-methods details').count()==0
    assert page.locator('#tbm-order').count()==0
    assert page.locator('#tbm-cell-6').get_by_text('AC반 → DC반 → 기타(RTU 및 충전기반)',exact=True).is_visible()
    assert page.locator('.document-fixed-methods>div').all_inner_texts()==[
        'ㅇ 배전반내 각종 케이블 외관 상태 점검',
        'ㅇ 변압기 소음 및 온도 이상유무 확인',
        'ㅇ 원격소장치 표시등 점등상태 및 통신상태 점검'
    ]
    assert page.locator('#tbm-zoom').count()==0
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
        assert '김대일' not in text(6) and '김승오, 김범석' in text(6)
        assert '교육 및 훈련의 미흡' in text(6) and '소화설비 교육' not in text(6)
        assert '② 작업 전 TBM 실시, 주기적 안전교육' in text(11)
        assert all('☑' not in text(i) and '□ 적합' in text(i) for i in [17,20,23,45,46,47,48])
        assert all(not text(i).startswith((' ','　')) for i in [16,19,22])
        assert all(not text(i).startswith((' ','　')) for i in [17,18,20,21,23,24])
        assert text(31)=='김승오' and not text(30).strip()
        assert text(35)=='김범석' and '□ 적합' in text(45)
        for i in [3,32,40,41,42,43]:assert not text(i).strip(),f'Signature unexpectedly filled: {i}'
        metadata=E.fromstring(z.read('Contents/content.hpf'))
        assert all(not (node.text or '').strip() for node in metadata.xpath('//*[local-name()="meta"][@name="creator" or @name="lastsaveby"]'))
        with ZipFile(ROOT/'assets/tbm-template.hwpx') as original:
            before=E.fromstring(original.read('Contents/section0.xml'))
            for index,(old,new) in enumerate(zip(before.findall('.//{%s}tc'%HP),cells)):
                for local in ['cellAddr','cellSpan','cellSz','cellMargin']:
                    expected=dict(old.find('{%s}%s'%(HP,local)).attrib)
                    if local=='cellMargin' and index==6:expected={side:'567' for side in ['left','right','top','bottom']}
                    if local=='cellMargin' and index in [10,11,16,19,22]:expected={'left':'378','right':'378','top':'227','bottom':'227'}
                    if local=='cellSz' and index in [10,11]:expected['height']=str(int(expected['height'])-566)
                    assert expected==new.find('{%s}%s'%(HP,local)).attrib
            old_size=before.find('.//{%s}tbl/{%s}sz'%(HP,HP))
            new_size=doc.find('.//{%s}tbl/{%s}sz'%(HP,HP))
            assert int(old_size.get('height'))-int(new_size.get('height'))==566
        # Paragraph count and alignment follow the supplied HWP; every cell is
        # vertically centered for the downloadable form.
        plan_paragraphs=cells[6].findall('.//{%s}p'%HP)
        assert len(plan_paragraphs)==14
        plan_texts=[''.join(p.itertext()) for p in plan_paragraphs]
        assert all(name not in plan_texts[0] for name in ['김대일','김승오','김범석'])
        assert plan_texts[1]=='  - 작업일시: 18:30 ~ 00:20'
        assert plan_texts[2]=='  - 작업자: 김승오, 김범석'
        assert plan_texts[3]=='  - 작업구간: 죽전, 대구은행 변전소'
        assert plan_texts[5:8]==[
            '  - 작업방법:  ㅇ 배전반내 각종 케이블 외관 상태 점검',
            '               ㅇ 변압기 소음 및 온도 이상유무 확인',
            '               ㅇ 원격소장치 표시등 점등상태 및 통신상태 점검'
        ]
        assert plan_texts[10:14]==[
            'ㅇ 원방 및 수동 오조작에 의한 급전',
            '- 전기안전수칙 준수, 전력계통 숙지',
            'ㅇ 교육 및 훈련의 미흡',
            '- 작업 전 TBM 실시, 주기적 안전교육'
        ]
        assert cells[6].get('hasMargin')=='1'
        assert cells[6].find('{%s}cellMargin'%HP).attrib=={side:'567' for side in ['left','right','top','bottom']}
        assert len(cells[6].findall('.//{%s}lineBreak'%HP))==0
        assert all(''.join(p.itertext()).strip() for p in plan_paragraphs)
        assert len(cells[10].findall('.//{%s}p'%HP))==3
        assert len(cells[11].findall('.//{%s}p'%HP))==2
        assert all(len(cells[i].findall('.//{%s}p'%HP))==1 for i in [1,2,3,25,29,33])
        assert all(''.join(p.itertext()).strip() for i in [1,2,25,29,33] for p in cells[i].findall('.//{%s}p'%HP))
        assert all(cell.find('{%s}subList'%HP).get('vertAlign')=='CENTER' for cell in cells)
        header=E.fromstring(z.read('Contents/header.xml'))
        for style_id,spacing in [('22','120'),('33','120'),('34','120')]:
            style=header.xpath('//*[local-name()="paraPr"][@id="%s"]'%style_id)[0]
            if style_id!='22':assert style.xpath('./*[local-name()="align"]')[0].get('horizontal')=='LEFT'
            assert all(node.get('value')==spacing for node in style.xpath('.//*[local-name()="lineSpacing"]'))
        for index,lines,height in [(25,['확 인 자','(교육교관)'],'1100'),(33,['교육참석자,','작업적합성','평가','(업무일지','참조)'],'1000')]:
            run=cells[index].find('.//{%s}run'%HP)
            assert list(run.itertext())==lines
            char=header.xpath('//*[local-name()="charPr"][@id="%s"]'%run.get('charPrIDRef'))[0]
            assert char.get('height')==height
            paragraph=cells[index].find('.//{%s}p'%HP)
            style=header.xpath('//*[local-name()="paraPr"][@id="%s"]'%paragraph.get('paraPrIDRef'))[0]
            assert style.get('snapToGrid')=='0'
            assert all(n.get('value')=='100' for n in style.xpath('.//*[local-name()="lineSpacing"]'))
            # Explicit lines fit both the column width and the existing row height.
        responsibility=cells[26].findall('.//{%s}p'%HP)
        assert [''.join(p.itertext()) for p in responsibility]==['작업','책임자']
        for paragraph in responsibility:
            run=paragraph.find('{%s}run'%HP);char=header.xpath('//*[local-name()="charPr"][@id="%s"]'%run.get('charPrIDRef'))[0]
            assert char.get('height')=='1100'
        for index in [8,9,10,11]:
            paragraph=cells[index].find('.//{%s}p'%HP)
            run=paragraph.find('{%s}run'%HP)
            char=header.xpath('//*[local-name()="charPr"][@id="%s"]'%run.get('charPrIDRef'))[0]
            style=header.xpath('//*[local-name()="paraPr"][@id="%s"]'%paragraph.get('paraPrIDRef'))[0]
            assert char.get('height')=='1100'
            ratio=char.xpath('./*[local-name()="ratio"]')[0]
            spacing=char.xpath('./*[local-name()="spacing"]')[0]
            expected_ratio,expected_spacing=('90','-2') if index in [10,11] else ('95','0')
            assert all(value==expected_ratio for value in ratio.attrib.values())
            assert all(value==expected_spacing for value in spacing.attrib.values())
            assert all(n.get('value')=='150' for n in style.xpath('.//*[local-name()="lineSpacing"]'))
        for paragraph in cells[6].findall('.//{%s}p'%HP):
            run=paragraph.find('{%s}run'%HP)
            char=header.xpath('//*[local-name()="charPr"][@id="%s"]'%run.get('charPrIDRef'))[0]
            style=header.xpath('//*[local-name()="paraPr"][@id="%s"]'%paragraph.get('paraPrIDRef'))[0]
            assert char.get('height')=='1100'
            assert all(n.get('value')=='150' for n in style.xpath('.//*[local-name()="lineSpacing"]'))
        for index in [27,28]:
            run=cells[index].find('.//{%s}run'%HP)
            char=header.xpath('//*[local-name()="charPr"][@id="%s"]'%run.get('charPrIDRef'))[0]
            assert char.get('height')=='1200'
        assert all(not ''.join(p.itertext()).startswith((' ','　')) for i in [10,11] for p in cells[i].findall('.//{%s}p'%HP))
        def paragraph_left(paragraph):
            style=header.xpath('//*[local-name()="paraPr"][@id="%s"]'%paragraph.get('paraPrIDRef'))[0]
            return {node.get('value') for node in style.xpath('.//*[local-name()="margin"]/*[local-name()="left"]')}
        assert all(paragraph_left(plan_paragraphs[i])=={'1700'} for i in [10,12])
        assert all(paragraph_left(plan_paragraphs[i])=={'3000'} for i in [11,13])
        assert all(paragraph_left(cells[i].find('.//{%s}p'%HP))=={'300'} for i in [10,11,16,19,22])
        assert all(cells[i].get('hasMargin')=='1' for i in [6,10,11,16,19,22])
        assert all(style.get('textColor')=='#000000' for style in header.xpath('//*[local-name()="charPr"]'))
        for style_id,height in [('9','1200'),('15','1000'),('17','1000')]:
            assert header.xpath('//*[local-name()="charPr"][@id="%s"]'%style_id)[0].get('height')==height
        assert doc.xpath('//*[local-name()="tbl"]')[0].get('pageBreak')=='NONE'
        # Keep the fixed table, its margins and dimensions inside the printable A4 area.
        table=doc.xpath('//*[local-name()="tbl"]')[0]
        page_pr=doc.xpath('//*[local-name()="pagePr"]')[0]
        margin=page_pr[0]
        table_height=int(table.find('{%s}sz'%HP).get('height'))
        assert table_height < int(page_pr.get('height'))-sum(int(margin.get(k)) for k in ['top','bottom','header','footer'])
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
print('PASS: generator switch, automatic shift/time, ranked workers, multiple areas, selectable deduplicated risks, manual checkboxes, actual HWPX download, CRC/XML validity, form geometry/styles, blank signatures, mobile layout')
