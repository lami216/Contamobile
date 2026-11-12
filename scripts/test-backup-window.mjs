import assert from 'node:assert/strict';
import {snapshotWindowMs,pendingRevisionCount,snapshotDelay} from '../approved-runtime/backup-window.js';
assert.equal(snapshotWindowMs({}),1500);
for(const value of [1500,15000,60000,300000])assert.equal(snapshotWindowMs({snapshotWindowMs:value}),value);
for(const value of [0,-1,1499,1e9,NaN])assert.equal(snapshotWindowMs({snapshotWindowMs:value}),1500);
assert.equal(snapshotDelay(1000,2000,{}),500);assert.equal(snapshotDelay(1000,100000,{}),0);
assert.equal(snapshotDelay(1000,2000,{snapshotWindowMs:60000}),59000);
assert.equal(pendingRevisionCount(12,'8'),4);assert.equal(pendingRevisionCount(8,12),0);assert.equal(pendingRevisionCount(null,12),null);
assert.equal(pendingRevisionCount('invalid',12),null);
// A continuous stream of sales cannot move the first dirty window indefinitely.
for(let now=1000;now<61000;now+=1000)assert.equal(now+snapshotDelay(1000,now,{snapshotWindowMs:60000}),61000);
console.log('PASS backup windows: preserved legacy cadence, bounded explicit windows, pending revisions, and no starvation.');
