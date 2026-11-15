/* Small stored-ZIP/HWPX writer for the bundled clean form. No external service or library. */
(() => {
  'use strict';
  const HP='http://www.hancom.co.kr/hwpml/2011/paragraph';
  const HH='http://www.hancom.co.kr/hwpml/2011/head';
  const encoder=new TextEncoder(),decoder=new TextDecoder();
  const crcTable=Array.from({length:256},(_,value)=>{for(let i=0;i<8;i++)value=value&1?0xedb88320^(value>>>1):value>>>1;return value>>>0;});
  const crc32=bytes=>{let value=0xffffffff;for(const byte of bytes)value=crcTable[(value^byte)&255]^(value>>>8);return (value^0xffffffff)>>>0;};
  function readZip(buffer){
    const bytes=new Uint8Array(buffer),view=new DataView(buffer);const files=new Map();let end=bytes.length-22;
    while(end>=Math.max(0,bytes.length-65557)&&view.getUint32(end,true)!==0x06054b50)end--;
    if(end<0||view.getUint32(end,true)!==0x06054b50)throw new Error('양식 ZIP 구조가 올바르지 않습니다.');
    const total=view.getUint16(end+10,true);let position=view.getUint32(end+16,true);
    for(let i=0;i<total;i++){
      if(view.getUint32(position,true)!==0x02014b50)throw new Error('양식 파일 목록이 손상되었습니다.');
      const method=view.getUint16(position+10,true),crc=view.getUint32(position+16,true),size=view.getUint32(position+24,true);
      const nameSize=view.getUint16(position+28,true),extra=view.getUint16(position+30,true),comment=view.getUint16(position+32,true),local=view.getUint32(position+42,true);
      if(method!==0)throw new Error('지원하지 않는 양식 압축 방식입니다.');
      const name=decoder.decode(bytes.slice(position+46,position+46+nameSize));
      const start=local+30+view.getUint16(local+26,true)+view.getUint16(local+28,true);
      const content=bytes.slice(start,start+size);
      if(content.length!==size||crc32(content)!==crc||files.has(name))throw new Error('양식 파일 무결성 확인에 실패했습니다.');
      files.set(name,content);position+=46+nameSize+extra+comment;
    }
    if(decoder.decode(files.get('mimetype'))!=='application/hwp+zip')throw new Error('HWPX 양식이 아닙니다.');
    return files;
  }
  function writeZip(files){
    const entries=[['mimetype',files.get('mimetype')],...[...files].filter(([name])=>name!=='mimetype')];
    const chunks=[],central=[];let offset=0,centralSize=0;
    for(const [name,content] of entries){
      const path=encoder.encode(name),crc=crc32(content);
      const local=new Uint8Array(30+path.length),lv=new DataView(local.buffer);
      lv.setUint32(0,0x04034b50,true);lv.setUint16(4,20,true);lv.setUint16(6,0x800,true);lv.setUint16(12,0x21,true);lv.setUint32(14,crc,true);lv.setUint32(18,content.length,true);lv.setUint32(22,content.length,true);lv.setUint16(26,path.length,true);local.set(path,30);
      const record=new Uint8Array(46+path.length),rv=new DataView(record.buffer);
      rv.setUint32(0,0x02014b50,true);rv.setUint16(4,20,true);rv.setUint16(6,20,true);rv.setUint16(8,0x800,true);rv.setUint16(14,0x21,true);rv.setUint32(16,crc,true);rv.setUint32(20,content.length,true);rv.setUint32(24,content.length,true);rv.setUint16(28,path.length,true);rv.setUint32(42,offset,true);record.set(path,46);
      chunks.push(local,content);central.push(record);offset+=local.length+content.length;centralSize+=record.length;
    }
    const ending=new Uint8Array(22),ev=new DataView(ending.buffer);ev.setUint32(0,0x06054b50,true);ev.setUint16(8,entries.length,true);ev.setUint16(10,entries.length,true);ev.setUint32(12,centralSize,true);ev.setUint32(16,offset,true);
    const output=new Uint8Array(offset+centralSize+22);let position=0;for(const chunk of [...chunks,...central,ending]){output.set(chunk,position);position+=chunk.length;}return output;
  }
  function parseXml(bytes){const xml=new DOMParser().parseFromString(decoder.decode(bytes),'application/xml');if(xml.getElementsByTagName('parsererror').length)throw new Error('양식 XML을 읽지 못했습니다.');return xml;}
  const children=(node,name)=>[...node.children].filter(child=>child.namespaceURI===HP&&child.localName===name);
  function setText(xml,run,text){
    run.replaceChildren();const t=xml.createElementNS(HP,'hp:t');
    text.split('\n').forEach((line,i)=>{if(i)t.append(xml.createElementNS(HP,'hp:lineBreak'));t.append(xml.createTextNode(line));});run.append(t);
  }
  function fill(template,values){
    const files=readZip(template),xml=parseXml(files.get('Contents/section0.xml'));
    const cells=[...xml.getElementsByTagNameNS(HP,'tc')];if(cells.length!==49)throw new Error('양식의 표 구조가 변경되었습니다.');
    // Fit the fixed A4 form without letting large inherited text expand its rows.
    // Normalize the download, rather than changing the editable source template.
    const header=parseXml(files.get('Contents/header.xml'));
    for(const style of header.getElementsByTagNameNS(HH,'charPr')){
      style.setAttribute('textColor','#000000');
      if(style.getAttribute('id')==='9')style.setAttribute('height','1200');
      if(['15','17'].includes(style.getAttribute('id')))style.setAttribute('height','1000');
    }
    for(const style of header.getElementsByTagNameNS(HH,'paraPr')){
      if(!['22','33','34'].includes(style.getAttribute('id')))continue;
      for(const spacing of style.getElementsByTagNameNS(HH,'lineSpacing')){
        spacing.setAttribute('type','PERCENT');spacing.setAttribute('value','120');
      }
      style.setAttribute('snapToGrid','0');
    }
    // Dedicated styles avoid changing shared styles used by other labels/cells.
    function labelStyle(kind,sourceId){
      const styles=[...header.getElementsByTagNameNS(HH,kind)];
      const source=styles.find(style=>style.getAttribute('id')===sourceId);
      const copy=source.cloneNode(true),id=String(Math.max(...styles.map(style=>Number(style.getAttribute('id'))))+1);
      copy.setAttribute('id',id);source.parentNode.append(copy);
      source.parentNode.setAttribute('itemCnt',String(styles.length+1));return copy;
    }
    const labelChar=labelStyle('charPr','14');labelChar.setAttribute('height','1000');
    const instructorChar=labelStyle('charPr','14');instructorChar.setAttribute('height','1100');
    const riskChar=labelStyle('charPr','17');riskChar.setAttribute('height','1100');
    const labelPara=labelStyle('paraPr','23');labelPara.setAttribute('snapToGrid','0');
    for(const spacing of labelPara.getElementsByTagNameNS(HH,'lineSpacing'))spacing.setAttribute('value','100');
    const riskTitlePara=labelStyle('paraPr','24');riskTitlePara.setAttribute('snapToGrid','0');
    const riskBodyPara=labelStyle('paraPr','34');riskBodyPara.setAttribute('snapToGrid','0');
    for(const style of [riskTitlePara,riskBodyPara]){
      for(const spacing of style.getElementsByTagNameNS(HH,'lineSpacing')){
        spacing.setAttribute('type','PERCENT');spacing.setAttribute('value','150');
      }
    }
    // Trim only the risk/countermeasure row by 2 mm (about 566 HWP units),
    // matching the small manual row-height adjustment in Hangul.
    const riskRowTrim=566;
    for(const index of [10,11]){
      const size=children(cells[index],'cellSz')[0];
      size.setAttribute('height',String(Number(size.getAttribute('height'))-riskRowTrim));
    }
    // NONE keeps rows together; compact typography keeps the table within A4.
    for(const table of xml.getElementsByTagNameNS(HP,'tbl')){
      table.setAttribute('pageBreak','NONE');
      const size=children(table,'sz')[0];
      size.setAttribute('height',String(Number(size.getAttribute('height'))-riskRowTrim));
    }
    files.set('Contents/header.xml',encoder.encode(new XMLSerializer().serializeToString(header)));
    // Keep every table cell vertically centered in downloaded documents.
    cells.forEach(cell=>children(cell,'subList')[0]?.setAttribute('vertAlign','CENTER'));
    function paragraphs(index,lines,charId,paraId){
      const sub=children(cells[index],'subList')[0],original=children(sub,'p');
      const next=lines.map((line,i)=>{
        const base=original[Math.min(i,original.length-1)].cloneNode(true);
        children(base,'linesegarray').forEach(node=>node.remove());
        if(paraId!==undefined)base.setAttribute('paraPrIDRef',String(paraId));
        const source=children(base,'run').find(run=>run.getAttribute('charPrIDRef')==='15')||children(base,'run')[0];
        const run=source.cloneNode(false);if(charId!==undefined)run.setAttribute('charPrIDRef',String(charId));setText(xml,run,line);base.replaceChildren(run);return base;
      });sub.replaceChildren(...next);
    }
    paragraphs(0,[`□ 소    속 : ${values.department}`,`□ 교육일시 : ${values.educationDate}`,`□ 교육장소 : ${values.location}`],9);
    paragraphs(6,values.planLines,15,33);
    paragraphs(8,['유해·위험요인'],riskChar.getAttribute('id'),riskTitlePara.getAttribute('id'));
    paragraphs(9,['안전대책'],riskChar.getAttribute('id'),riskTitlePara.getAttribute('id'));
    paragraphs(10,values.risks.map((risk,i)=>`　${['①','②'][i]} ${risk.risk}`).concat('　※ 전체 유해‧위험요인은 위험성평가표 참고'),riskChar.getAttribute('id'),riskBodyPara.getAttribute('id'));
    paragraphs(11,values.riskRules.map((rule,i)=>`　${['①','②','③'][i]} ${rule}`),riskChar.getAttribute('id'),riskBodyPara.getAttribute('id'));
    const checkbox=value=>value==='적합'?'☑ 적합　□ 부적합':value==='부적합'?'□ 적합　☑ 부적합':'□ 적합　□ 부적합';
    values.checks.forEach((check,i)=>{paragraphs([17,20,23][i],[`　${checkbox(check.result)}`],20);paragraphs([18,21,24][i],[`　${check.action}`],20);});
    // Explicit breaks match the compact reference; automatic Korean wrapping
    // previously turned '(교육교관)' into two lines and enlarged the row.
    paragraphs(25,['확 인 자\n(교육교관)'],instructorChar.getAttribute('id'),labelPara.getAttribute('id'));
    paragraphs(26,['작업\n책임자'],instructorChar.getAttribute('id'),labelPara.getAttribute('id'));
    paragraphs(33,['교육참석자,\n작업적합성\n평가\n(업무일지\n참조)'],labelChar.getAttribute('id'),labelPara.getAttribute('id'));
    paragraphs(31,[values.leader],25);paragraphs(30,[values.railwayManager],25);
    values.attendees.forEach((person,i)=>{paragraphs(35+i,[person.name],25);paragraphs(45+i,[person.name?checkbox(person.fitness):'□ 적합　□ 부적합'],20);});
    // Signatures/approval remain blank: the generator never fabricates signatures.
    files.set('Contents/section0.xml',encoder.encode(new XMLSerializer().serializeToString(xml)));
    const metadata=parseXml(files.get('Contents/content.hpf'));
    for(const node of metadata.getElementsByTagName('*'))if(node.getAttribute('name')==='ModifiedDate')node.textContent=new Date().toISOString();
    files.set('Contents/content.hpf',encoder.encode(new XMLSerializer().serializeToString(metadata)));
    files.set('Preview/PrvText.txt',encoder.encode(values.previewText));files.delete('Preview/PrvImage.png');
    return writeZip(files);
  }
  window.HwpxBuilder={readZip,writeZip,fill};
})();
