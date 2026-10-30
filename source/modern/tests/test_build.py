import unittest,sys,json,xml.etree.ElementTree as E
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]));import build
class BuildTests(unittest.TestCase):
 def test_duplicate_command_keys_preserved(self):
  c=build.scenario(build.COURSES/'TestCases/MS-07.properties')
  matches=[x for s in c['steps'] for x in s['commands'] if x['id']=='Act6V1.commands.2']
  self.assertEqual(len(matches),3)
 def test_revisited_group_preserves_order(self):
  c=build.scenario(build.COURSES/'TestCases/CM-09aa.properties')
  self.assertEqual([s['activity'] for s in c['steps']],['1','2','1','3'])
 def test_all_manifests_and_resources(self):
  ns={'p':build.NS}
  def normalize(e):return (e.tag,tuple(sorted(e.attrib.items())),(e.text or '').strip(),tuple(normalize(c) for c in e))
  for source in build.COURSES.glob('*/imsmanifest.xml'):
   with self.subTest(package=source.parent.name):
    a=E.parse(source).getroot();dest=build.OUT/source.parent.name;b=E.parse(dest/'imsmanifest.xml').getroot()
    # Preserve all non-resource manifest content, particularly sequencing and organization IDs.
    self.assertEqual([normalize(c) for c in a if c.tag!='{'+build.NS+'}resources'],[normalize(c) for c in b if c.tag!='{'+build.NS+'}resources'])
    resources=b.findall('p:resources/p:resource',ns);ids={r.get('identifier') for r in resources}
    for r in resources:
     base=r.get(build.XML,'')
     for f in r.findall('p:file',ns):self.assertTrue((dest/base/f.get('href')).is_file(),str(dest/base/f.get('href')))
     for d in r.findall('p:dependency',ns):self.assertIn(d.get('identifierref'),ids)
    for f in dest.rglob('*.htm'):
     text=f.read_text();self.assertNotIn('<object',text.lower());self.assertNotIn('.jar',text);self.assertIn('modernBoot()',text)
 def test_all_data_records_match_source(self):
  inv=json.loads((build.OUT/'inventory.json').read_text());self.assertEqual(len(inv['packages']),189)
  cases=[build.scenario(p) for p in (build.COURSES/'TestCases').glob('*.properties')]
  self.assertEqual(len(cases),188)
  self.assertGreater(sum(len(s['commands']) for c in cases for s in c['steps']),11860)
if __name__=='__main__':unittest.main()
