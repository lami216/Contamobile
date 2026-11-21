// Test-only adapter: executes the pinned desktop domain source, without its Electron/SQLite shell.
import assert from 'node:assert/strict';
import {readFile,access} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {stripTypeScriptTypes} from 'node:module';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const root=process.env.DESKTOP_862_SOURCE||fileURLToPath(new URL('../../Desktop/',import.meta.url));
const expected={
 'lib/party-opening.ts':'6f41cf877a9204fe049c0ca07045e0b41247b3e0b12abe7a65c152a81e1d8957',
 'lib/expense-categories.ts':'c1ef3bc37c11098e99306d3def0baa94ca94edf1597c78c0e54053d416be3303',
 'app/expense-category-kind.ts':'0e9debb95c898e43875cd19578e22b8bb39533e4db6606493a1ca4edc1cd184f',
};
const source=async file=>(await readFile(path.join(root,file),'utf8')).replaceAll('\r\n','\n');
const url=code=>'data:text/javascript;base64,'+Buffer.from(stripTypeScriptTypes(code,{mode:'transform'})).toString('base64');
export async function desktop862Modules(){
 try{await access(path.join(root,'lib/party-opening.ts'))}catch(error){
  if(process.env.DESKTOP_862_SOURCE)throw error;
  return null;
 }
 for(const [file,digest]of Object.entries(expected))assert.equal(createHash('sha256').update(await source(file)).digest('hex'),digest,'Desktop862 source changed: '+file);
 const balance=url(await source('app/party-balance.ts'));
 const domain=await source('app/domain.ts'),resolve=domain.match(/export function resolvePartyType[\s\S]*?\n}/)?.[0];
 assert(resolve,'Desktop party type resolver not found');
 const role=url(resolve),cost=url(await source('lib/report-commerce.ts')),kind=url(await source('app/expense-category-kind.ts'));
 const opening=(await source('lib/party-opening.ts')).replace('"../app/party-balance.ts"',JSON.stringify(balance)).replace('"../app/domain.ts"',JSON.stringify(role)).replace('"./report-commerce.ts"',JSON.stringify(cost));
 const categories=(await source('lib/expense-categories.ts')).replaceAll('"../app/expense-category-kind.ts"',JSON.stringify(kind));
 return {opening:await import(url(opening)),categories:await import(url(categories))};
}

const clone=value=>structuredClone(value);
const matches=(row,query)=>Object.entries(query||{}).every(([key,value])=>value&&typeof value==='object'&&'$exists'in value?Object.hasOwn(row,key)===value.$exists:row[key]===value);
export function memoryDesktop(initial={}){
 const collections=clone(initial),savepoints=new Map();let failAudit=false;
 const rows=name=>collections[name]??=[];
 const collection=name=>({
  find:(query={})=>({toArray:async()=>clone(rows(name).filter(row=>matches(row,query)))}),
  findOne:async query=>clone(rows(name).find(row=>matches(row,query))||null),
  insertOne:async value=>{if(name==='auditEvents'&&failAudit)throw Error('AUDIT_FAILURE');rows(name).push(clone(value));return{insertedId:value.id}},
  updateOne:async(query,update)=>{const row=rows(name).find(row=>matches(row,query));if(!row)return{matchedCount:0};Object.assign(row,clone(update.$set||{}));for(const key of Object.keys(update.$unset||{}))delete row[key];return{matchedCount:1}},
  deleteOne:async query=>{const index=rows(name).findIndex(row=>matches(row,query));if(index<0)return{deletedCount:0};rows(name).splice(index,1);return{deletedCount:1}},
 });
 const native={inTransaction:true,exec(sql){
  const [command,,point]=sql.trim().split(/\s+/);
  if(command==='SAVEPOINT')savepoints.set(sql.trim().split(/\s+/)[1],clone(collections));
  else if(command==='ROLLBACK'){const saved=savepoints.get(sql.trim().split(/\s+/).at(-1));assert(saved,'Unknown savepoint');for(const key of Object.keys(collections))delete collections[key];Object.assign(collections,clone(saved))}
  else if(command==='RELEASE')savepoints.delete(point);
 },prepare(sql){
  const table=sql.match(/(?:FROM|UPDATE) (parties|documents)/)?.[1];assert(table,'Unhandled desktop test query: '+sql);
  return{get(key){const row=rows(table).find(row=>String(row._id??row.id)===key);return row?{record_key:key,data_json:JSON.stringify(row)}:undefined},run(json,key,previous){const index=rows(table).findIndex(row=>String(row._id??row.id)===key&&JSON.stringify(row)===previous);if(index<0)return{changes:0};rows(table)[index]=JSON.parse(json);return{changes:1}}};
 }};
 return{collection,native,collections,failAudit(value=true){failAudit=value},snapshot:()=>clone(collections)};
}

export function phoneFixture(type='customer',net=0){return{products:[{id:1,name:'Riz',price:12,cost:7,stocks:{A:20},qty:20}],parties:[{id:1,type,name:'Client',phone:'123',balance:net*(type==='supplier'?-1:1)}],accounts:[{id:1,name:'Cash',balance:500}],records:[],opening:{parties:{1:net*(type==='supplier'?-1:1)},accounts:{1:500},stocks:{1:{A:20}}},warehouses:['A'],warehouse:'A',auditEvents:[],expenseCategories:[]};}
export function uiHarness(install,state,lang='ar'){
 let model=clone(state),modal=null,fields={},committed=0;const toasts=[];
 const api={getState:()=>model,replaceState:value=>{model=value},language:()=>lang,actor:{id:'owner',name:'Owner',role:'owner'},can:()=>true,form:()=>fields,getModal:()=>modal,setModal:value=>{modal=value},render(){},money:value=>String(value),boundedTableHtml:html=>html,toast:text=>toasts.push(text),onCommitted(){committed++},modalMarkup:(title,html,action='',label='')=>`<h2>${title}</h2><form id="sheet-form">${html}</form><button data-action="${action}">${label}</button>`};
 const group=install(api);
 return{group,api,toasts,state:()=>model,modal:()=>modal,fields:value=>{fields=value},restore:(value,which)=>{model=clone(value);modal=which},committed:()=>committed};
}
