// Demo entities never reuse live products, parties, or payment accounts.
export function addDemoData(original,today){
 if(original.demoBatch)throw Error('البيانات التجريبية مضافة بالفعل');
 const s=structuredClone(original),next=items=>Math.max(0,...items.map(x=>x.id))+1,batch='demo-300-v1',warehouse=s.warehouses[0],otherWarehouse=s.warehouses[1]||warehouse;
 const account={id:next(s.accounts),name:'حساب التجربة',balance:200000,demoBatch:batch};s.accounts.push(account);s.opening.accounts[account.id]=account.balance;
 const products=[];let pid=next(s.products),partyId=next(s.parties),recordId=next(s.records);
 const names=['أرز طويل الحبة','زيت نباتي','سكر أبيض','حليب مجفف','شاي أخضر','قهوة','دقيق','معكرونة','ملح','صابون'];
 for(let i=0;i<20;i++){const p={id:pid++,name:names[i%10]+' — تجريبي '+(i+1),sku:'DEMO-'+(i+1),cost:40+i*5,price:60+i*7,wholesale:55+i*6,stocks:Object.fromEntries(s.warehouses.map(w=>[w,1000])),qty:1000*s.warehouses.length,demoBatch:batch};s.products.push(p);products.push(p);s.opening.stocks[p.id]={...p.stocks}}
 const customers=[],suppliers=[];for(let i=0;i<18;i++){const p={id:partyId++,name:(i<12?'عميل':'مورد')+' تجريبي '+(i<12?i+1:i-11),type:i<12?'customer':'supplier',phone:String(22000000+i),balance:0,demoBatch:batch};s.parties.push(p);(i<12?customers:suppliers).push(p);s.opening.parties[p.id]=0}
 for(let i=0;i<300;i++){const kind=['sale','purchase','expense','receive','pay','stocktransfer','adjustment'][i%7],p=products[i%20],party=kind==='purchase'||kind==='pay'?suppliers[i%6]:customers[i%12],date=new Date(today+'T12:00:00Z');date.setUTCDate(date.getUTCDate()-Math.floor((299-i)/7));const r={id:recordId++,number:'DEMO-'+String(i+1).padStart(4,'0'),kind,date:date.toISOString().slice(0,10),time:String(8+i%12).padStart(2,'0')+':'+String(i%60).padStart(2,'0'),title:kind==='expense'?'مصروف تجريبي '+(i+1):['stocktransfer','adjustment'].includes(kind)?p.name:party.name,subtitle:'بيانات تجريبية',total:0,paid:0,due:0,profit:0,lines:[],note:'معاملة تجريبية لتقييم القوائم والأداء',revision:0,demoBatch:batch};
 if(['sale','purchase'].includes(kind)){const qty=1+i%4,price=kind==='sale'?p.price:p.cost,direction=kind==='sale'?-1:1;r.lines=[{product:p.id,name:p.name,qty,price,costAtSale:p.cost}];r.total=qty*price;r.party=party.id;r.warehouse=warehouse;r.account=account.id;if(i%3===0){r.due=r.total;party.balance+=r.total}else{r.paid=r.total;account.balance+=direction===-1?r.total:-r.total}p.stocks[warehouse]+=direction*qty;if(kind==='sale')r.profit=qty*(price-p.cost)}
 else if(['expense','receive','pay'].includes(kind)){r.total=25+(i%10)*15;r.paid=r.total;r.account=account.id;account.balance+=(kind==='receive'?1:-1)*r.total;if(kind!=='expense'){r.party=party.id;party.balance-=r.total}}
 else if(kind==='stocktransfer'){r.from=warehouse;r.toWarehouse=otherWarehouse;r.lines=[{product:p.id,name:p.name,qty:2,price:p.cost}];r.total=2*p.cost;p.stocks[warehouse]-=2;p.stocks[otherWarehouse]+=2}
 else {r.warehouse=warehouse;r.newQty=p.stocks[warehouse]+2;r.lines=[{product:p.id,name:p.name,qty:2,delta:2,price:p.cost}];r.total=2*p.cost;p.stocks[warehouse]=r.newQty}
 s.records.push(r)}
 for(const p of products)p.qty=Object.values(p.stocks).reduce((n,q)=>n+q,0);
 s.demoBatch={id:batch,createdAt:new Date().toISOString(),records:300};return s;
}
