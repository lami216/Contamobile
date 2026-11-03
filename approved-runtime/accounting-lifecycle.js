// Archive flags must never hide an outstanding balance. These changes are saved
// in the same transaction as the edit/reversal; financial values stay untouched.
function expose(entity, paymentAccount = false) {
 if (!entity) return false;
 entity.archived = false;
 entity.archivedAt = null;
 if (paymentAccount) entity.active = true;
 return true;
}

export function repairArchivedBalances(state) {
 let changed = false;
 for (const [rows, paymentAccount] of [[state.accounts, true], [state.parties, false]]) {
  for (const entity of rows || []) {
   if (entity.archived && Number.isFinite(entity.balance) && entity.balance !== 0) {
    expose(entity, paymentAccount);
    changed = true;
   }
  }
 }
 return changed;
}

export function reconcileHistoricalArchives(state, record, previous = null, cancelled = false) {
 const records = [record, previous].filter(Boolean);
 const accounts = new Set(records.flatMap(r => [r.account, r.to]).filter(id => id != null));
 const parties = new Set(records.flatMap(r => [r.party, r.otherParty]).filter(id => id != null));
 for (const account of state.accounts || []) {
  if (!accounts.has(account.id)) continue;
  const keptOriginal = !cancelled && previous && ['account', 'to'].some(key =>
   previous[key] === account.id && record[key] === account.id);
  if (keptOriginal && (account.archived || account.active === false) ||
      account.archived && Number.isFinite(account.balance) && account.balance !== 0) expose(account, true);
 }
 for (const party of state.parties || []) {
  if (parties.has(party.id) && party.archived && Number.isFinite(party.balance) && party.balance !== 0) expose(party);
 }
}
