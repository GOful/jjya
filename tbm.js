(() => {
  'use strict';
  const panel=document.querySelector('#tbm-generator');
  panel.innerHTML=`
  <form id="tbm-form"><fieldset id="tbm-controls" class="workspace">
  <div class="tbm-columns">
  <section class="card"><h2><span class="step">1</span>교육·작업 정보</h2>
  <div class="tbm-fields">
    <label class="field">소속<input id="tbm-department" value="대구은행변전분소" required maxlength="40"></label>
    <label class="field">교육일자<input id="tbm-date" type="date" required></label>
    <label class="field">교육장소<input id="tbm-location" value="분소사무실" required maxlength="40"></label>
    <label class="field">근무<select id="tbm-shift"><option>야간</option><option>주간</option></select></label>
    <label class="field">작업 종류<select id="tbm-work-preset"><option>변전설비 일상점검</option><option>MCC설비 점검</option><option>수전선로 점검</option><option>직접 입력</option></select></label>
    <label class="field">작업명<input id="tbm-work-title" value="변전설비 일상점검" required maxlength="60"></label>
    <label class="field">작업 시작<input id="tbm-start" type="time" value="18:00" required></label>
    <label class="field">작업 종료<input id="tbm-end" type="time" value="00:20" required></label>
    <label class="field tbm-wide">작업구간<input id="tbm-area" placeholder="예: 반고개 변전소" required maxlength="60"></label>
    <label class="field tbm-wide">작업순서<input id="tbm-order" value="AC반 → DC반 → 기타(RTU 및 충전기반)" required maxlength="120"></label>
    <label class="field tbm-wide">작업원별 임무·이동방법<input id="tbm-duties" value="육안 점검 실시, 열차를 통한 이동" required maxlength="100"></label>
  </div>
  <fieldset class="tbm-options"><legend>작업방법</legend>
    <label><input type="checkbox" name="tbm-method" value="계전기 및 원격소장치 LED 점등상태 육안 점검" checked>계전기·원격소장치 LED 점등상태 육안 점검</label>
    <label><input type="checkbox" name="tbm-method" value="소공간소화장치 상태 이상 유무 확인" checked>소공간소화장치 상태 확인</label>
    <label><input type="checkbox" name="tbm-method" value="각종 지시계기 동작상태 확인" checked>각종 지시계기 동작상태 확인</label>
  </fieldset>
  <label class="field">추가 작업방법<textarea id="tbm-extra-methods" rows="2" maxlength="300" placeholder="한 줄에 한 항목"></textarea></label>
  </section>
  <section class="card"><h2><span class="step">2</span>위험요인·안전대책</h2>
    <div class="bar"><label for="tbm-risk-category">분류</label><select id="tbm-risk-category"><option>전체</option><option>일상</option><option>MCC</option><option>3개월</option><option>6개월</option><option>1년</option><option>수전선로</option></select></div>
    <p class="tbm-note">위험요인 1~2개를 선택하면 교육 내용과 위험성평가에 함께 반영됩니다.</p>
    <div id="tbm-risk-list" class="tbm-risk-list"></div><div id="tbm-selected-risks"></div>
    <label class="field">추가 교육<select id="tbm-extra-education"><option value="">없음</option><option>소화설비 교육</option><option>전기안전수칙 교육</option><option>비상대응 및 연락체계 교육</option></select></label>
    <label class="field">기타 교육 내용<input id="tbm-custom-education" maxlength="100"></label>
  </section></div>
  <section class="card"><h2><span class="step">3</span>확인사항·참석자</h2>
    <div class="tbm-checks" id="tbm-checks"></div>
    <div class="tbm-fields">
      <label class="field">작업책임자(교육교관)<input id="tbm-leader" required maxlength="20" autocomplete="off"></label>
      <label class="field">철도운행 안전관리자<input id="tbm-railway-manager" maxlength="20" autocomplete="off"></label>
    </div>
    <div id="tbm-attendees" class="tbm-attendees"></div>
    <p class="tbm-note">서명·결재 칸은 비워 둡니다. 참석자 성명과 확인 결과는 이 브라우저에서 문서 생성에만 사용됩니다.</p>
  </section>
  <section class="card"><div class="tbm-preview-heading"><h2><span class="step">4</span>입력 내용 확인</h2><button type="button" id="tbm-refresh-preview">미리보기 갱신</button></div>
    <div id="tbm-preview" class="tbm-preview"></div>
    <div class="actions"><button type="submit" id="tbm-download">HWPX 다운로드</button><span id="tbm-status" role="status" aria-live="polite"></span></div>
  </section>
  </fieldset></form>`;
  const $=id=>document.getElementById(id),text=id=>$(id).value.trim();
  const checks=['안전보호구 착용 상태','위험요인 안전조치 확인','작업통제 방법 및 준수 여부 확인'];
  const fitnessOptions='<option>미확인</option><option>적합</option><option>부적합</option>';
  checks.forEach((label,i)=>{
    const row=document.createElement('div');row.className='tbm-check-row';
    const name=document.createElement('span');name.textContent=label;
    const result=document.createElement('select');result.id=`tbm-check-${i}`;result.setAttribute('aria-label',`${label} 결과`);result.innerHTML=fitnessOptions;
    const action=document.createElement('input');action.id=`tbm-action-${i}`;action.maxLength=40;action.placeholder='조치사항';action.setAttribute('aria-label',`${label} 조치사항`);
    row.append(name,result,action);$('tbm-checks').append(row);
  });
  for(let i=0;i<4;i++){
    const row=document.createElement('div');row.className='tbm-attendee';
    const label=document.createElement('label');label.className='field';label.textContent=`참석자 ${i+1}`;
    const name=document.createElement('input');name.id=`tbm-attendee-${i}`;name.maxLength=20;name.autocomplete='off';label.append(name);
    const select=document.createElement('select');select.id=`tbm-fitness-${i}`;select.innerHTML=fitnessOptions;select.setAttribute('aria-label',`참석자 ${i+1} 작업적합성`);
    row.append(label,select);$('tbm-attendees').append(row);
  }
  $('tbm-date').value=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  $('tbm-work-preset').addEventListener('change',()=>{if(text('tbm-work-preset')!=='직접 입력')$('tbm-work-title').value=text('tbm-work-preset');});
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
    const container=$('tbm-selected-risks');container.replaceChildren();
    [...selected].forEach(([id,item],index)=>{
      const section=document.createElement('div');section.className='tbm-risk-edit';
      const heading=document.createElement('div');heading.className='tbm-risk-edit-heading';
      const title=document.createElement('strong');title.textContent=`위험요인 ${index+1}`;
      const remove=document.createElement('button');remove.type='button';remove.className='remove-selection';remove.textContent='×';remove.setAttribute('aria-label',`위험요인 ${index+1} 해제`);
      remove.addEventListener('click',()=>{selected.delete(id);renderRisks();renderSelected();preview();});heading.append(title,remove);
      for(const [key,titleText] of [['risk','위험요인'],['rules','안전대책']]){
        const label=document.createElement('label');label.className='field';label.textContent=titleText;
        const field=document.createElement('textarea');field.value=item[key];field.maxLength=300;field.rows=2;field.required=true;field.dataset.riskField=key;field.dataset.riskId=id;
        field.addEventListener('input',()=>{item[key]=field.value;});label.append(field);section.append(label);
      }
      section.prepend(heading);container.append(section);
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
    const data=values(),target=$('tbm-preview');target.replaceChildren();
    const title=document.createElement('h3');title.textContent='작업 전 안전교육(TBM) 일지';
    const meta=document.createElement('p');meta.textContent=`${data.department} | ${data.educationDate} | ${data.location}`;
    const table=document.createElement('table');table.className='tbm-preview-table';
    function row(heading,content){const tr=document.createElement('tr'),th=document.createElement('th'),td=document.createElement('td');th.textContent=heading;td.textContent=content;tr.append(th,td);table.append(tr);}
    row('작업 계획',data.planLines.join('\n'));row('위험성평가',data.risks.map((risk,i)=>`${i+1}. ${risk.risk}\n   안전대책: ${risk.rules}`).join('\n'));
    row('확인사항',data.checks.map(check=>`${check.label}: ${check.result}${check.action?' / '+check.action:''}`).join('\n'));
    row('확인자',`작업책임자: ${data.leader}\n철도운행 안전관리자: ${data.railwayManager}`);
    row('교육참석자',data.attendees.filter(person=>person.name).map(person=>`${person.name} / ${person.fitness}`).join('\n'));
    target.append(title,meta,table);
  }
  $('tbm-refresh-preview').addEventListener('click',preview);
  $('tbm-form').addEventListener('change',preview);
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
  const toggle=$('generator-toggle');
  toggle.addEventListener('click',()=>{
    const open=panel.hidden;panel.hidden=!open;$('daily-generator').hidden=open;
    $('app-title').textContent=open?'안전교육일지 생성기':'일일업무일지 생성기';toggle.textContent=open?'일일업무일지 생성기':'안전교육일지 생성기';toggle.setAttribute('aria-pressed',String(open));
    if(open){refreshCatalog();preview();}
  });
  refreshCatalog();preview();
})();
