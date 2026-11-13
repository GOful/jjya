"""Apply HWP table geometry/borders to the clean HWPX, without copying entered text.
Usage: hwp5proc xml sample.hwp > /tmp/sample.xml
       python scripts/adapt_tbm_hwp.py /tmp/sample.xml
Requires pyhwp for the first command and lxml for this script.
"""
from pathlib import Path
from copy import deepcopy
from zipfile import ZipFile, ZIP_STORED
from lxml import etree as E
import sys, runpy
HP='http://www.hancom.co.kr/hwpml/2011/paragraph'
HH='http://www.hancom.co.kr/hwpml/2011/head'
HC='http://www.hancom.co.kr/hwpml/2011/core'
path=Path(__file__).resolve().parents[1]/'assets/tbm-template.hwpx'
source=E.parse(sys.argv[1])
with ZipFile(path) as z: files={n:z.read(n) for n in z.namelist()}
section=E.fromstring(files['Contents/section0.xml']);header=E.fromstring(files['Contents/header.xml'])
cells=section.findall('.//{%s}tc'%HP);incoming=source.findall('.//TableCell')
assert len(cells)==len(incoming)==49
fills=header.find('.//{%s}borderFills'%HH)
# Replace only the fills dedicated to this imported table; keep text style references valid.
# IDs 1–29 belong to the base HWPX styles; imported fills occupy 30 onwards.
for n in list(fills):
    if int(n.get('id'))>=30:fills.remove(n)
base=30
for i,src in enumerate(source.findall('.//BorderFill')):
    node=E.SubElement(fills,'{%s}borderFill'%HH,id=str(base+i),threeD=src.get('effect-3d'),shadow=src.get('effect-shadow'),centerLine='NONE',breakCellSeparateLine='0')
    for name,attr in [('slash','slash'),('backSlash','backslash')]:
        E.SubElement(node,'{%s}%s'%(HH,name),type='CENTER' if src.get(attr)!='0' else 'NONE',Crooked='0',isCounter='0')
    for border in src.findall('Border'):
        name=border.get('attribute-name');tag=name+'Border' if name!='diagonal' else name
        E.SubElement(node,'{%s}%s'%(HH,tag),type=border.get('stroke-type').upper(),width=border.get('width').replace('mm',' mm'),color=border.get('color'))
    fill=src.find('FillColorPattern')
    if fill is not None:
        brush=E.SubElement(node,'{%s}fillBrush'%HC)
        E.SubElement(brush,'{%s}winBrush'%HC,faceColor=fill.get('background-color'),hatchColor=fill.get('pattern-color'),alpha='0')
fills.set('itemCnt',str(len(fills)))
# Dedicated paragraph styles for generated body text. The original HWP uses
# 150% line spacing in the work-plan cell and 160% in the two risk cells.
para_properties=header.find('.//{%s}paraProperties'%HH)
for node in list(para_properties):
    if node.get('id') in ['33','34']:para_properties.remove(node)
for style_id,source_id,spacing in [('33','22','150'),('34','1','160')]:
    style=deepcopy(header.xpath('//*[local-name()="paraPr"][@id="%s"]'%source_id)[0])
    style.set('id',style_id)
    style.xpath('./*[local-name()="align"]')[0].set('horizontal','LEFT')
    for line_spacing in style.xpath('.//*[local-name()="lineSpacing"]'):
        line_spacing.set('type','PERCENT');line_spacing.set('value',spacing)
    for margin in style.xpath('.//*[local-name()="margin"]/*'):
        margin.set('value','0')
    para_properties.append(style)
para_properties.set('itemCnt',str(len(para_properties)))
for cell,src in zip(cells,incoming):
    for tag,mapping in [('cellAddr',{'colAddr':'col','rowAddr':'row'}),('cellSpan',{'colSpan':'colspan','rowSpan':'rowspan'}),('cellSz',{'width':'width','height':'height'}),('cellMargin',{x:'padding-'+x for x in ['left','right','top','bottom']})]:
        node=cell.find('{%s}%s'%(HP,tag))
        for target,key in mapping.items():node.set(target,src.get(key))
    cell.set('borderFillIDRef',str(base+int(src.get('borderfill-id'))-1))
    cell.find('{%s}subList'%HP).set('vertAlign','MIDDLE')
    for line in cell.findall('.//{%s}linesegarray'%HP):line.getparent().remove(line)
# Copy static labels only; never names, dates, work contents, signatures or actions.
for index in [1,2,5,7,8,9,12,13,14,15,16,19,22,25,26,27,28,29,33,34,39,44]:
    texts=cells[index].findall('.//{%s}t'%HP)
    if texts:
        texts[0].text=''.join(incoming[index].itertext()).strip()
        for t in texts[1:]:t.text=''
table=section.find('.//{%s}tbl'%HP);control=source.find('.//TableControl')
size=table.find('{%s}sz'%HP)
for k in ['width','height']:size.set(k,control.get(k))
page=section.find('.//{%s}pagePr'%HP);definition=source.find('.//PageDef')
for k in ['width','height']:page.set(k,definition.get(k))
margin=page.find('{%s}margin'%HP)
for k in ['left','right','top','bottom','header','footer']:
    margin.set(k,definition.get(k+'-offset'))
files['Contents/section0.xml']=E.tostring(section,encoding='UTF-8',xml_declaration=True,standalone=True)
files['Contents/header.xml']=E.tostring(header,encoding='UTF-8',xml_declaration=True,standalone=True)
with ZipFile(path,'w',compression=ZIP_STORED) as z:
    for n,v in files.items():z.writestr(n,v)
runpy.run_path(str(Path(__file__).with_name('generate_tbm_layout.py')))
