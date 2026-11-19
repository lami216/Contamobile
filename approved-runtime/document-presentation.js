import {isStockSettlementDocument,validSettlementSequence} from './stock-settlement.js';

// Display numbers never replace canonical identities or the stored reference.
export function recordReference(record){return String(record.number||String(record.kind||'document').toUpperCase()+'-'+record.id);}
export function recordNumber(record){return isStockSettlementDocument(record)&&validSettlementSequence(record.settlementSequence)?String(record.settlementSequence):recordReference(record);}
