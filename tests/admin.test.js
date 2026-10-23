import test from 'node:test';
import assert from 'node:assert/strict';
import {demo} from './helpers/server.js';

test('admin login, authorization, reports, cookies and logout',async t=>{
 const app=await demo();t.after(()=>app.close());
 assert.equal((await app.api('/api/admin/transactions')).status,401);
 assert.equal((await app.api('/api/admin/login','POST',{email:'buyer@example.com',otp:'123456'})).status,400);
 const cookie=await app.admin();
 const overview=await app.api('/api/admin/overview');assert.equal(overview.status,200);assert.equal(overview.data.infrastructure.ipsec.status,'NOT_CONNECTED');
 const csv=await app.request('/api/admin/export?type=settlements');assert.equal(csv.status,200);assert.match(csv.headers.get('content-type'),/text\/csv/);
 assert.equal((await app.api('/api/admin/logout','POST')).status,200);
 assert.equal((await app.api('/api/admin/overview','GET',undefined,cookie)).status,401);
 assert.equal((await app.api('/api/access')).data.role,'guest');
});
