import {saleFacts,profitSummary,documentCommerceSummary} from './commerce-facts.js';
// Read-only adapter for offline-conta/app/party-metrics.ts; balances retain their stored meaning.
const numeric=value=>{const number=Number(value??0);return Number.isFinite(number)?number:0};
const round=value=>Math.round((value+Number.EPSILON)*100)/100;
export function effectivePartyRecord(record){return !record.voided&&!record.reversed&&!record.isReversal&&(!record.status||record.status==='posted')}
export function partyNetBalance(party){return numeric(party.balance)*(party.type==='supplier'?-1:1)}
export function historicalPartyProfit(record){
 if(record.profit!=null&&Number.isFinite(Number(record.profit)))return Number(record.profit);
 return (record.lines||[]).reduce((total,line)=>total+numeric(line.grossProfit),0);
}
export function partyRecordMetric(record,key,type,state){
 if(!effectivePartyRecord(record))return 0;
 if(key==='trade')return type==='customer'?(['sale','return'].includes(record.kind)?numeric(record.total)*(record.kind==='return'?-1:1):0):record.kind==='purchase'?numeric(record.total):0;
 if(key==='profit'&&state&&type==='customer'&&['sale','return'].includes(record.kind)){const summary=state.partyProfitFacts?.get(record.id)||documentCommerceSummary(state,record);return summary.costKnown?summary.profit:null;}
 if(key==='profit')return type==='customer'&&['sale','return'].includes(record.kind)?historicalPartyProfit(record)*(record.kind==='return'?-1:1):0;
 if(key==='invoiceCount')return type==='supplier'&&record.kind==='purchase'?1:0;
 if(key==='cashIn')return record.kind==='sale'?numeric(record.paid):record.kind==='receive'?numeric(record.total):0;
 if(key==='cashOut')return ['purchase','return'].includes(record.kind)?numeric(record.paid):record.kind==='pay'?numeric(record.total):0;
 return 0;
}
function profitContext(state){
 const context={products:[],parties:[],warehouses:[],records:[],...state},byDocument=new Map();
 for(const fact of saleFacts(context)){const list=byDocument.get(fact.documentId)||[];list.push(fact);byDocument.set(fact.documentId,list);}
 context.partyProfitFacts=new Map([...byDocument].map(([id,facts])=>[id,profitSummary(facts)]));return context;
}
export function partyFinancialSummary(state,type,partyId=null){
 state=profitContext(state);
 const parties=state.parties.filter(p=>p.type===type&&(partyId===null?!p.archived:p.id===partyId));
 const ids=new Set(parties.map(p=>p.id)),keys=['trade','profit','cashIn','cashOut','invoiceCount'];
 const values={trade:0,profit:0,cashIn:0,cashOut:0,invoiceCount:0,receivable:0,payable:0};
 for(const party of parties){const net=partyNetBalance(party);values.receivable+=Math.max(0,net);values.payable+=Math.max(0,-net)}
 for(const record of state.records){if(!ids.has(record.party)||!effectivePartyRecord(record))continue;for(const key of keys){const value=partyRecordMetric(record,key,type,state);values[key]=value===null||values[key]===null?null:values[key]+value}}
 for(const key of Object.keys(values))values[key]=values[key]===null?null:round(values[key]);
 return {type,partyId,parties,values};
}
export function partyMetricContributions(state,summary,key){
 state=profitContext(state);
 if(key==='receivable'||key==='payable')return summary.parties.map(p=>({party:p,value:round(Math.max(0,partyNetBalance(p)*(key==='payable'?-1:1)))})).filter(row=>row.value!==0);
 const ids=new Set(summary.parties.map(p=>p.id));return state.records.filter(r=>ids.has(r.party)&&effectivePartyRecord(r)).map(record=>({record,value:partyRecordMetric(record,key,summary.type,state)===null?null:round(partyRecordMetric(record,key,summary.type,state))})).filter(row=>row.value!==0);
}
