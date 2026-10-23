import test from 'node:test';
import assert from 'node:assert/strict';
import {demo} from './helpers/server.js';

test('SQLite persistence, QR, PayID, PayTo, masking, failures and reconciliation',async t=>{
 const app=await demo();t.after(()=>app.close());await app.admin();
 const invalid=await app.api('/api/transactions','POST',{merchantId:'salon',itemIndex:0,method:'payid',phone:'+611234'});assert.equal(invalid.status,400);
 const created=await app.api('/api/transactions','POST',{merchantId:'salon',itemIndex:0,method:'payid',phone:'+61412345678'});assert.equal(created.status,201);
 const tx=created.data;assert.equal(tx.amount,65);assert.ok(!JSON.stringify(tx).includes('412345678'));
 const svg=await app.request(tx.qrSvgUrl).then(r=>r.text());assert.ok(svg.startsWith('<svg'));assert.ok(svg.includes('<rect'));
 const scanned=await app.api('/api/public/'+tx.qrToken);assert.equal(scanned.data.reference,tx.reference);assert.ok(!JSON.stringify(scanned.data).includes('412345678'));
 const action=async name=>app.api(`/api/transactions/${tx.id}/action`,'POST',{action:name});
 assert.equal((await action('start')).data.status,'AWAITING_AUTH');
 assert.equal((await action('authorise')).data.status,'PROCESSING');
 const unknown=await action('timeout');assert.equal(unknown.data.status,'UNKNOWN');assert.equal(unknown.data.receipt,'NOT_POSTED');
 const confirmed=await action('confirm');assert.equal(confirmed.data.status,'CONFIRMED');assert.equal(confirmed.data.receipt,'POSTED');
 assert.equal((await action('confirm')).status,400);
 assert.equal((await app.api(`/api/transactions/${tx.id}/reconcile`,'POST')).data.settlement,'RECONCILED');
 const inspect=await app.api(`/api/transactions/${tx.id}/inspect`);assert.equal(inspect.data.EndToEndId,tx.reference);assert.equal(inspect.data.IntrBkSttlmAmt.currency,'AUD');assert.ok(inspect.data.TxId.startsWith('SIM-'));
 const payto=await app.api('/api/transactions','POST',{merchantId:'gym',itemIndex:0,method:'payto',phone:'+61412345679'});
 const id=payto.data.id,advance=async action=>app.api(`/api/transactions/${id}/action`,'POST',{action});
 await advance('start');const authorised=await advance('authorise');assert.equal(authorised.data.status,'AGREEMENT_AUTHORISED');assert.equal(authorised.data.receipt,'NOT_POSTED');
 await advance('collect');const failed=await advance('bank-failure');assert.equal(failed.data.status,'FAILED');assert.equal(failed.data.receipt,'NOT_POSTED');
 assert.equal((await app.api('/api/insights?merchantId=gym')).data.revenue,0);
 const dashboard=await app.api('/api/merchant-dashboard?merchantId=salon');assert.equal(dashboard.status,200);assert.equal(dashboard.data.lifetime.confirmed,1);assert.equal(dashboard.data.lifetime.revenue,65);assert.equal(dashboard.data.products.find(x=>x.units===1).units,1);assert.equal(dashboard.data.transactions[0].status,'CONFIRMED');assert.ok(!JSON.stringify(dashboard.data).includes('412345678'));
 assert.equal((await app.api('/api/merchant-dashboard?merchantId=missing')).status,400);
 await app.stop();await app.start();const persisted=await app.api('/api/transactions/'+tx.id);assert.equal(persisted.data.status,'CONFIRMED');assert.equal(persisted.data.settlement,'RECONCILED');
});
