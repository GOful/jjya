from zipfile import ZipFile
from pathlib import Path
from lxml import etree as E
import json
rootdir=Path(__file__).resolve().parents[1]
with ZipFile(rootdir/'assets/tbm-template.hwpx') as z:
 root=E.fromstring(z.read('Contents/section0.xml'));header=E.fromstring(z.read('Contents/header.xml'))
HP='http://www.hancom.co.kr/hwpml/2011/paragraph';tbl=root.find('.//{%s}tbl'%HP)
cells=[];count=int(tbl.get('colCnt'));A=[];b=[]
for i,c in enumerate(tbl.findall('.//{%s}tc'%HP)):
 addr=c.find('{%s}cellAddr'%HP);span=c.find('{%s}cellSpan'%HP);sz=c.find('{%s}cellSz'%HP)
 fill=header.xpath('//*[local-name()="borderFill"][@id="'+c.get('borderFillIDRef')+'"]//*[local-name()="winBrush"]')
 color=fill[0].get('faceColor') if fill else None
 col=int(addr.get('colAddr'));cs=int(span.get('colSpan'));row=int(addr.get('rowAddr'));rs=int(span.get('rowSpan'))
 labels=[''.join(p.itertext()) for p in c.find('{%s}subList'%HP).findall('{%s}p'%HP)]
 cells.append(dict(index=i,row=row,col=col,rowSpan=rs,colSpan=cs,width=int(sz.get('width')),height=int(sz.get('height')),text='\n'.join(labels),background=color if color and color!='none' else 'white'))
 A.append([1 if col<=j<col+cs else 0 for j in range(count)]);b.append(int(sz.get('width')))
# Least squares with a small regularizer handles integer rounding in merged-cell sizes.
M=[[sum(a[i]*a[j] for a in A)+(1e-7 if i==j else 0) for j in range(count)]+[sum(a[i]*v for a,v in zip(A,b))+1e-7*4000] for i in range(count)]
for i in range(count):
 k=max(range(i,count),key=lambda k:abs(M[k][i]));M[i],M[k]=M[k],M[i]
 pivot=M[i][i];M[i]=[v/pivot for v in M[i]]
 for k in range(count):
  if k!=i:
   f=M[k][i];M[k]=[v-f*w for v,w in zip(M[k],M[i])]
widths=[max(1,row[-1]) for row in M];total=sum(widths)
outer=[]
for p in root.findall('{%s}p'%HP):
 if p.find('.//{%s}tbl'%HP) is None:
  text=''.join(p.itertext()).strip()
  if text:outer.append(text)
layout=dict(columns=[round(v/total*100,5) for v in widths],cells=cells,title=outer[0],footer=outer[1:])
(rootdir/'assets/tbm-layout.js').write_text('/* Read from the clean HWPX table: original cells, merges and fills. */\nwindow.TBM_FORM_LAYOUT='+json.dumps(layout,ensure_ascii=False,separators=(',',':'))+';\n')
print('layout generated',len(cells),'cells',count,'columns',outer)
