import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {businessTime,periodFor} from '../server/reporting.js';
import {demo} from './helpers/server.js';

test('Melbourne date boundaries and daylight saving are consistent',()=>{
 assert.deepEqual(businessTime('2026-10-03T15:30:00Z'),{day:'2026-10-04',hour:'01'});
 assert.deepEqual(businessTime('2026-10-03T16:30:00Z'),{day:'2026-10-04',hour:'03'});
 assert.equal(businessTime('2026-01-01T13:30:00Z').day,'2026-01-02');
 assert.equal(periodFor('today','2026-01-01T13:30:00Z').value,'2026-01-02');
 assert.equal(periodFor('yesterday','2026-01-01T13:30:00Z').value,'2026-01-01');
 assert.equal(periodFor('last month','2026-01-01T13:30:00Z').value,'2025-12');
});

test('complete aggregates beyond 500 rows, scoped dates, pagination and full exports',async t=>{
 const app=await demo();t.after(()=>app.close());await app.admin();await app.stop();
 const db=new DatabaseSync(path.join(app.directory,'payments.sqlite'));
 const insert=db.prepare(`INSERT INTO transactions(id,token_hash,merchant_id,item_index,method,amount_cents,phone_enc,phone_masked,status,agreement,receipt,settlement,reference,created_at,expires_at,updated_at)
 VALUES(?,?,'salon',0,'payid',?,'synthetic','Not yet supplied','CONFIRMED','NONE','POSTED','UNRECONCILED',?,?,?,?)`);
 db.exec('BEGIN');
 for(let i=0;i<602;i++){
  const id=randomUUID(),at=i<600?'2020-01-01T00:00:00.000Z':new Date().toISOString(),cents=i<600?100:6500;
  insert.run(id,createHash('sha256').update(id).digest('hex'),cents,'SEED-'+i,at,at,at);
  db.prepare('INSERT INTO ledger(transaction_id,amount_cents,posted_at) VALUES(?,?,?)').run(id,cents,at);
 }
 db.exec('COMMIT');db.close();await app.start();
 const ask=async question=>app.api('/api/admin/ask','POST',{question});
 const all=await ask('Show all time revenue');assert.match(all.data.answer,/602 confirmed/);assert.match(all.data.answer,/730\.00/);
 const today=await ask('Show today revenue');assert.match(today.data.answer,/2 confirmed/);assert.match(today.data.answer,/130\.00/);assert.equal(today.data.period.value,businessTime().day);
 const month=await ask('Show this month revenue');assert.match(month.data.answer,/2 confirmed/);
 assert.equal((await ask('Show revenue last week')).status,400);
 const dashboard=await app.api('/api/merchant-dashboard?merchantId=salon');assert.equal(dashboard.data.lifetime.confirmed,602);assert.equal(dashboard.data.today.revenue,130);assert.equal(dashboard.data.timezone,'Australia/Melbourne');assert.equal(dashboard.data.transactionTotal,602);assert.equal(dashboard.data.transactions.length,100);
 const page=await app.api('/api/admin/transactions?limit=100&offset=600');assert.equal(page.data.length,2);assert.equal(page.response.headers.get('x-total-count'),'602');
 const csv=await app.request('/api/admin/export?type=transactions').then(r=>r.text());assert.equal(csv.trim().split('\r\n').length,603);
 assert.equal((await app.api('/api/admin/transactions?limit=1000')).status,400);
});
