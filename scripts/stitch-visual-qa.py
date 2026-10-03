"""Exercise the installed release through Android UI, then capture native screens.

Fixtures are created only in the disposable CI emulator using the real forms.
No test data or test runtime is embedded in the shipped application.
"""
from pathlib import Path
import subprocess,time,re,json,xml.etree.ElementTree as ET

out=Path('release-output/screenshots');out.mkdir(parents=True,exist_ok=True)
package='mr.alkarna.mobile.golden'
def adb(*args):return subprocess.check_output(['adb',*args],timeout=40)
def ui():
 adb('shell','uiautomator','dump','/sdcard/stitch-qa.xml')
 return ET.fromstring(adb('shell','cat','/sdcard/stitch-qa.xml').decode('utf-8'))
def bounds(node):
 x1,y1,x2,y2=map(int,re.findall(r'\d+',node.get('bounds','[0,0][0,0]')))
 return x1,y1,x2,y2
def tap(node):
 x1,y1,x2,y2=bounds(node)
 if x2<=x1 or y2<=y1:raise ValueError('Element is offscreen')
 adb('shell','input','tap',str((x1+x2)//2),str((y1+y2)//2));time.sleep(.5)
def find(text,editable=False,scrolls=0):
 for attempt in range(scrolls+1):
  nodes=[n for n in ui().iter('node') if (n.get('content-desc')==text or n.get('text')==text) and (not editable or n.get('class','').endswith('EditText')) and bounds(n)[3]>bounds(n)[1]]
  if nodes:return nodes[0]
  partial=[n for n in ui().iter('node') if text in (n.get('content-desc','') or n.get('text','')) and (not editable or n.get('class','').endswith('EditText')) and bounds(n)[3]>bounds(n)[1]]
  if partial:return partial[0]
  if attempt<scrolls:adb('shell','input','swipe','540','1850','540','650','350');time.sleep(.4)
 raise ValueError('UI element missing: '+text+'; visible fields: '+str([(n.get('class'),n.get('text'),n.get('content-desc')) for n in ui().iter('node') if n.get('class','').endswith('EditText')]))
def click(text,scrolls=0):tap(find(text,scrolls=scrolls))
def field(label,value,scrolls=0):
 tap(find(label,editable=True,scrolls=scrolls))
 adb('shell','input','keyevent','123')
 # Values in the fixture are ASCII; long press/select-all is avoided by clearing a bounded draft.
 adb('shell','input','keyevent',*(['67']*24))
 adb('shell','input','text',value.replace(' ','%s'))
 hide_keyboard();time.sleep(.3)
def hide_keyboard():
 # BACK closes a modal when the IME is already hidden; only dismiss an observed keyboard.
 if any('inputmethod' in n.get('package','') for n in ui().iter('node')):adb('shell','input','keyevent','4')
def route(path):
 adb('shell','am','start','-W','-a','android.intent.action.VIEW','-d','alkarna://'+path,package);time.sleep(2)
def capture(name):
 (out/(name+'.png')).write_bytes(adb('exec-out','screencap','-p'))
 (out/(name+'.xml')).write_bytes(ET.tostring(ui(),encoding='utf-8'))
 adb('shell','pidof',package)

results=[]
def scenario(name,action):
 try:action();results.append({'scenario':name,'status':'passed'})
 except Exception as e:
  capture('failure-'+name);results.append({'scenario':name,'status':'failed','error':str(e)})
  adb('shell','input','keyevent','4');time.sleep(.4)

def product():
 route('inventory/products');click('إضافة');time.sleep(1);hide_keyboard()
 field('الاسم','QA Rice')
 field('سعر الشراء','100',3);field('سعر البيع','150',2);field('سعر الجملة','140',2)
 field('الكمية','20',5);click('حفظ',4);time.sleep(2)
 route('inventory/products');capture('products-populated');click('QA Rice');capture('product-detail');adb('shell','input','keyevent','4')
def customer():
 route('parties/customers');click('عميل جديد');time.sleep(1);hide_keyboard()
 field('الاسم','QA Customer');field('الهاتف','22112211');click('حفظ');time.sleep(2)
 route('parties/customers');capture('customers-populated');click('QA Customer');capture('party-ledger');click('استلام');capture('party-cash-form');adb('shell','input','keyevent','4')
def deposit():
 route('more/accounts?tab=adjustments');field('المبلغ','10000',3);click('تأكيد',3);time.sleep(2);capture('account-deposit-posted')
def sale():
 route('sales/pos');click('إضافة منتج');time.sleep(1);click('QA Rice');click('تم');time.sleep(1);capture('pos-filled');click('إتمام البيع',5);time.sleep(3);find('تم البيع بنجاح');capture('sale-posted')

scenario('create-product',product)
scenario('create-customer',customer)
scenario('deposit',deposit)
scenario('sale',sale)
routes=[('home',''),('sales-hub','sales'),('inventory-hub','inventory'),('parties-hub','parties'),('more-hub','more'),('products','inventory/products'),('stock-audit','inventory/stock'),('warehouses','inventory/warehouses'),('stock-transfer','inventory/transfer'),('stock-adjustment','inventory/adjustment'),('pos-invoice','sales/pos'),('purchase-invoice','sales/purchases'),('expenses','sales/expenses'),('records','sales/records'),('customers','parties/customers'),('suppliers','parties/suppliers'),('accounts','more/accounts'),('financial-transfers','more/accounts?tab=transfers'),('capital-adjustments','more/accounts?tab=adjustments'),('reports','more/reports'),('settings','more/settings'),('branding','more/branding'),('users','more/users')]
for name,path in routes:scenario(name,lambda n=name,p=path:(route(p),capture(n)))
def french():
 route('more/settings');click('Français');route('');capture('home-french');route('more/settings');click('العربية')
scenario('french-ltr',french)
route('');capture('home-final')
Path('release-output/ui-scenarios.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(results,ensure_ascii=False))
if any(r['status']=='failed' for r in results):raise SystemExit('Native UI verification has failed scenarios; inspect screenshots and XML.')
