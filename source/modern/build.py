#!/usr/bin/env python3
"""Repackage ADL's original LMS scenarios with a browser-native driver. Stdlib only."""
import json, re, shutil, zipfile, hashlib, subprocess
from pathlib import Path
import xml.etree.ElementTree as ET
ROOT=Path(__file__).resolve().parent
REPO=ROOT.parent
SRC=REPO/'software_development'
COURSES=SRC/'TestSuite/LMSRTE/Courses'
RES=SRC/'resources/org/adl/testsuite/rte/lms/util/resources'
OUT=ROOT/'dist'
NS='http://www.imsglobal.org/xsd/imscp_v1p1'
XML='{http://www.w3.org/XML/1998/namespace}base'

def property_pairs(path):
    result=[]; pending=''
    try: text=path.read_text(encoding='utf-8-sig')
    except UnicodeDecodeError: text=path.read_text(encoding='cp1252')
    for raw in text.splitlines():
        line=pending+raw
        if line.endswith('\\'):
            pending=line[:-1]; continue
        pending=''
        if not line.strip() or line.lstrip().startswith('#'): continue
        key,sep,val=line.partition('=')
        if not sep: raise ValueError(f'{path}: invalid property {line!r}')
        val=re.sub(r'\\u([0-9a-fA-F]{4})', lambda m:chr(int(m[1],16)),val)
        result.append((key.strip(),val))
    if pending: raise ValueError('Unfinished continuation')
    return result

def props(path):
    return dict(property_pairs(path))

def scenario(path):
    groups=[]; meta={}; last=None
    for key,value in property_pairs(path):
        m=re.fullmatch(r'(Act(.+)V\d+)\.(.+)',key)
        if not m: meta[key]=value; continue
        group,act,field=m.groups()
        if group!=last:
            groups.append(dict(key=group,activity=act,commands=[],UIQ='',UIA='',CUI=''))
            last=group
        entry=groups[-1]
        if field.startswith('commands.'):
            command=dict(id=key,raw=value)
            if path.stem=='DMI' and key=='Act3V2.commands.47' and value.startswith('c~INTR~6~CR~0~P!TY.m->'):
                command.update(originalRaw=value,raw='GET->'+value,repair='Missing GET opcode in upstream DMI Act3V2.commands.47; inferred from adjacent GET checks, requires review')
            entry['commands'].append(command)
        elif field in ('UIQ','UIA','CUI'): entry[field]=value
        else: raise ValueError(f'Unsupported scenario field {key}')
    # Java LMSTestCaseGenerator uses file order, including repeated command keys.
    return dict(name=path.stem,meta=meta,steps=groups)

def modernize_html(text):
    # Keep original inline test logic and UI; replace only plugin/runtime scaffolding.
    text=re.sub(r'<object\b.*?</object>', '', text, flags=re.I|re.S)
    text=re.sub(r'</?object\b[^>]*>|<param\b[^>]*>', '', text, flags=re.I)
    text=re.sub(r'<script\b[^>]*\bsrc=["\'][^"\']+["\'][^>]*>.*?</script>', '',text,flags=re.I|re.S)
    text=re.sub(r'onload="[^"]*"','onload="modernBoot()"',text,flags=re.I)
    text=re.sub(r'\s+onunload="[^"]*"','',text,flags=re.I)
    text=text.replace('</head>','<meta charset="utf-8"><script src="../common/data.js"></script><script src="../common/pako.min.js"></script><script src="../common/core.js"></script><script src="../common/bridge.js"></script></head>')
    return text

def main():
    if OUT.exists(): shutil.rmtree(OUT)
    OUT.mkdir()
    cases={p.stem:scenario(p) for p in sorted((COURSES/'TestCases').glob('*.properties'))}
    vocabulary={name:props(RES/(name+'.properties')) for name in ('Commands','Instructions','UserInterface')}
    try: commit=subprocess.check_output(['git','rev-parse','HEAD'],cwd=REPO,text=True,stderr=subprocess.DEVNULL).strip()
    except (subprocess.CalledProcessError,FileNotFoundError): commit=(REPO/'UPSTREAM_COMMIT.txt').read_text().strip()
    inventory=[]
    for manifest in sorted(COURSES.glob('*/imsmanifest.xml')):
        package=manifest.parent.name.removeprefix('LMSTestPackage_')
        case='DDM' if package in ('DDMa','DDMb') else package
        if case not in cases: raise ValueError(f'Missing scenario for {case}')
        dest=OUT/manifest.parent.name; dest.mkdir()
        for prefix,uri in ET.iterparse(manifest,events=['start-ns']):
            if not re.fullmatch(r'ns\d+',prefix): ET.register_namespace(prefix,uri)
        tree=ET.parse(manifest); root=tree.getroot()
        resources=root.find('{'+NS+'}resources'); launches=[]
        for r in list(resources):
            if not r.get('href'):
                resources.remove(r); continue
            # Retain every launch resource and all original organizations/sequencing.
            href=r.get('href'); rel=Path(r.get(XML,''))/href
            launches.append(str(rel))
            source=manifest.parent/rel
            if not source.exists(): source=COURSES/'SCODepot'/Path(href).name
            if not source.exists(): raise FileNotFoundError(source)
            target=dest/rel; target.parent.mkdir(parents=True,exist_ok=True)
            target.write_text(modernize_html(source.read_text()),encoding='utf-8')
            for child in list(r):
                if child.tag in ('{'+NS+'}file','{'+NS+'}dependency'): r.remove(child)
            ET.SubElement(r,'{'+NS+'}file',{'href':href})
            ET.SubElement(r,'{'+NS+'}dependency',{'identifierref':'MODERN_DRIVER'})
        common=dest/'common'; common.mkdir()
        data=dict(case=cases[case],vocabulary=vocabulary,sourceCommit=commit,portVersion='0.1.0-experimental')
        (common/'data.js').write_text('window.ADL_DATA='+json.dumps(data,ensure_ascii=True)+';\n')
        for name in ('core.js','bridge.js','pako.min.js'): shutil.copyfile(ROOT/name,common/name)
        (dest/'includes').mkdir()
        shutil.copyfile(COURSES/'includes/LMSTestContentPackages_style.css',dest/'includes/LMSTestContentPackages_style.css')
        dep=ET.SubElement(resources,'{'+NS+'}resource',{'identifier':'MODERN_DRIVER','type':'webcontent','{http://www.adlnet.org/xsd/adlcp_v1p3}scormType':'asset'})
        for f in sorted(dest.rglob('*')):
            if f.is_file() and str(f.relative_to(dest)) not in launches:
                ET.SubElement(dep,'{'+NS+'}file',{'href':f.relative_to(dest).as_posix()})
        # All local schema dependencies, including includes/imports, are shipped.
        for schema in (SRC/'xml/xsd').rglob('*'):
            if schema.is_file():
                target=dest/schema.relative_to(SRC/'xml/xsd');target.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(schema,target)
        tree.write(dest/'imsmanifest.xml',encoding='utf-8',xml_declaration=True)
        shutil.copyfile(ROOT/'NOTICE.txt',dest/'NOTICE.txt')
        shutil.copyfile(ROOT/'LICENSE',dest/'LICENSE')
        shutil.copyfile(ROOT/'LICENSE-pako',dest/'LICENSE-pako')
        zpath=OUT/(dest.name+'_modern.zip')
        with zipfile.ZipFile(zpath,'w',zipfile.ZIP_DEFLATED) as z:
            for f in sorted(dest.rglob('*')):
                if f.is_file():z.write(f,f.relative_to(dest))
        inventory.append(dict(package=package,scenario=case,file=zpath.name,steps=len(data['case']['steps']),commands=sum(len(s['commands']) for s in data['case']['steps']),source_manifest_sha256=hashlib.sha256(manifest.read_bytes()).hexdigest(),sha256=hashlib.sha256(zpath.read_bytes()).hexdigest()))
    (OUT/'inventory.json').write_text(json.dumps(dict(sourceCommit=commit,packages=inventory),indent=2))
    print(json.dumps(dict(packages=len(inventory),steps=sum(p['steps'] for p in inventory),commands=sum(p['commands'] for p in inventory))))
if __name__=='__main__': main()
