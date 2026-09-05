import assert from 'node:assert/strict';
import test from 'node:test';
import { assertMoney, isProductExpired, normalizePartyNet, partyCashDelta, partyNet, sellingPrice, validateSaleDraft } from './accounting';
import type { Product } from './types';

const product=(patch:Partial<Product>={}):Product=>({id:'p1',sku:'1',name:'Test',barcode:'',pieceCost:50,lastPurchaseCost:60,lastPurchaseAt:null,piecePrice:100,wholesalePrice:80,expiryDate:null,note:null,isArchived:false,createdAt:'2026-01-01',updatedAt:'2026-01-01',stocks:{w1:10},...patch});

test('party net and cash direction match desktop semantics',()=>{assert.equal(partyNet({receivable:120,payable:20}),100);assert.deepEqual(normalizePartyNet(-35),{receivable:0,payable:35,net:-35});assert.equal(partyCashDelta('receive',50),-50);assert.equal(partyCashDelta('pay',50),50)});
test('selling tiers never change accounting cost',()=>{const p=product();assert.equal(sellingPrice(p,'retail'),100);assert.equal(sellingPrice(p,'wholesale'),80);assert.equal(sellingPrice(product({wholesalePrice:0}),'wholesale'),100)});
test('product remains sellable through expiry day',()=>{assert.equal(isProductExpired(product({expiryDate:'2026-09-05'}),'2026-09-05'),false);assert.equal(isProductExpired(product({expiryDate:'2026-09-04'}),'2026-09-05'),true)});
test('sale validation catches stock, expiry and below-cost price',()=>{const p=product();const tooMuch=validateSaleDraft([{productId:p.id,quantity:'11',piecePrice:'100'}],[p],'w1','2026-09-05');assert.equal(tooMuch.errors[0]?.code,'insufficientQuantity');const below=validateSaleDraft([{productId:p.id,quantity:'1',piecePrice:'55'}],[p],'w1','2026-09-05');assert.equal(below.warnings[0]?.purchaseCost,60);const expired=validateSaleDraft([{productId:p.id,quantity:'1',piecePrice:'100'}],[product({expiryDate:'2026-09-04'})],'w1','2026-09-05');assert.equal(expired.errors[0]?.code,'expiredProduct')});
test('money is safe integer MRU',()=>{assert.equal(assertMoney(5000),5000);assert.throws(()=>assertMoney(1.5));assert.throws(()=>assertMoney(Number.MAX_SAFE_INTEGER+1))});
