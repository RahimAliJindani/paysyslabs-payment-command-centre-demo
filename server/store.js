import {DatabaseSync} from 'node:sqlite';
import {randomBytes,randomUUID,createCipheriv,createDecipheriv,createHash} from 'node:crypto';
import fs from 'node:fs';import path from 'node:path';
import {merchants,phoneValid} from './catalog.js';
import {analytics,businessTime,timezone,registerReporting,periodFor} from './reporting.js';
const directory=path.resolve(process.env.DATA_DIR||'./data');fs.mkdirSync(directory,{recursive:true,mode:0o700});
const keyPath=path.join(directory,'local-dev.key');
let key;if(process.env.ENCRYPTION_KEY_HEX){if(!/^[0-9a-f]{64}$/i.test(process.env.ENCRYPTION_KEY_HEX))throw Error('ENCRYPTION_KEY_HEX must be 64 hex characters');key=Buffer.from(process.env.ENCRYPTION_KEY_HEX,'hex')}else{if(!fs.existsSync(keyPath))fs.writeFileSync(keyPath,randomBytes(32),{mode:0o600,flag:'wx'});key=fs.readFileSync(keyPath);if(key.length!==32)throw Error('Invalid local encryption key')}
const db=new DatabaseSync(path.join(directory,'payments.sqlite'));db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;');
db.exec(`CREATE TABLE IF NOT EXISTS transactions(id TEXT PRIMARY KEY,token_hash TEXT UNIQUE NOT NULL,merchant_id TEXT NOT NULL,item_index INTEGER NOT NULL,method TEXT NOT NULL,amount_cents INTEGER NOT NULL,phone_enc TEXT NOT NULL,phone_masked TEXT NOT NULL,status TEXT NOT NULL,agreement TEXT NOT NULL,receipt TEXT NOT NULL,settlement TEXT NOT NULL,reference TEXT UNIQUE NOT NULL,created_at TEXT NOT NULL,expires_at TEXT NOT NULL,updated_at TEXT NOT NULL,bank_tx_id TEXT,provider_event_id TEXT UNIQUE,settlement_date TEXT);CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY AUTOINCREMENT,transaction_id TEXT NOT NULL,at TEXT NOT NULL,status TEXT NOT NULL,detail TEXT NOT NULL,FOREIGN KEY(transaction_id) REFERENCES transactions(id));CREATE TABLE IF NOT EXISTS ledger(id INTEGER PRIMARY KEY AUTOINCREMENT,transaction_id TEXT NOT NULL UNIQUE,amount_cents INTEGER NOT NULL,posted_at TEXT NOT NULL,FOREIGN KEY(transaction_id) REFERENCES transactions(id));`);
registerReporting(db);
db.exec(`CREATE TABLE IF NOT EXISTS provider_jobs (
  transaction_id TEXT PRIMARY KEY REFERENCES transactions(id), due_at INTEGER NOT NULL
); CREATE INDEX IF NOT EXISTS transactions_merchant_created ON transactions(merchant_id,created_at);
CREATE INDEX IF NOT EXISTS transactions_status_expiry ON transactions(status,expires_at);`);
const listeners=new Set();const now=()=>new Date().toISOString();
function encrypt(value){const iv=randomBytes(12);const cipher=createCipheriv('aes-256-gcm',key,iv);const encrypted=Buffer.concat([cipher.update(value,'utf8'),cipher.final()]);return [iv.toString('base64url'),cipher.getAuthTag().toString('base64url'),encrypted.toString('base64url')].join('.')}
export function decryptForTest(value){const [iv,tag,data]=value.split('.').map(s=>Buffer.from(s,'base64url'));const d=createDecipheriv('aes-256-gcm',key,iv);d.setAuthTag(tag);return Buffer.concat([d.update(data),d.final()]).toString('utf8')}
let pendingEvents=null;
function emit(event){for(const fn of listeners)try{fn(event)}catch{}}
function write(fn){
 db.exec('BEGIN IMMEDIATE');pendingEvents=[];
 try{const result=fn();db.exec('COMMIT');const events=pendingEvents;pendingEvents=null;for(const event of events)emit(event);return result}
 catch(error){pendingEvents=null;db.exec('ROLLBACK');throw error}
}
function publish(t,status,detail){const at=now();db.prepare('INSERT INTO events(transaction_id,at,status,detail) VALUES(?,?,?,?)').run(t.id,at,status,detail);const e={at,transactionId:t.id,merchantId:t.merchant_id,status,detail};if(pendingEvents)pendingEvents.push(e);else emit(e);return e}
export function subscribe(fn){listeners.add(fn);return ()=>listeners.delete(fn)}
function hydrate(row,includeHistory=true){if(!row)return null;const m=merchants.find(x=>x.id===row.merchant_id);return {id:row.id,reference:row.reference,merchantId:row.merchant_id,merchantName:m.name,merchantType:m.type,item:m.items[row.item_index][0],amount:row.amount_cents/100,method:row.method,phoneMasked:row.phone_masked,status:row.status,agreement:row.agreement,receipt:row.receipt,settlement:row.settlement,createdAt:row.created_at,expiresAt:row.expires_at,bankTransactionId:row.bank_tx_id,history:includeHistory?db.prepare('SELECT at,status,detail FROM events WHERE transaction_id=? ORDER BY id').all(row.id):[]}}
const getRow=id=>db.prepare('SELECT * FROM transactions WHERE id=?').get(id);
export const getPayment=id=>hydrate(getRow(id));
export function listPayments(merchantId){
 return db.prepare('SELECT * FROM transactions WHERE merchant_id=? ORDER BY created_at DESC LIMIT 100').all(merchantId).map(x=>hydrate(x,false));
}
export function createPayment({merchantId,itemIndex=0,method,phone}){const m=merchants.find(x=>x.id===merchantId);if(!m)throw Error('Unknown merchant');if(!Number.isInteger(itemIndex)||itemIndex<0||itemIndex>=m.items.length)throw Error('Invalid item');if(!['payid','payto'].includes(method))throw Error('Unsupported collection method');if(phone !== undefined && phone !== '' && !phoneValid(phone))throw Error('Phone must be +61 followed by exactly 9 digits');const token=randomBytes(24).toString('base64url'),hash=createHash('sha256').update(token).digest('hex'),id=randomUUID(),ref='PSL-'+randomBytes(7).toString('hex').toUpperCase(),at=now(),expires=new Date(Date.now()+15*60_000).toISOString();write(()=>{db.prepare('INSERT INTO transactions(id,token_hash,merchant_id,item_index,method,amount_cents,phone_enc,phone_masked,status,agreement,receipt,settlement,reference,created_at,expires_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(id,hash,merchantId,itemIndex,method,Math.round(m.items[itemIndex][1]*100),encrypt(phone||''),phone?'+61••••••'+phone.slice(-3):'Not yet supplied','CREATED','NONE','NOT_POSTED','UNRECONCILED',ref,at,expires,at);publish(getRow(id),'CREATED','Inquiry validated order and amount')});return {...getPayment(id),qrToken:token}}
export function lookupToken(token){if(typeof token!=='string'||!/^[A-Za-z0-9_-]{32}$/.test(token))return null;const hash=createHash('sha256').update(token).digest('hex');const row=db.prepare('SELECT * FROM transactions WHERE token_hash=?').get(hash);return row?hydrate(row):null}
export function canonical(id){const r=getRow(id);if(!r)return null;const m=merchants.find(x=>x.id===r.merchant_id);return {schema:'PaysysLabs canonical ISO 20022-inspired model; not a bank pacs.008 message',MsgId:'PSL-MSG-'+r.id,EndToEndId:r.reference,TxId:r.bank_tx_id||null,IntrBkSttlmAmt:r.status==='CONFIRMED'?{currency:'AUD',value:(r.amount_cents/100).toFixed(2)}:null,IntrBkSttlmDt:r.settlement_date||null,Dbtr:'Restricted / not supplied by bank',Cdtr:m.name,DbtrAgt:null,CdtrAgt:null,DbtrAcct:'Restricted / not collected',CdtrAcct:'Restricted / not collected',RmtInf:`${m.items[r.item_index][0]} | ${r.reference}`.slice(0,280),Purp:null,CtgyPurp:null,merchant_id:r.merchant_id,collection_method:r.method,customer_mobile:'AES-256-GCM encrypted; masked in responses',receipt:r.receipt,settlement:r.settlement,expires_at:r.expires_at}}
export function confirmCustomer(token,{identityType,identity}){const t=lookupToken(token);if(!t)throw Error('Session not found');const r=getRow(t.id);if(r.status!=='CREATED')throw Error('Identity cannot be changed after payment starts');if(Date.now()>Date.parse(r.expires_at))throw Error('QR session expired');if(identityType==='mobile'){if(!phoneValid(identity))throw Error('Mobile PayID must be +61 followed by exactly 9 digits')}else if(identityType==='email'){if(typeof identity!=='string'||identity.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identity))throw Error('Enter a valid email PayID')}else throw Error('Select mobile or email PayID');write(()=>{db.prepare('UPDATE transactions SET phone_enc=?,phone_masked=?,updated_at=? WHERE id=?').run(encrypt(identity),identityType==='mobile'?'+61••••••'+identity.slice(-3):identity.replace(/^(.{1,2}).*(@.*)$/,'$1••••$2'),now(),r.id);publish(r,'IDENTITY_CAPTURED','Customer supplied a PayID identifier; ownership is not verified in sandbox')});return getPayment(r.id)}
const terminal=new Set(['CONFIRMED','FAILED','DECLINED','EXPIRED']);
export function advance(id,action){const r=getRow(id);if(!r)throw Error('Transaction not found');if(terminal.has(r.status))throw Error('Transaction is terminal');if(Date.now()>Date.parse(r.expires_at)&&!['PROCESSING','UNKNOWN'].includes(r.status)){update(r,'EXPIRED','QR session expired; no receipt posted');return getPayment(id)}let next,detail,agreement=r.agreement,receipt=r.receipt,bankTx=r.bank_tx_id;
if(action==='start'&&r.status==='CREATED'&&r.phone_masked!=='Not yet supplied'){next=r.method==='payid'?'AWAITING_AUTH':'AGREEMENT_PENDING';detail=r.method==='payid'?'PayID instructions displayed':'PayTo agreement request initiated'}
else if(action==='authorise'&&r.status==='AGREEMENT_PENDING'){next='AGREEMENT_AUTHORISED';agreement='AUTHORISED';detail='Customer authorised simulated PayTo agreement'}
else if(action==='authorise'&&r.status==='AWAITING_AUTH'){next='PROCESSING';detail='Customer submitted simulated PayID transfer; verification pending'}
else if(action==='collect'&&r.status==='AGREEMENT_AUTHORISED'){next='PROCESSING';detail='Simulated PayTo collection initiated under authorised agreement'}
else if(action==='decline'&&['AWAITING_AUTH','AGREEMENT_PENDING','AGREEMENT_AUTHORISED','PROCESSING'].includes(r.status)){next='DECLINED';detail='Customer declined; no payment marking'}
else if(action==='timeout'&&['AWAITING_AUTH','AGREEMENT_PENDING','PROCESSING'].includes(r.status)){next='UNKNOWN';detail='Provider timeout: outcome unknown; never assume failure or success'}
else if(action==='bank-failure'&&['PROCESSING','UNKNOWN'].includes(r.status)){next='FAILED';detail='Simulated bank rejected payment; no receipt posted'}
else if(action==='mismatch'&&['AWAITING_AUTH','PROCESSING','UNKNOWN'].includes(r.status)){next='FAILED';detail='Beneficiary mismatch: payment blocked'}
else if(action==='confirm'&&['PROCESSING','UNKNOWN'].includes(r.status)){next='CONFIRMED';receipt='POSTED';bankTx='SIM-'+randomUUID();detail='Simulated authenticated provider event; idempotent PaymentMarking'}
else throw Error('Action not permitted in current state');
const transaction=()=>{db.prepare('UPDATE transactions SET status=?,agreement=?,receipt=?,bank_tx_id=?,updated_at=? WHERE id=?').run(next,agreement,receipt,bankTx,now(),id);if(next==='CONFIRMED')db.prepare('INSERT OR IGNORE INTO ledger(transaction_id,amount_cents,posted_at) VALUES(?,?,?)').run(id,r.amount_cents,now());if(next==='PROCESSING' && process.env.SANDBOX_AUTO_CONFIRM!=='0')db.prepare('INSERT OR IGNORE INTO provider_jobs(transaction_id,due_at) VALUES(?,?)').run(id,Date.now()+1400);
if(next!=='PROCESSING')db.prepare('DELETE FROM provider_jobs WHERE transaction_id=?').run(id);
publish(getRow(id),next,detail)};write(transaction);return getPayment(id)}
function update(r,next,detail){write(()=>{db.prepare('UPDATE transactions SET status=?,updated_at=? WHERE id=?').run(next,now(),r.id);publish(getRow(r.id),next,detail)})}
export function reconcile(id){const r=getRow(id);if(!r)throw Error('Transaction not found');if(r.status!=='CONFIRMED')throw Error('Cannot reconcile an unconfirmed payment');if(r.settlement==='RECONCILED')return getPayment(id);const date=businessTime().day;write(()=>{db.prepare('UPDATE transactions SET settlement=?,settlement_date=?,updated_at=? WHERE id=?').run('RECONCILED',date,now(),id);publish(getRow(id),'RECONCILED','Synthetic settlement report matched to ledger')});return getPayment(id)}
// Durable jobs survive process restarts. Unknown outcomes are resolved only by an operator.
export function maintainPayments(){
 const expired=db.prepare("SELECT * FROM transactions WHERE status IN ('CREATED','AWAITING_AUTH','AGREEMENT_PENDING','AGREEMENT_AUTHORISED') AND expires_at<?").all(now());
 for(const row of expired)update(row,'EXPIRED','QR session expired; no receipt posted');
 if(process.env.SANDBOX_AUTO_CONFIRM==='0')return;
 // Recover PROCESSING transactions made by earlier versions as well as queued jobs.
 db.prepare("INSERT OR IGNORE INTO provider_jobs(transaction_id,due_at) SELECT id,? FROM transactions WHERE status='PROCESSING'").run(Date.now()+1400);
 const due=db.prepare('SELECT transaction_id FROM provider_jobs WHERE due_at<=?').all(Date.now());
 for(const job of due){
  const row=getRow(job.transaction_id);
  if(row?.status==='PROCESSING')advance(row.id,'confirm');
  else db.prepare('DELETE FROM provider_jobs WHERE transaction_id=?').run(job.transaction_id);
 }
}
export function publicPayment(token){
 const t=lookupToken(token);if(!t)return null;
 // Return only enough state to recover checkout; never return merchant-only identifiers/history.
 return {reference:t.reference,merchantName:t.merchantName,item:t.item,amount:t.amount,method:t.method,
  status:t.status,expiresAt:t.expiresAt,agreement:t.agreement,receipt:t.receipt,
  identitySupplied:t.phoneMasked!=='Not yet supplied'};
}
export function insights(merchantId){
 const m=merchants.find(x=>x.id===merchantId);if(!m)throw Error('Unknown merchant');
 const a=analytics(db,{merchantId}),t=a.totals;
 const top=a.products.sort((x,y)=>y.count-x.count||y.amount_cents-x.amount_cents)[0];
 return {merchant:m.name,transactions:t.attempts,paid:t.confirmed,failed:t.failed,revenue:t.cents/100,
  unreconciled:t.unreconciled,topItem:top?m.items[Number(top.label)][0]:null,timezone};
}
export function merchantDashboard(merchantId){
 const m=merchants.find(x=>x.id===merchantId);if(!m)throw Error('Unknown merchant');
 const a=analytics(db,{merchantId}),today=analytics(db,{merchantId,period:periodFor('today'),summaryOnly:true}),month=analytics(db,{merchantId,period:periodFor('this month'),summaryOnly:true});
 const t=a.totals;
 const products=m.items.map(([name,price],index)=>{const r=a.products.find(x=>Number(x.label)===index);return {name,unitPrice:price,units:r?.count||0,revenue:(r?.amount_cents||0)/100}}).sort((x,y)=>y.units-x.units||y.revenue-x.revenue);
 const hours=Array.from({length:24},(_,h)=>{const label=String(h).padStart(2,'0'),r=a.hours.find(x=>x.label===label);return {hour:label+':00 Melbourne',count:r?.count||0,revenue:(r?.amount_cents||0)/100}});
 const rows=db.prepare('SELECT reference,item_index,method,amount_cents,status,settlement,created_at FROM transactions WHERE merchant_id=? ORDER BY created_at DESC LIMIT 100').all(merchantId);
 return {merchant:{id:m.id,name:m.name,type:m.type,icon:m.icon},timezone,
  today:{date:businessTime().day,transactions:today.totals.confirmed,revenue:today.totals.cents/100},
  month:{month:businessTime().day.slice(0,7),transactions:month.totals.confirmed,revenue:month.totals.cents/100},
  lifetime:{attempts:t.attempts,confirmed:t.confirmed,failed:t.failed,revenue:t.cents/100,unreconciled:t.unreconciled},products,hours,
  days:a.days.slice(0,31).map(r=>({date:r.label,count:r.count,revenue:r.amount_cents/100})),
  transactionLimit:100,transactionTotal:t.attempts,
  transactions:rows.map(r=>({reference:r.reference,product:m.items[r.item_index][0],method:r.method,amount:r.amount_cents/100,status:r.status,settlement:r.settlement,at:r.created_at}))};
}
export const diagnostics=()=>({encryption:'AES-256-GCM',mode:'SANDBOX',storage:'SQLite WAL'});
