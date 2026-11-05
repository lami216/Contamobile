"""Fail release CI if native JVM checks were skipped or only compiled."""
from pathlib import Path
import json,re,sys,xml.etree.ElementTree as ET

directory,output=map(Path,sys.argv[1:])
repository=Path(__file__).resolve().parents[1]
source=repository/'approved-android/app/src/test/java/mr/alkarna/mobile/approved/BootstrapOutcomeTest.java'
expected=re.findall(r'@Test\b(?:\([^)]*\))?\s+public\s+void\s+(\w+)\s*\(',source.read_text(encoding='utf-8'))
assert len(expected)==len(set(expected))==7,'The seven required BootstrapOutcomeTest JVM cases are missing'
files=sorted(directory.glob('TEST-*.xml'))
assert files,'Missing executed JVM test XML; compilation alone is not acceptance'
cases=[]
for filename in files:
    suite=ET.parse(filename).getroot()
    assert suite.tag=='testsuite'
    rows=suite.findall('testcase')
    assert int(suite.get('tests','0'))==len(rows)>0
    for key in ['failures','errors','skipped']:
        assert int(suite.get(key,'0'))==0,(filename,key)
    for row in rows:
        assert not any(row.find(key) is not None for key in ['failure','error','skipped']),(filename,row.get('name'))
        cases.append({'class':row.get('classname',suite.get('name')),'name':row.get('name'),'passed':True})
assert len(cases)>=23 and len({(row['class'],row['name']) for row in cases})==len(cases)
actual=[row['name'] for row in cases if row['class']=='mr.alkarna.mobile.approved.BootstrapOutcomeTest']
assert len(actual)==7 and set(actual)==set(expected),'The new JVM test class did not actually run all seven methods'
result={'schema':'alkarna-native-jvm-execution','passed':True,'executed':len(cases),'failed':0,'skipped':0,'bootstrapOutcomeExecuted':7,'bootstrapOutcomeCases':sorted(actual),'cases':cases,'scope':'JVM native unit execution; distinct from Android instrumentation and physical-phone acceptance'}
output.parent.mkdir(parents=True,exist_ok=True)
output.write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8')
print(json.dumps(result,indent=2))
