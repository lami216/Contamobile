import {validatePartyIdentity} from './business-identity.js';
import {partyOpeningCommand,partyOpeningPermission} from './party-opening-domain.js';

// Desktop main2327 party.create (command/route.ts:681-689,1048): party and
// optional opening are one candidate, committed by the caller once or not at all.
export function createPartyWithOpening(inputState,input,context={}){
 const identity=validatePartyIdentity(inputState,{name:input.name,phone:input.phone,type:input.type}),actor=typeof context.actor==='function'?context.actor():context.actor;
 const can=capability=>context.can?context.can(capability):actor?.role==='owner';
 if(!can(identity.type==='customer'?'customers.create':'suppliers.create'))throw Object.assign(Error('لا تسمح صلاحيات حسابك بهذا الإجراء'),{status:403});
 if(input.opening!==undefined&&(!input.opening||typeof input.opening!=='object'||Array.isArray(input.opening)))throw Error('رصيد البداية غير صالح');
 if(input.opening!==undefined&&!can(partyOpeningPermission()))throw Object.assign(Error('لا تسمح صلاحيات حسابك بإدارة رصيد بداية الأطراف'),{status:403});
 const state=structuredClone(inputState),id=Math.max(0,...state.parties.map(party=>Number(party.id)||0))+1;
 if(!Number.isSafeInteger(id)||id<=0)throw Error('تعذر تخصيص معرّف حساب صالح');
 const party={id,...identity,balance:0,createdAt:context.now||new Date().toISOString()};
 state.parties.push(party);state.opening.parties[id]=0;
 if(input.opening===undefined)return {state,party,record:null};
 const result=partyOpeningCommand(state,{...input.opening,type:'party-opening.post',partyId:id},context);
 return {...result,party:result.state.parties.find(party=>party.id===id)};
}
