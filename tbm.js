(() => {
  'use strict';
  const panel=document.querySelector('#tbm-generator');
  panel.innerHTML=`<form id="tbm-form"><fieldset id="tbm-controls" class="workspace">
    <div class="document-toolbar"><label>보기 <select id="tbm-zoom" aria-label="문서 확대 비율"><option value="1">100%</option><option value="0.85">85%</option><option value="0.7">70%</option><option value="0.55">55%</option></select></label><button type="submit" id="tbm-download">HWPX 다운로드</button><span id="tbm-status" role="status" aria-live="polite"></span></div>
    <div class="tbm-document-viewport"><div id="tbm-paper-stage"><article id="tbm-paper" class="tbm-paper" aria-label="작업 전 안전교육 원본 양식 편집"><h2 id="tbm-paper-title"></h2><table id="tbm-document-table" class="tbm-document-table"></table><div id="tbm-legal"></div></article></div></div>
  </fieldset></form>`;
  const $=id=>document.getElementById(id),text=id=>$(id).value.trim();
  const layout=window.TBM_FORM_LAYOUT;
  const table=$('tbm-document-table'),colgroup=document.createElement('colgroup');
  layout.columns.forEach(width=>{const col=document.createElement('col');col.style.width=`${width}%`;colgroup.append(col);});table.append(colgroup);
  const body=document.createElement('tbody');table.append(body);
  for(let row=0;row<16;row++){
    const tr=document.createElement('tr');
    const source=layout.cells.filter(cell=>cell.row===row);
    const rowHeight=Math.max(0,...source.filter(cell=>cell.rowSpan===1).map(cell=>cell.height/75));
    tr.style.height=`${rowHeight}px`;
    source.forEach(cell=>{
      const td=document.createElement('td');td.id=`tbm-cell-${cell.index}`;td.dataset.sourceCell=cell.index;td.rowSpan=cell.rowSpan;td.colSpan=cell.colSpan;
      td.style.backgroundColor=cell.background;td.textContent=cell.text;
      if(cell.index<=4)td.classList.add('document-top-cell');
      if([1,2,3].includes(cell.index))td.classList.add('document-approval');
      if([5,7,8,9,12,13,14,15,25,26,27,28,29,33,34,39,44].includes(cell.index))td.classList.add('document-label');
      if(cell.index===4)td.classList.add('document-spacer');
      tr.append(td);
    });body.append(tr);
  }
  $('tbm-paper-title').textContent=layout.title;
  layout.footer.forEach(line=>{const p=document.createElement('p');p.textContent=line;$('tbm-legal').append(p);});
  const put=(index,html)=>{$(`tbm-cell-${index}`).innerHTML=html;};
  put(0,`<div class="document-line">□ 소　　속 : <input id="tbm-department" aria-label="소속" value="대구은행변전분소" required maxlength="40"></div><div class="document-line">□ 교육일시 : <input id="tbm-date" aria-label="교육일자" type="date" required><span id="tbm-weekday"></span></div><div class="document-line">□ 교육장소 : <input id="tbm-location" aria-label="교육장소" value="분소사무실" required maxlength="40"></div>`);
  put(6,`<div class="document-work-title">(<select id="tbm-shift" aria-label="근무"><option>야간</option><option>주간</option></select>) <select id="tbm-work-preset" aria-label="작업 종류"><option>변전설비 일상점검</option><option>MCC설비 점검</option><option>수전선로 점검</option><option>직접 입력</option></select><input id="tbm-work-title" aria-label="작업명" value="변전설비 일상점검" required maxlength="60" hidden><span id="tbm-plan-people"></span></div>
  <div class="document-line">- 작업일시: <input id="tbm-start" aria-label="작업 시작" type="time" value="18:00" required> ~ <input id="tbm-end" aria-label="작업 종료" type="time" value="00:20" required></div>
  <label class="document-line">- 작업구간: <input id="tbm-area" aria-label="작업구간" placeholder="작업구간 입력" required maxlength="60"></label>
  <label class="document-line">- 작업순서: <input id="tbm-order" aria-label="작업순서" value="AC반 → DC반 → 기타(RTU 및 충전기반)" required maxlength="120"></label>
  <div class="document-methods"><span>- 작업방법:</span><div>
  <label><input type="checkbox" name="tbm-method" value="계전기 및 원격소장치 LED 점등상태 육안 점검" checked> 계전기 및 원격소장치 LED 점등상태 육안 점검</label>
  <label><input type="checkbox" name="tbm-method" value="소공간소화장치 상태 이상 유무 확인" checked> 소공간소화장치 상태 이상 유무 확인</label>
  <label><input type="checkbox" name="tbm-method" value="각종 지시계기 동작상태 확인" checked> 각종 지시계기 동작상태 확인</label>
  <details><summary>작업방법 추가</summary><textarea id="tbm-extra-methods" aria-label="추가 작업방법" rows="1" maxlength="300" placeholder="한 줄에 한 항목"></textarea></details>
  </div></div>
  <label class="document-line">- 작업원별 임무 및 작업장 이동방법: <input id="tbm-duties" aria-label="작업원별 임무 및 이동방법" value="육안 점검 실시, 열차를 통한 이동" required maxlength="100"></label>
  <div>- 위험요인 안전조치 및 교육:</div><div id="tbm-plan-risk-summary"></div>
  <div class="document-education">ㅇ <select id="tbm-extra-education" aria-label="추가 교육"><option value="">추가 교육 없음</option><option>소화설비 교육</option><option>전기안전수칙 교육</option><option>비상대응 및 연락체계 교육</option></select><input id="tbm-custom-education" aria-label="기타 교육 내용" placeholder="기타 교육 내용" maxlength="100"></div>`);
  put(8,`<span>유해·위험요인</span><details id="tbm-risk-picker" class="document-risk-picker"><summary>항목 선택</summary><div class="document-risk-menu"><label>분류 <select id="tbm-risk-category"><option>전체</option><option>일상</option><option>MCC</option><option>3개월</option><option>6개월</option><option>1년</option><option>수전선로</option></select></label><div id="tbm-risk-list"></div></div></details>`);
  put(10,'<div id="tbm-selected-risks"></div>');put(11,'<div id="tbm-selected-rules"></div>');
  const checks=['안전보호구 착용 상태','위험요인 안전조치 확인','작업통제 방법 및 준수 여부 확인'];
  function outcome(target,label){
    const wrap=document.createElement('span');wrap.className='document-outcome';
    const value=document.createElement('input');value.type='hidden';value.id=target;value.value='미확인';wrap.append(value);
    for(const result of ['적합','부적합']){
      const item=document.createElement('label'),input=document.createElement('input');input.type='checkbox';input.value=result;input.dataset.resultTarget=target;input.setAttribute('aria-label',`${label} ${result}`);
      input.addEventListener('change',()=>{wrap.querySelectorAll('input[type=checkbox]').forEach(other=>{if(other!==input)other.checked=false;});value.value=input.checked?result:'미확인';preview();});
      item.append(input,' '+result);wrap.append(item);
    }return wrap;
  }
  checks.forEach((label,i)=>{
    $(`tbm-cell-${[17,20,23][i]}`).replaceChildren(outcome(`tbm-check-${i}`,label));
    put([18,21,24][i],`<input id="tbm-action-${i}" aria-label="${label} 조치사항" maxlength="40">`);
  });
  put(31,'<input id="tbm-leader" aria-label="작업책임자 교육교관" placeholder="성명" required maxlength="20" autocomplete="off">');
  put(30,'<input id="tbm-railway-manager" aria-label="철도운행 안전관리자" placeholder="성명" maxlength="20" autocomplete="off">');
  for(let i=0;i<4;i++){
    put(35+i,`<input id="tbm-attendee-${i}" aria-label="참석자 ${i+1}" maxlength="20" autocomplete="off">`);
    $(`tbm-cell-${45+i}`).replaceChildren(outcome(`tbm-fitness-${i}`,`참석자 ${i+1} 작업적합성`));
  }
  $('tbm-date').value=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  $('tbm-work-preset').addEventListener('change',()=>{const custom=text('tbm-work-preset')==='직접 입력';$('tbm-work-title').hidden=!custom;if(!custom)$('tbm-work-title').value=text('tbm-work-preset');preview();});
  let catalog=[],selected=new Map(),templatePromise=null,downloading=false;
  function renderRisks(){
    const group=text('tbm-risk-category'),list=$('tbm-risk-list');list.replaceChildren();
    catalog.filter(item=>group==='전체'||item.category.split(',').includes(group)).forEach(item=>{
      const label=document.createElement('label');label.className='tbm-risk-option';
      const input=document.createElement('input');input.type='checkbox';input.dataset.riskId=item.id;input.checked=selected.has(item.id);
      const name=document.createElement('span');name.textContent=item.risk;
      input.addEventListener('change',()=>{
        if(input.checked&&selected.size>=2){input.checked=false;$('tbm-status').textContent='위험요인은 최대 2개까지 선택할 수 있습니다.';return;}
        input.checked?selected.set(item.id,{...item}):selected.delete(item.id);renderRisks();renderSelected();preview();
      });label.append(input,name);list.append(label);
    });
  }
  function renderSelected(){
    const risks=$('tbm-selected-risks'),rules=$('tbm-selected-rules');risks.replaceChildren();rules.replaceChildren();
    [...selected].forEach(([id,item],index)=>{
      for(const [key,target] of [['risk',risks],['rules',rules]]){
        const row=document.createElement('div');row.className='document-risk-row';
        const number=document.createElement('span');number.textContent=['①','②'][index];
        const field=document.createElement('textarea');field.value=item[key];field.maxLength=300;field.rows=2;field.required=true;field.dataset.riskField=key;field.dataset.riskId=id;field.setAttribute('aria-label',`${index+1}번 ${key==='risk'?'위험요인':'안전대책'}`);
        field.addEventListener('input',()=>{item[key]=field.value;preview();});row.append(number,field);
        if(key==='risk'){
          const remove=document.createElement('button');remove.type='button';remove.className='document-remove';remove.textContent='×';remove.setAttribute('aria-label',`위험요인 ${index+1} 해제`);
          remove.addEventListener('click',()=>{selected.delete(id);renderRisks();renderSelected();preview();});row.append(remove);
        }target.append(row);
      }
    });
  }
  function refreshCatalog(){
    catalog=window.getTbmRiskCatalog?.()||[];renderRisks();
  }
  document.addEventListener('jjya:catalog-updated',refreshCatalog);$('tbm-risk-category').addEventListener('change',renderRisks);
  function values(){
    const date=text('tbm-date'),parsed=date?new Date(`${date}T12:00:00+09:00`):null;
    const educationDate=parsed?`${date.replaceAll('-','. ')}. ${new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',weekday:'long'}).format(parsed)}`:'';
    const people=Array.from({length:4},(_,i)=>({name:text(`tbm-attendee-${i}`),fitness:text(`tbm-fitness-${i}`)}));
    const leader=text('tbm-leader'),names=[leader,...people.map(person=>person.name)].filter(Boolean).join(', ');
    const risks=[...selected.values()].map(item=>({risk:item.risk.trim(),rules:item.rules.trim()}));
    const methods=[...document.querySelectorAll('input[name="tbm-method"]:checked')].map(input=>input.value).concat(text('tbm-extra-methods').split('\n').map(line=>line.trim()).filter(Boolean));
    const education=[text('tbm-extra-education'),text('tbm-custom-education')].filter(Boolean);
    const planLines=[`(${text('tbm-shift')}) ${text('tbm-work-title')}${names?`(${names})`:''}`,
      `  - 작업일시: ${text('tbm-start')} ~ ${text('tbm-end')}`,
      `  - 작업구간: ${text('tbm-area')}`,
      `  - 작업순서: ${text('tbm-order')}`,
      `  - 작업방법: ${methods.map(line=>'ㅇ '+line).join('\n')}`,
      `  - 작업원별 임무 및 작업장 이동방법: ${text('tbm-duties')}`,
      `  - 위험요인 안전조치 및 교육:\n${risks.map(item=>`ㅇ ${item.risk}\n   - ${item.rules}`).concat(education.map(line=>'ㅇ '+line)).join('\n')}`];
    const data={department:text('tbm-department'),educationDate,date,location:text('tbm-location'),shift:text('tbm-shift'),leader,railwayManager:text('tbm-railway-manager'),attendees:people,risks,methods,planLines,checks:checks.map((label,i)=>({label,result:text(`tbm-check-${i}`),action:text(`tbm-action-${i}`)}))};
    data.previewText=['작업 전 안전교육(TBM) 일지',`소속: ${data.department}`,`교육일시: ${educationDate}`,`교육장소: ${data.location}`,'[작업 계획]',...planLines,'[위험성평가 결과]',...risks.map(item=>`${item.risk}\n안전대책: ${item.rules}`),'[확인사항]',...data.checks.map(check=>`${check.label}: ${check.result}${check.action?' / '+check.action:''}`),`작업책임자: ${leader}`,`철도운행 안전관리자: ${data.railwayManager}`,'[교육참석자]',...people.filter(person=>person.name).map(person=>`${person.name}: ${person.fitness}`)].join('\r\n');
    return data;
  }
  function preview(){
    const data=values();
    const names=[data.leader,...data.attendees.map(person=>person.name)].filter(Boolean);
    $('tbm-plan-people').textContent=names.length?'('+names.join(', ')+')':'';
    $('tbm-weekday').textContent=data.educationDate?data.educationDate.split(' ').at(-1):'';
    $('tbm-plan-risk-summary').textContent=data.risks.map(risk=>`ㅇ ${risk.risk}\n   - ${risk.rules}`).join('\n');
  }
  $('tbm-form').addEventListener('input',preview);
  $('tbm-form').addEventListener('change',preview);
  function resizePaper(){const scale=Number(text('tbm-zoom'));$('tbm-paper').style.zoom=scale;$('tbm-paper-stage').style.width=`${794*scale}px`;$('tbm-paper-stage').style.height=`${$('tbm-paper').offsetHeight*scale}px`;}
  $('tbm-zoom').addEventListener('change',resizePaper);
  new ResizeObserver(resizePaper).observe($('tbm-paper'));
  $('tbm-form').addEventListener('submit',async event=>{
    event.preventDefault();if(downloading)return;
    const data=values();
    if(data.risks.length<1){$('tbm-status').textContent='위험요인을 1개 이상 선택하세요.';return;}
    if(!data.methods.length){$('tbm-status').textContent='작업방법을 1개 이상 선택하거나 입력하세요.';return;}
    downloading=true;$('tbm-controls').disabled=true;$('tbm-download').disabled=true;$('tbm-status').textContent='HWPX 생성 중…';
    try{
      if(!templatePromise)templatePromise=fetch('assets/tbm-template.hwpx').then(response=>{if(!response.ok)throw new Error('양식을 불러오지 못했습니다.');return response.arrayBuffer();}).catch(error=>{templatePromise=null;throw error;});
      const bytes=window.HwpxBuilder.fill(await templatePromise,data);
      const blob=new Blob([bytes],{type:'application/hwp+zip'}),url=URL.createObjectURL(blob),link=document.createElement('a');
      link.hidden=true;link.href=url;link.download=`작업 전 안전교육(TBM)(${data.date.replaceAll('-','.')}_${data.shift}).hwpx`;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
      preview();$('tbm-status').textContent='HWPX 다운로드 완료';
    }catch(error){$('tbm-status').textContent=error.message||'문서 생성에 실패했습니다. 입력 내용을 확인하고 다시 시도하세요.';}
    finally{downloading=false;$('tbm-controls').disabled=false;$('tbm-download').disabled=false;}
  });
  document.querySelectorAll('[data-generator]').forEach(button=>button.addEventListener('click',()=>{
    const open=button.dataset.generator==='tbm';panel.hidden=!open;$('daily-generator').hidden=open;
    document.querySelectorAll('[data-generator]').forEach(tab=>tab.setAttribute('aria-pressed',String(tab===button)));
    if(open){refreshCatalog();preview();requestAnimationFrame(resizePaper);}
  }));
  refreshCatalog();preview();
})();
