"""Fail release CI if native JVM checks were skipped or only compiled."""
from pathlib import Path
import json,re,sys,xml.etree.ElementTree as ET

directory,output=map(Path,sys.argv[1:])
repository=Path(__file__).resolve().parents[1]
source=repository/'approved-android/app/src/test/java/mr/alkarna/mobile/approved/BootstrapOutcomeTest.java'
expected=re.findall(r'@Test\b(?:\([^)]*\))?\s+public\s+void\s+(\w+)\s*\(',source.read_text(encoding='utf-8'))
assert len(expected)==len(set(expected))==7,'The seven required BootstrapOutcomeTest JVM cases are missing'
phone_source=repository/'approved-android/app/src/test/java/mr/alkarna/mobile/approved/PhoneEntitlementTest.java'
phone_expected=re.findall(r'@Test\b(?:\([^)]*\))?\s+public\s+void\s+(\w+)\s*\(',phone_source.read_text(encoding='utf-8'))
assert len(phone_expected)==len(set(phone_expected))==8,'The eight required customer-phone entitlement JVM cases are missing'
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
assert len(cases)>=32 and len({(row['class'],row['name']) for row in cases})==len(cases)
actual=[row['name'] for row in cases if row['class']=='mr.alkarna.mobile.approved.BootstrapOutcomeTest']
assert len(actual)==7 and set(actual)==set(expected),'The new JVM test class did not actually run all seven methods'
phone_actual=[row['name'] for row in cases if row['class']=='mr.alkarna.mobile.approved.PhoneEntitlementTest']
assert len(phone_actual)==8 and set(phone_actual)==set(phone_expected),'The customer phone entitlement JVM tests did not actually execute every required case'
result={'schema':'alkarna-native-jvm-execution','passed':True,'executed':len(cases),'failed':0,'skipped':0,'bootstrapOutcomeExecuted':7,'bootstrapOutcomeCases':sorted(actual),'cases':cases,'scope':'JVM native unit execution; distinct from Android instrumentation and physical-phone acceptance'}
result.update(phoneEntitlementExecuted=8,phoneEntitlementCases=sorted(phone_actual))
access_source=repository/'approved-android/app/src/test/java/mr/alkarna/mobile/approved/AccountProtocolTest.java'
access_expected=re.findall(r'@Test\b(?:\([^)]*\))?\s+public\s+void\s+(\w+)\s*\(',access_source.read_text(encoding='utf-8'))
assert len(access_expected)==len(set(access_expected))==5,'The five required dual-access protocol JVM cases are missing'
access_actual=[row['name'] for row in cases if row['class']=='mr.alkarna.mobile.approved.AccountProtocolTest']
assert len(access_actual)==5 and set(access_actual)==set(access_expected),'The dual-access proof and server-vector cases did not all execute'
result.update(accountProtocolExecuted=5,accountProtocolCases=sorted(access_actual))
numbers_actual=[row['name'] for row in cases if row['class']=='mr.alkarna.mobile.approved.ProtocolNumbersTest']
assert set(numbers_actual)=={'finiteNumbersMatchNodeJsonAndPayloadHashes','nonfiniteAndUnsafeNumbersFailBeforeHashing'},'Node/Java financial numeric interoperability checks did not both execute'
result.update(protocolNumbersExecuted=2,protocolNumbersCases=sorted(numbers_actual))
output.parent.mkdir(parents=True,exist_ok=True)
output.write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8')
print(json.dumps(result,indent=2))
