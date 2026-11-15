(() => {
  'use strict';
  const panel=document.querySelector('#tbm-generator');
  panel.innerHTML=`<form id="tbm-form"><fieldset id="tbm-controls" class="workspace">
    <div class="document-toolbar"><label>보기 <select id="tbm-zoom" aria-label="문서 확대 비율"><option value="1">100%</option><option value="0.85">85%</option><option value="0.7">70%</option><option value="0.55">55%</option></select></label><button type="submit" id="tbm-download">HWPX 다운로드</button><span id="tbm-status" role="status" aria-live="polite"></span></div>
    <div class="tbm-document-viewport"><div id="tbm-paper-stage"><article id="tbm-paper" class="tbm-paper" aria-label="작업 전 안전교육 원본 양식 편집"><h2 id="tbm-paper-title"></h2><table id="tbm-document-table" class="tbm-document-table"></table><div id="tbm-legal"></div></article></div></div>
  </fieldset></form>`;
  const $=id=>document.getElementById(id),text=id=>$(id).value.trim();
  const layout=window.TBM_FORM_LAYOUT;
  const fixedMethods=['배전반내 각종 케이블 외관 상태 점검','변압기 소음 및 온도 이상유무 확인','원격소장치 표시등 점등상태 및 통신상태 점검'];
  // Deduplicated from 위험성평가.xlsx rows whose 작업종류 is 변전설비 일상점검.
  const riskCatalog=[
    {risk:'케이블 접속부, 모선 등 충전부 접촉',activities:['단전확인, 통전표시기 확인','작업 전 검전, 방전 실시','안전모, 안전화, 절연장갑 착용','작업시 활선접근경보기 착용','2인 1조 작업','지적확인 환호응답 철저','작업 전 검전, 방전, 접지 실시','급전중인 배전반 잠금 조치 및 급전표지판 부착']},
    {risk:'배전반내 공간 협소 및 돌출부로 인한 외상',activities:['작업 전･후 스트레칭 실시','작업복, 안전모, 안전화 착용']},
    {risk:'교육 및 훈련의 미흡',activities:['작업 전 TBM 실시','주기적 안전교육','훈련 실시']},
    {risk:'진공인터럽터 절연불량으로 인한 가압',activities:['차단기 개방 및 인출 시행','2차측 검전, 방전 및 접지, 작업 전 안전용구 검사']},
    {risk:'원방 및 수동 오조작에 의한 급전',activities:['전기안전수칙 준수','전력관제와 의사소통 명확화','전력계통 숙지','차단기 인출']},
    {risk:'차단기 인입․인출작업 중 중량물에 의한 손, 발 부상',activities:['안전장갑, 안전화 착용']},
    {risk:'작업자의 오판, 혼동으로 타 계기용변성기 취급',activities:['전력계통 숙지','작업 전 안전교육','단로기 취급 전 해당 개소 여부 확인']},
    {risk:'계기용 변성기 운반 중 중량물에 의한 손, 발 부상',activities:['안전장갑, 안전화 착용','물품이동 대차 사용']},
    {risk:'작업자의 오판, 혼동으로 타 몰드변압기 취급',activities:['전력계통 숙지','작업 전 안전교육','지적확인 환호응답 철저','2인 1조 작업']},
    {risk:'부스바, 케이블헤드, 볼트 등 돌출부로 인한 외상',activities:['작업복, 안전모, 안전화 착용']},
    {risk:'작업자의 오판, 혼동으로 타 정류기 취급',activities:['전력계통 숙지','작업 전 안전교육']},
    {risk:'다이오드 방열판, 볼트 등 돌출부로 인한 외상',activities:['작업복, 안전모, 안전화 착용']},
    {risk:'피트 커버 불량으로 인한 떨어짐',activities:['피트 커버 점검']},
    {risk:'피트 커버 개폐작업 시 손가락 끼임',activities:['작업 전 안전교육','안전장갑 착용','2인 1조 작업']},
    {risk:'피트내 공간 협소 및 돌출부로 인한 외상',activities:['작업 전･후 스트레칭 실시','작업복, 안전모, 안전화 착용']}
  ];
  const defaultRiskSelections=[
    {risk:'원방 및 수동 오조작에 의한 급전',activities:['전기안전수칙 준수','전력계통 숙지']},
    {risk:'배전반내 공간 협소 및 돌출부로 인한 외상',activities:['작업복, 안전모, 안전화 착용']}
  ];
  const table=$('tbm-document-table'),colgroup=document.createElement('colgroup');
  layout.columns.forEach(width=>{const col=document.createElement('col');col.style.width=`${width}%`;colgroup.append(col);});table.append(colgroup);
  const body=document.createElement('tbody');table.append(body);
  for(let row=0;row<16;row++){
    const tr=document.createElement('tr');
    const source=layout.cells.filter(cell=>cell.row===row);
    const baseRowHeight=Math.max(0,...source.filter(cell=>cell.rowSpan===1).map(cell=>cell.height/75));
    const rowHeight=Math.max(0,baseRowHeight-(row===6?566/75:0));
    tr.style.height=`${rowHeight}px`;
    source.forEach(cell=>{
      const td=document.createElement('td');td.id=`tbm-cell-${cell.index}`;td.dataset.sourceCell=cell.index;td.rowSpan=cell.rowSpan;td.colSpan=cell.colSpan;
      for(const [side,border] of Object.entries(cell.borders||{})){td.style['border'+side[0].toUpperCase()+side.slice(1)]=border.type==='NONE'?'none':`${border.width} solid ${border.color}`;}
      if(cell.diagonal)td.style.backgroundImage='linear-gradient(to bottom right, transparent calc(50% - .5px), #222 50%, transparent calc(50% + .5px))';
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
  put(0,`<div class="document-line">□ 소　　속 : <span class="document-fixed">대구은행 변전분소</span></div><div class="document-line">□ 교육일시 : <input id="tbm-date" aria-label="교육일자" type="date" required><span id="tbm-weekday"></span><input id="tbm-education-start" class="document-clock" aria-label="교육 시작" value="09:10" inputmode="numeric" pattern="[0-2][0-9]:[0-5][0-9]" maxlength="5" required> ~ <input id="tbm-education-end" class="document-clock" aria-label="교육 종료" value="09:30" inputmode="numeric" pattern="[0-2][0-9]:[0-5][0-9]" maxlength="5" required></div><div class="document-line">□ 교육장소 : <input id="tbm-location" aria-label="교육장소" value="분소 사무실" required maxlength="40"></div>`);
  put(6,`<div class="document-work-title">(<select id="tbm-shift" aria-label="근무"><option>야간</option><option>주간</option></select>) <select id="tbm-work-preset" aria-label="작업 종류"><option>변전설비 일상점검</option></select></div>
  <div id="tbm-work-time-row" class="document-line">- 작업일시: <input id="tbm-start" class="document-clock" aria-label="작업 시작" value="09:30" inputmode="numeric" pattern="[0-2][0-9]:[0-5][0-9]" maxlength="5" required> ~ <input id="tbm-end" class="document-clock" aria-label="작업 종료" value="18:00" inputmode="numeric" pattern="[0-2][0-9]:[0-5][0-9]" maxlength="5" required></div>
  <div id="tbm-worker-row" class="document-choices"><span>- 작업자:</span><details id="tbm-worker-picker"><summary id="tbm-worker-summary">작업자 선택</summary><div class="document-choice-menu"><label><input type="checkbox" name="tbm-worker" value="김대일" checked> 김대일</label><label><input type="checkbox" name="tbm-worker" value="김승오" checked> 김승오</label><label><input type="checkbox" name="tbm-worker" value="김범석" checked> 김범석</label></div></details></div>
  <div id="tbm-area-row" class="document-choices"><span>- 작업구간:</span><details id="tbm-area-picker"><summary id="tbm-area-summary">대구은행 변전소</summary><div class="document-choice-menu document-area-menu"><div class="document-area-row"><b>A</b>${['문양기지','성서산단','반고개','만촌','사월'].map(area=>`<label><input type="checkbox" name="tbm-area" value="${area}"> ${area}</label>`).join('')}</div><div class="document-area-row"><b>B</b>${['대실','죽전','대구은행','수성알파시티','영남대'].map(area=>`<label><input type="checkbox" name="tbm-area" value="${area}"${area==='대구은행'?' checked':''}> ${area}</label>`).join('')}</div></div></details></div>
  <label class="document-line">- 작업순서: <input id="tbm-order" aria-label="작업순서" value="AC반 → DC반 → 기타(RTU 및 충전기반)" required maxlength="120"></label>
  <div class="document-methods"><span>- 작업방법:</span><div class="document-fixed-methods">${fixedMethods.map(method=>`<div>ㅇ ${method}</div>`).join('')}</div></div>
  <div>- 작업원별 임무 및 작업장 이동방법: 육안 점검 실시, 열차를 통한 이동</div>
  <div class="document-risk-heading"><span>- 위험요인 안전조치 및 교육:</span><details id="tbm-risk-picker" class="document-risk-picker"><summary>내용 선택</summary><div class="document-risk-menu"><div id="tbm-risk-editors"></div></div></details></div><div id="tbm-plan-risk-summary"></div>`);
  put(8,'<span>유해·위험요인</span>');
  put(9,'<span>안전대책</span>');
  put(10,'');
  put(11,'');
  const checks=['안전보호구 착용 상태','위험요인 안전조치 확인','작업통제 방법 및 준수 여부 확인'];
  checks.forEach((label,i)=>{
    put([16,19,22][i],`<span class="document-indented"> ${label}</span>`);
    put([17,20,23][i],'<span class="document-manual">□ 적합　□ 부적합</span>');
    put([18,21,24][i],'');
  });
  put(25,'확 인 자\n(교육교관)');
  put(26,'작업\n책임자');
  put(27,'성 명');
  put(28,'서 명');
  put(33,'교육참석자,\n작업적합성\n평가\n(업무일지\n참조)');
  put(31,'<span id="tbm-leader"></span>');
  put(30,'');
  for(let i=0;i<4;i++){
    put(35+i,`<span id="tbm-attendee-${i}"></span>`);
    put(45+i,'<span class="document-manual">□ 적합　□ 부적합</span>');
  }
  const riskEditors=$('tbm-risk-editors');
  function renderActivityChoices(editor,selected=[]){
    const list=editor.querySelector('.tbm-activity-list'),risk=editor.querySelector('.tbm-risk-select').value;
    list.replaceChildren();
    const entry=riskCatalog.find(item=>item.risk===risk);
    if(!entry){list.textContent='유해·위험요인을 선택하세요.';return;}
    entry.activities.forEach(activity=>{
      const label=document.createElement('label'),input=document.createElement('input');
      input.type='checkbox';input.name=`tbm-risk-activity-${editor.dataset.index}`;input.value=activity;input.checked=selected.includes(activity);
      label.append(input,document.createTextNode(' '+activity));list.append(label);
    });
  }
  defaultRiskSelections.forEach((selection,index)=>{
    const editor=document.createElement('section');editor.className='tbm-risk-editor';editor.dataset.index=index;
    const title=document.createElement('strong');title.textContent=`선택 ${index+1}`;
    const select=document.createElement('select');select.className='tbm-risk-select';select.setAttribute('aria-label',`유해·위험요인 ${index+1}`);
    const blank=document.createElement('option');blank.value='';blank.textContent='선택 안 함';select.append(blank);
    riskCatalog.forEach(item=>{const option=document.createElement('option');option.value=item.risk;option.textContent=item.risk;select.append(option);});
    select.value=selection.risk;
    const activities=document.createElement('div');activities.className='tbm-activity-list';
    editor.append(title,select,activities);riskEditors.append(editor);renderActivityChoices(editor,selection.activities);
    select.addEventListener('change',()=>{renderActivityChoices(editor);syncRiskOptionAvailability();preview();});
  });
  function syncRiskOptionAvailability(){
    const selects=[...riskEditors.querySelectorAll('.tbm-risk-select')];
    for(const select of selects){
      const selectedByOthers=new Set(selects.filter(other=>other!==select).map(other=>other.value).filter(Boolean));
      for(const option of select.options){
        option.disabled=Boolean(option.value&&selectedByOthers.has(option.value));
        option.title=option.disabled?'다른 선택에서 이미 선택한 항목입니다.':'';
      }
    }
  }
  syncRiskOptionAvailability();
  function selectedRisks(){
    const merged=new Map();
    for(const editor of riskEditors.querySelectorAll('.tbm-risk-editor')){
      const risk=editor.querySelector('.tbm-risk-select').value;if(!risk)continue;
      const activities=[...editor.querySelectorAll('.tbm-activity-list input:checked')].map(input=>input.value);
      if(!merged.has(risk))merged.set(risk,[]);
      const current=merged.get(risk);for(const activity of activities)if(!current.includes(activity))current.push(activity);
    }
    return [...merged].map(([risk,activities])=>({risk,activities,rules:activities.join(', ')}));
  }
  function renderSelectedRisks(risks){
    const summary=[];
    for(const item of risks){summary.push(`ㅇ ${item.risk}`);summary.push(`   - ${item.rules||'관리활동을 선택하세요'}`);}
    $('tbm-plan-risk-summary').textContent=summary.join('\n');
    const riskCell=$('tbm-cell-10'),ruleCell=$('tbm-cell-11');riskCell.replaceChildren();ruleCell.replaceChildren();
    risks.forEach((item,index)=>{
      const risk=document.createElement('div');risk.textContent=` ${['①','②'][index]} ${item.risk}`;riskCell.append(risk);
      const rule=document.createElement('div');rule.textContent=` ${['①','②'][index]} ${item.rules||'관리활동을 선택하세요'}`;ruleCell.append(rule);
    });
    const note=document.createElement('div');note.textContent=' ※ 전체 유해‧위험요인은 위험성평가표 참고';riskCell.append(note);
  }
  const seoulParts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'}).formatToParts(new Date()).map(part=>[part.type,part.value]));
  $('tbm-date').value=`${seoulParts.year}-${seoulParts.month}-${seoulParts.day}`;
  const initialShift=Number(seoulParts.hour)>=16?'야간':'주간';
  $('tbm-shift').value=initialShift;
  function applyShift(){
    const night=text('tbm-shift')==='야간';
    $('tbm-education-start').value=night?'18:10':'09:10';$('tbm-education-end').value=night?'18:30':'09:30';
    $('tbm-start').value=night?'18:30':'09:30';$('tbm-end').value=night?'00:20':'18:00';preview();
  }
  $('tbm-shift').addEventListener('change',applyShift);
  let templatePromise=null,downloading=false;
  const chosen=(name)=>[...document.querySelectorAll(`input[name="${name}"]:checked`)].map(input=>input.value);
  function syncWorkersAndAreas(){
    const workers=chosen('tbm-worker'),leader=workers[0]||'',attendees=workers.slice(1);
    $('tbm-worker-summary').textContent=workers.join(', ')||'작업자 선택';
    $('tbm-leader').textContent=leader;
    for(let i=0;i<4;i++)$(`tbm-attendee-${i}`).textContent=attendees[i]||'';
    const areas=chosen('tbm-area');
    $('tbm-area-summary').textContent=areas.length?`${areas.join(', ')} 변전소`:'작업구간 선택';
  }
  function values(){
    const date=text('tbm-date'),parsed=date?new Date(`${date}T12:00:00+09:00`):null;
    const educationDate=parsed?`${date.replaceAll('-','. ')}. (${new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',weekday:'short'}).format(parsed)}) ${text('tbm-education-start')} ~ ${text('tbm-education-end')}`:'';
    const workers=chosen('tbm-worker'),leader=workers[0]||'',people=workers.slice(1).map(name=>({name,fitness:'미확인'}));
    while(people.length<4)people.push({name:'',fitness:'미확인'});
    const risks=selectedRisks();
    const methods=fixedMethods;
    const areas=chosen('tbm-area'),area=areas.length?`${areas.join(', ')} 변전소`:'';
    const planLines=[`(${text('tbm-shift')}) ${text('tbm-work-preset')}`,
      `  - 작업일시: ${text('tbm-start')} ~ ${text('tbm-end')}`,
      `  - 작업자: ${workers.join(', ')}`,
      `  - 작업구간: ${area}`,
      `  - 작업순서: ${text('tbm-order')}`,
      ...methods.map((line,index)=>`${index?'               ':'  - 작업방법:  '}ㅇ ${line}`),
      '  - 작업원별 임무 및 작업장 이동방법: 육안 점검 실시, 열차를 통한 이동',
      '  - 위험요인 안전조치 및 교육:',
      ...risks.map(item=>`     ㅇ ${item.risk}\n        - ${item.rules}`)];
    const data={department:'대구은행 변전분소',educationDate,date,location:text('tbm-location'),shift:text('tbm-shift'),leader,railwayManager:'',attendees:people,risks,riskRules:risks.map(item=>item.rules),methods,planLines,checks:checks.map(label=>({label,result:'미확인',action:''}))};
    data.previewText=['작업 전 안전교육(TBM) 일지',`소속: ${data.department}`,`교육일시: ${educationDate}`,`교육장소: ${data.location}`,'[작업 계획]',...planLines,'[위험성평가 결과]',...risks.map(item=>`${item.risk}\n안전대책: ${item.rules}`),'[확인사항]',...data.checks.map(check=>`${check.label}: ${check.result}${check.action?' / '+check.action:''}`),`작업책임자: ${leader}`,`철도운행 안전관리자: ${data.railwayManager}`,'[교육참석자]',...people.filter(person=>person.name).map(person=>`${person.name}: ${person.fitness}`)].join('\r\n');
    return data;
  }
  function preview(){
    const data=values();
    syncWorkersAndAreas();
    renderSelectedRisks(data.risks);
    $('tbm-weekday').textContent=data.educationDate?data.educationDate.match(/\([^)]+\)/)?.[0]||'':'';
  }
  $('tbm-form').addEventListener('input',preview);
  $('tbm-form').addEventListener('change',preview);
  function resizePaper(){const scale=Number(text('tbm-zoom'));$('tbm-paper').style.zoom=scale;$('tbm-paper-stage').style.width=`${794*scale}px`;$('tbm-paper-stage').style.height=`${$('tbm-paper').offsetHeight*scale}px`;}
  $('tbm-zoom').addEventListener('change',resizePaper);
  new ResizeObserver(resizePaper).observe($('tbm-paper'));
  $('tbm-form').addEventListener('submit',async event=>{
    event.preventDefault();if(downloading)return;
    const data=values();
    if(!data.leader){$('tbm-status').textContent='작업자를 1명 이상 선택하세요.';return;}
    if(!chosen('tbm-area').length){$('tbm-status').textContent='작업구간을 1개 이상 선택하세요.';return;}
    if(!data.risks.length){$('tbm-status').textContent='유해·위험요인을 1개 이상 선택하세요.';return;}
    if(data.risks.some(item=>!item.activities.length)){$('tbm-status').textContent='선택한 유해·위험요인의 관리활동을 1개 이상 선택하세요.';return;}
    downloading=true;$('tbm-controls').disabled=true;$('tbm-download').disabled=true;$('tbm-status').textContent='HWPX 생성 중…';
    try{
      if(!templatePromise)templatePromise=fetch('assets/tbm-template.hwpx?v=20261115-risk-picker4',{cache:'no-store'}).then(response=>{if(!response.ok)throw new Error('양식을 불러오지 못했습니다.');return response.arrayBuffer();}).catch(error=>{templatePromise=null;throw error;});
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
    if(open){preview();requestAnimationFrame(resizePaper);}
  }));
  applyShift();preview();
})();
