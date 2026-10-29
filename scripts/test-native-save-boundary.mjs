import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../approved-android/app/src/main/java/mr/alkarna/mobile/approved/MainActivity.java',import.meta.url),'utf8');
const backLine=source.split('\n').find(line=>line.includes('@Override public void onBackPressed'));
const backMatch=backLine?.match(/web\.evaluateJavascript\("((?:\\.|[^"\\])*)",handled/);
assert(backMatch,'Native Back callback script is required');
const back=JSON.parse('"'+backMatch[1]+'"');
const activationMatch=source.match(/web\.evaluateJavascript\("((?:\\.|[^"\\])*)",ready->/);
assert(activationMatch,'Native activation callback script is required');
const activation=JSON.parse('"'+activationMatch[1]+'"');
function runBack(values){const calls=[],{pending=false,window={},...rest}=values;const result=vm.runInNewContext(back,{modal:null,view:'home',window:{karnaPersistenceBusy:()=>pending,...window},act:action=>calls.push(action),...rest});return {result,calls};}

test('hardware Back handles a pending save without navigating home or closing a modal',()=>{
 for(const values of [{pending:true},{pending:true,modal:'sale'},{pending:true,view:'inventory'}])assert.deepEqual(runBack(values),{result:true,calls:[]});
});
test('completed saves preserve existing modal, view and home Back behavior',()=>{
 assert.deepEqual(runBack({pending:false,modal:'sale'}),{result:true,calls:['close']});
 assert.deepEqual(runBack({pending:false,view:'inventory'}),{result:true,calls:['back']});
 assert.deepEqual(runBack({pending:false}),{result:false,calls:[]});
 assert.deepEqual(runBack({pending:false,window:{karnaBeforeExit:()=>true}}),{result:true,calls:[]});
});
test('license activation navigation waits for a pending save and checkpoints the draft afterward',()=>{
 let drafts=0;assert.equal(vm.runInNewContext(activation,{window:{karnaPersistenceBusy:()=>true,karnaSavePosDraft:()=>drafts++}}),false);assert.equal(drafts,0);
 assert.equal(vm.runInNewContext(activation,{window:{karnaPersistenceBusy:()=>false,karnaSavePosDraft:()=>drafts++}}),true);assert.equal(drafts,1);
 assert.equal(vm.runInNewContext(activation,{window:{}}),true);
});
