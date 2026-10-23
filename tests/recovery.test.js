import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import path from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {demo} from './helpers/server.js';

async function until(fn){for(let i=0;i<30;i++){const value=await fn();if(value)return value;await delay(100)}throw Error('Expected payment recovery did not occur')}

test('durable confirmation resumes after restart and posts the ledger once',async t=>{
 const app=await demo({SANDBOX_AUTO_CONFIRM:'1'});t.after(()=>app.close());await app.admin();
 const tx=(await app.api('/api/transactions','POST',{merchantId:'salon',method:'payid',phone:'+61412345678'})).data;
 for(const action of ['start','authorise'])assert.equal((await app.api('/api/public/'+tx.qrToken+'/action','POST',{action},'')).status,200);
 await app.stop();
 const db=new DatabaseSync(path.join(app.directory,'payments.sqlite'));
 assert.equal(db.prepare('SELECT COUNT(*) n FROM provider_jobs WHERE transaction_id=?').get(tx.id).n,1);db.close();
 await app.start();
 await until(async()=>((await app.api('/api/transactions/'+tx.id)).data.status==='CONFIRMED'));
 const read=new DatabaseSync(path.join(app.directory,'payments.sqlite'));assert.equal(read.prepare('SELECT COUNT(*) n FROM ledger WHERE transaction_id=?').get(tx.id).n,1);assert.equal(read.prepare('SELECT COUNT(*) n FROM provider_jobs WHERE transaction_id=?').get(tx.id).n,0);read.close();
});

test('expiry preserves unknown outcomes and permits a late operator confirmation',async t=>{
 const app=await demo();t.after(()=>app.close());await app.admin();
 const tx=(await app.api('/api/transactions','POST',{merchantId:'salon',method:'payid',phone:'+61412345678'})).data;
 for(const action of ['start','authorise','timeout'])await app.api('/api/transactions/'+tx.id+'/action','POST',{action});
 const idle=(await app.api('/api/transactions','POST',{merchantId:'salon',method:'payto'})).data;
 await app.stop();const db=new DatabaseSync(path.join(app.directory,'payments.sqlite'));
 db.prepare('UPDATE transactions SET expires_at=?').run('2000-01-01T00:00:00.000Z');db.close();await app.start();
 await until(async()=>((await app.api('/api/public/'+idle.qrToken)).data.status==='EXPIRED'));
 assert.equal((await app.api('/api/public/'+tx.qrToken)).data.status,'UNKNOWN');
 assert.equal((await app.api('/api/transactions/'+tx.id+'/action','POST',{action:'confirm'})).data.status,'CONFIRMED');
 const idleResult=await app.api('/api/public/'+idle.qrToken);assert.equal(idleResult.data.receipt,'NOT_POSTED');
});
