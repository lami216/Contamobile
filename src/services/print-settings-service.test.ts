import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizePrintSettings, printFileLayout } from './print-settings-service';
import { DEFAULT_INVOICE_BRANDING, validateInvoiceBranding } from './branding-service';

test('print settings keep supported desktop-equivalent profiles and fall back to A4',()=>{
  assert.equal(normalizePrintSettings({profile:'thermal80'}).profile,'thermal80');
  assert.equal(normalizePrintSettings({profile:'thermal58'}).profile,'thermal58');
  assert.equal(normalizePrintSettings({profile:'unknown'}).profile,'a4');
  assert.equal(normalizePrintSettings(null).profile,'a4');
});

test('thermal PDF page widths match 80mm and 58mm at 72 PPI',()=>{
  assert.equal(printFileLayout('thermal80',2).width,227);
  assert.equal(printFileLayout('thermal58',2).width,164);
  assert.equal(printFileLayout('a4',2).width,595);
  assert.ok(printFileLayout('thermal80',20).height>printFileLayout('thermal80',2).height);
});

test('invoice branding accepts a bounded inline logo and keeps backwards-compatible empty logo',()=>{
  const empty=validateInvoiceBranding(DEFAULT_INVOICE_BRANDING);
  assert.equal(empty.storeLogoDataUrl,'');
  const logo='data:image/png;base64,AAAA';
  const branded=validateInvoiceBranding({...DEFAULT_INVOICE_BRANDING,storeLogoDataUrl:logo});
  assert.equal(branded.storeLogoDataUrl,logo);
  assert.throws(()=>validateInvoiceBranding({...DEFAULT_INVOICE_BRANDING,storeLogoDataUrl:'https://example.com/logo.png'}));
});
