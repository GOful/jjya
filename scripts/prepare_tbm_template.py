"""Create a clean HWPX form from an uploaded example. Never commit the filled original.
Usage: python scripts/prepare_tbm_template.py /path/to/example.hwpx
"""
import sys
from pathlib import Path
from zipfile import ZipFile, ZIP_STORED
from lxml import etree as E
HP='http://www.hancom.co.kr/hwpml/2011/paragraph'
source=Path(sys.argv[1]);destination=Path(__file__).resolve().parents[1]/'assets/tbm-template.hwpx'
with ZipFile(source) as original:
    files={name:original.read(name) for name in original.namelist()}
root=E.fromstring(files['Contents/section0.xml'])
cells=root.findall('.//{%s}tc'%HP)
assert len(cells)==49,'Unexpected template structure'
# Clear every entered value, retaining all paragraphs, character properties and table geometry.
editable=[0,6,10,11,17,18,20,21,23,24,30,31,32,35,36,37,38,40,41,42,43,45,46,47,48]
for index in editable:
    for paragraph in cells[index].findall('.//{%s}p'%HP):
        for segment in paragraph.findall('{%s}linesegarray'%HP):paragraph.remove(segment)
        for run in paragraph.findall('{%s}run'%HP):
            for child in list(run):
                if E.QName(child).localname not in ['rPr']:run.remove(child)
            E.SubElement(run,'{%s}t'%HP).text=''
    if index in [17,20,23,45,46,47,48]:
        text=cells[index].find('.//{%s}t'%HP);text.text='□ 적합　□ 부적합'
files['Contents/section0.xml']=E.tostring(root,encoding='UTF-8',xml_declaration=True,standalone=True)
metadata=E.fromstring(files['Contents/content.hpf'])
for node in metadata.xpath('//*[local-name()="meta"]'):
    if node.get('name') in ['creator','lastsaveby','CreatedDate','ModifiedDate','date']:
        node.text=''
files['Contents/content.hpf']=E.tostring(metadata,encoding='UTF-8',xml_declaration=True,standalone=True)
settings=E.fromstring(files['settings.xml'])
for node in settings.xpath('//*[local-name()="CaretPosition"]'):
    for name in ['listIDRef','paraIDRef','pos']:node.set(name,'0')
files['settings.xml']=E.tostring(settings,encoding='UTF-8',xml_declaration=True,standalone=True)
# The original image/text preview contains names. Generated files get their own text preview.
files.pop('Preview/PrvImage.png',None)
files['Preview/PrvText.txt']='작업 전 안전교육(TBM) 일지\r\n입력 전 빈 양식'.encode('utf-8')
with ZipFile(destination,'w',compression=ZIP_STORED) as output:
    for name in ['mimetype',*[name for name in files if name!='mimetype']]:
        output.writestr(name,files[name])
print(destination)
