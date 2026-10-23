import test from 'node:test';
import assert from 'node:assert/strict';
import {demo} from './helpers/server.js';

test('merchant isolation, operator controls, public capability boundary and logout',async t=>{
 const app=await demo();t.after(()=>app.close());
 for(const route of ['/api/transactions?merchantId=salon','/api/merchant-dashboard?merchantId=salon','/api/insights?merchantId=salon','/api/events?merchantId=salon'])assert.equal((await app.request(route)).status,401);
 const salon=await app.merchant('salon'),gym=await app.merchant('gym');
 assert.deepEqual((await app.api('/api/access','GET',undefined,salon)).data,{role:'merchant',merchantIds:['salon']});
 const created=await app.api('/api/transactions','POST',{merchantId:'salon',itemIndex:0,method:'payid'},salon);assert.equal(created.status,201);const tx=created.data;
 for(const suffix of ['','/inspect'])assert.equal((await app.api('/api/transactions/'+tx.id+suffix,'GET',undefined,gym)).status,403);
 for(const endpoint of ['merchant-dashboard','insights','transactions','events'])assert.equal((await app.request('/api/'+endpoint+'?merchantId=salon',{auth:gym})).status,403);
 assert.equal((await app.api('/api/transactions','POST',{merchantId:'gym',method:'payto'},salon)).status,403);
 for(const [suffix,body] of [['/action',{action:'confirm'}],['/reconcile',undefined]])assert.equal((await app.api('/api/transactions/'+tx.id+suffix,'POST',body,salon)).status,403);
 assert.equal((await app.api('/api/public/'+tx.qrToken+'/action','POST',{action:'confirm'},'')).status,403);
 const identity=await app.api('/api/public/'+tx.qrToken+'/identity','POST',{identityType:'email',identity:'fictional@example.com'},'');assert.equal(identity.status,200);
 assert.ok(!('id' in identity.data));assert.ok(!('phoneMasked' in identity.data));assert.ok(!JSON.stringify(identity.data).includes('fictional'));
 assert.equal((await app.api('/api/public/'+tx.qrToken+'/action','POST',{action:'start'},'')).data.status,'AWAITING_AUTH');
 assert.equal((await app.api('/api/public/'+tx.qrToken+'/action','POST',{action:'authorise'},'')).data.status,'PROCESSING');
 await app.admin();assert.equal((await app.api('/api/transactions/'+tx.id+'/action','POST',{action:'confirm'})).data.status,'CONFIRMED');
 assert.equal((await app.api('/api/transactions/'+tx.id+'/reconcile','POST')).data.settlement,'RECONCILED');
 const customer=await app.api('/api/public/checkouts','POST',{merchantId:'gym',itemIndex:0,method:'payto',amount:1,status:'CONFIRMED',phone:'+61412345678'},'');
 assert.equal(customer.status,201);assert.equal(customer.data.status,'CREATED');assert.notEqual(customer.data.amount,1);assert.equal(customer.data.identitySupplied,false);assert.ok(!('id' in customer.data));
 assert.equal((await app.api('/api/merchant/logout','POST',undefined,salon)).status,200);
 assert.equal((await app.api('/api/merchant-dashboard?merchantId=salon','GET',undefined,salon)).status,401);
});

test('safe URL origin, CSRF rejection, request and SSE limits',async t=>{
 const app=await demo();t.after(()=>app.close());const cookie=await app.merchant('salon');
 const hostile=await app.request('/api/transactions',{method:'POST',auth:cookie,headers:{origin:'https://untrusted.example'},body:{merchantId:'salon',method:'payid'}});assert.equal(hostile.status,403);
 const created=await app.request('/api/transactions',{method:'POST',auth:cookie,headers:{host:'untrusted.example'},body:{merchantId:'salon',method:'payid'}});
 assert.equal(created.status,201);assert.equal(new URL((await created.json()).qrUrl).hostname,'localhost');
 assert.ok(!('database' in (await app.api('/api/health')).data));
 const streams=[];
 try{
  for(let i=0;i<5;i++){const controller=new AbortController();streams.push(controller);const r=await app.request('/api/events?merchantId=salon',{auth:cookie,signal:controller.signal});assert.equal(r.status,200)}
  assert.equal((await app.request('/api/events?merchantId=salon',{auth:cookie})).status,429);
 }finally{streams.forEach(c=>c.abort())}
 for(let i=1;i<30;i++)assert.equal((await app.api('/api/public/checkouts','POST',{merchantId:'gym',method:'payid'},'')).status,201);
 assert.equal((await app.api('/api/public/checkouts','POST',{merchantId:'gym',method:'payid'},'')).status,429);
});
