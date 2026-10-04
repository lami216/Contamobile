"""Exercise the installed release through Android UI, then capture native screens.

Fixtures are created only in the disposable CI emulator using the real forms.
No test data or test runtime is embedded in the shipped application.
"""
from pathlib import Path
import subprocess,time,re,json,xml.etree.ElementTree as ET

out=Path('release-output/screenshots');out.mkdir(parents=True,exist_ok=True)
package='mr.alkarna.mobile.golden'
last_field=''

def visible_bottom(tree):
 # Match the emulator's observed IME area and leave the system navigation untapped.
 keyboard=[bounds(n)[1] for n in tree.iter('node') if 'inputmethod' in n.get('package','') and bounds(n)[2]-bounds(n)[0]>600 and bounds(n)[3]-bounds(n)[1]>300 and bounds(n)[1]>400]
 return min([2190,*keyboard])

def scroll_area(tree):
 parents={child:parent for parent in tree.iter('node') for child in parent}
 fields=[n for n in tree.iter('node') if n.get('package')==package and n.get('class','').endswith('EditText') and (n.get('focused')=='true' or n.get('content-desc')==last_field)]
 for field_node in fields:
  current=parents.get(field_node)
  while current is not None:
   if current.get('scrollable')=='true' and bounds(current)[3]-bounds(current)[1]>180:return current
   current=parents.get(current)
 areas=[n for n in tree.iter('node') if n.get('package')==package and n.get('scrollable')=='true' and not n.get('class','').endswith('EditText') and bounds(n)[3]-bounds(n)[1]>180]
 return areas[-1] if areas else None
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
  tree=ui()
  bottom=visible_bottom(tree)
  nodes=[n for n in tree.iter('node') if (n.get('content-desc')==text or n.get('text')==text) and (not editable or n.get('class','').endswith('EditText')) and bounds(n)[3]>bounds(n)[1] and (bounds(n)[1]+bounds(n)[3])//2<bottom]
  if nodes:return nodes[0]
  partial=[n for n in tree.iter('node') if text in (n.get('content-desc','') or n.get('text','')) and (not editable or n.get('class','').endswith('EditText')) and bounds(n)[3]>bounds(n)[1] and (bounds(n)[1]+bounds(n)[3])//2<bottom]
  if partial:return partial[0]
  if attempt<scrolls:
   # Blur through a visible noninteractive form label, as a user taps outside.
   # BACK can close a native modal; dragging inside EditText can move its caret.
   labels=[n for n in tree.iter('node') if n.get('package')==package and n.get('class','').endswith('TextView') and n.get('text')==last_field and bounds(n)[3]>bounds(n)[1] and bounds(n)[3]<bottom]
   if bottom<2190 and labels:
    tap(labels[0]);time.sleep(.7);tree=ui();bottom=visible_bottom(tree)
   area=scroll_area(tree)
   if area is None:break
   x1,y1,x2,y2=bounds(area);x=x1+20;y2=min(y2,bottom-15)
   if y2-y1<160:break
   adb('shell','input','swipe',str(x),str(y2-65),str(x),str(y1+65),'450');time.sleep(.7)
 raise ValueError('UI element missing: '+text+'; visible fields: '+str([(n.get('class'),n.get('text'),n.get('content-desc')) for n in ui().iter('node') if n.get('class','').endswith('EditText')]))
def click(text,scrolls=0):tap(find(text,scrolls=scrolls))
def field(label,value,scrolls=0):
 global last_field
 for attempt in range(3):
  target=find(label,editable=True,scrolls=scrolls)
  if target.get('focused')!='true':tap(target);time.sleep(1)
  target=find(label,editable=True)
  if target.get('focused')!='true':
   time.sleep(.6);continue
  adb('shell','input','keyevent','123')
  adb('shell','input','keyevent',*(['67']*40))
  adb('shell','input','text',value.replace(' ','%s'));time.sleep(.8)
  actual=find(label,editable=True).get('text','')
  if actual==value:
   last_field=label;print('Verified field: '+label+' = '+value);return
 raise ValueError('Could not focus and set field '+label+' to '+value+'; actual: '+str([(n.get('content-desc'),n.get('text'),n.get('focused')) for n in ui().iter('node') if n.get('class','').endswith('EditText')]))
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
 route('inventory/products');click('إضافة');time.sleep(1)
 field('الاسم','QA Rice');capture('product-editor-with-keyboard')
 field('سعر الشراء','100',3);field('سعر البيع','150',2);field('سعر الجملة','140',2)
 field('الكمية','20',5);click('حفظ',4);time.sleep(2)
 route('inventory/products');capture('products-populated');click('QA Rice');capture('product-detail');adb('shell','input','keyevent','4')
def customer():
 route('parties/customers');click('عميل جديد');time.sleep(1)
 field('الاسم','QA Customer');field('الهاتف','22112211');capture('customer-editor-with-keyboard');click('حفظ',3);time.sleep(2)
 route('parties/customers');capture('customers-populated');click('QA Customer');capture('party-ledger');click('استلام',3);capture('party-cash-form');adb('shell','input','keyevent','4')
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
