import {statementNote,financialStatementIndex,financialStatementSource} from './movement-statement.js';

// Preserve phone column widths and navigation; a short literal preview belongs
// inside the existing account/party cell, with the complete statement in details.
const contexts=new Set(['accounts','account','ledger','cash']);
const preview=note=>`<small class="financial-row-party" data-movement-statement data-user-content dir="auto" title="${esc(note)}" style="display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden;white-space:pre-wrap;overflow-wrap:anywhere">${esc(note)}</small>`;
function attachStatements(html,source){
 return html.replace(/(<button\b[^>]*class="home-invoice-party"[^>]*data-action="invoice:(\d+)"[^>]*>)([\s\S]*?)(<\/button>)/g,(whole,open,id,body,close)=>{
  const note=statementNote(source(Number(id)));if(!note)return whole;
  return open+body+preview(note)+close;
 });
}
export function installMovementStatementViews(){
 const originalLedger=ledger;
 ledger=function(){
  const byId=new Map(liveRecords().filter(row=>row.party===selected).map(row=>[row.id,row]));
  return originalLedger().replace(/(<tr\b[^>]*data-action="invoice:(\d+)"[^>]*>)([\s\S]*?)(<\/tr>)/g,(whole,open,id,body,close)=>{
   const note=statementNote(byId.get(Number(id)));if(!note)return whole;
   const cells=body.match(/<td\b[\s\S]*?<\/td>/g);if(!cells||cells.length!==4)return whole;
   cells[2]=cells[2].replace(/<\/td>$/,preview(note)+'</td>');return open+cells.join('')+close;
  });
 };
 const originalRows=rows;
 rows=function(list,description){
  if(view==='account'){
   const visible=liveRecords(),ids=new Set(list.map(row=>row.id));
   for(const row of visible)if(row.kind==='transfer'&&row.to===selected)ids.add(row.id);
   list=visible.filter(row=>ids.has(row.id));
  }
  const html=originalRows(list,description);if(!contexts.has(view))return html;
  const byId=new Map(list.map(row=>[row.id,row])),index=financialStatementIndex(S);
  return attachStatements(html,id=>{const row=byId.get(id);return ['ledger','cash'].includes(view)||view==='accounts'&&accountsTab==='transfers'?row:financialStatementSource(S,row,view==='account'?selected:row?.account,index)});
 };
 const originalMovements=movementTable13;
 movementTable13=function(list,resource){
  if(resource!=='financial')return originalMovements(list,resource);
  // Associate each transfer leg before paging/sorting, including equal account names.
  const html=listMovementBefore(list,resource),index=financialStatementIndex(S),byId=new Map();
  for(const row of list){const group=byId.get(row.r.id)||[];group.push(row);byId.set(row.r.id,group);}
  return boundedTableHtml(attachStatements(html,id=>{const row=byId.get(id)?.shift();return row?financialStatementSource(S,row.r,row.account,index):null}));
 };
}
