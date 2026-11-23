// Read-only Desktop 0.1.30 party-ledger projection. The source report owns the
// displayed historical effect; a different legacy void rule grants no rights.
const finiteLegacyNumber=value=>{const n=Number(value);return Number.isFinite(n)?n:null;};
function legacyVoidDelta(document){
 const explicit=finiteLegacyNumber(document.partyBalanceDelta);if(explicit!==null)return explicit;
 const before=finiteLegacyNumber(document.partyBalanceBefore),after=finiteLegacyNumber(document.partyBalanceAfter);if(before!==null&&after!==null)return after-before;
 const receivable=finiteLegacyNumber(document.settledReceivable),payable=finiteLegacyNumber(document.settledPayable);
 if((receivable??0)!==0||(payable??0)!==0)return -(receivable??0)+(payable??0);
 const amount=finiteLegacyNumber(document.cashAmount??document.paidTotal??document.total)??0,title=typeof document.title==='string'?document.title.trim():'';
 if(/استلام|دفع لنا|الطرف دفع لنا/.test(title))return -amount;
 if(/دفع للطرف|دفع لل|نحن دفعنا|صرف/.test(title))return amount;
 return null;
}
export function historicalSettlementProjection(document){
 if(document?.kind!=='settlement')return null;
 try{
  const explicit=Number(document.partyBalanceDelta),hasExplicit=Number.isFinite(explicit);
  const delta=hasExplicit?Number(document.partyBalanceDelta??0):(String(document.title).includes('دفع لنا')?-1:1)*Number(document.total??0);
  if(!Number.isFinite(delta)||Math.abs(delta)>1e14)return null;
  const lifecycleDelta=legacyVoidDelta(document);
  return {version:1,partyBalanceDelta:delta,basis:hasExplicit?'explicit':'report-title',lifecycleDelta,
   conflictsWithLifecycle:lifecycleDelta===null||lifecycleDelta!==delta};
 }catch{return null;}
}
