"""Require actual execution of every source-declared native JVM test, without skips."""
from pathlib import Path
import json,re,sys,xml.etree.ElementTree as ET

if sys.flags.optimize:raise RuntimeError('Verification assertions must remain enabled')
directory,output=map(Path,sys.argv[1:])
repository=Path(__file__).resolve().parents[1]
source_root=repository/'approved-android/app/src/test/java'
method=re.compile(r'@Test\b(?:\([^)]*\))?\s+public\s+void\s+(\w+)\s*\(')
expected=set();by_class={}
for source in sorted(source_root.rglob('*.java')):
    text=source.read_text('utf-8');names=method.findall(text)
    if not names:continue
    package=re.search(r'^package\s+([\w.]+)\s*;',text,re.M);assert package
    assert len(names)==len(set(names)),source
    classname=package[1]+'.'+source.stem;by_class[classname]=set(names)
    expected.update((classname,name)for name in names)
prefix='mr.alkarna.mobile.approved.'
assert len(by_class.get(prefix+'BootstrapOutcomeTest',()))==7
assert len(by_class.get(prefix+'PhoneEntitlementTest',()))>=8
assert len(by_class.get(prefix+'StandaloneControlPolicyTest',()))>=8,'New signed policy suite is mandatory'
assert len(expected)>=40,'Existing JVM coverage cannot be shortened'
files=sorted(directory.glob('TEST-*.xml'));assert files,'Compilation alone is not execution'
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
actual={(row['class'],row['name'])for row in cases}
assert len(actual)==len(cases)and actual==expected,{'missing':sorted(expected-actual),'unexpected':sorted(actual-expected)}
result={'schema':'alkarna-native-jvm-execution','passed':True,'executed':len(cases),'failed':0,'skipped':0,'sourceCasesExactlyMatched':True,'cases':cases,'scope':'Actual JVM execution only; separate from emulator/physical-phone acceptance'}
for name,key in [('BootstrapOutcomeTest','bootstrapOutcome'),('PhoneEntitlementTest','phoneEntitlement'),('StandaloneControlPolicyTest','standaloneControl')]:
    names=sorted(by_class[prefix+name]);result[key+'Executed']=len(names);result[key+'Cases']=names
output.parent.mkdir(parents=True,exist_ok=True)
output.write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8')
print(json.dumps(result,indent=2))
