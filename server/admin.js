import {randomBytes,createHash,timingSafeEqual} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import path from 'node:path';import fs from 'node:fs';
const dataDir=path.resolve(process.env.DATA_DIR||'./data');
fs.mkdirSync(dataDir,{recursive:true,mode:0o700});
const db=new DatabaseSync(path.join(dataDir,'payments.sqlite'));
db.exec(`CREATE TABLE IF NOT EXISTS admin_sessions (token_hash TEXT PRIMARY KEY,email TEXT NOT NULL,expires INTEGER NOT NULL); CREATE TABLE IF NOT EXISTS admin_audit (id INTEGER PRIMARY KEY AUTOINCREMENT,at TEXT NOT NULL,action TEXT NOT NULL,actor TEXT NOT NULL,detail TEXT NOT NULL);`);
const attempts=new Map();const hash=x=>createHash('sha256').update(x).digest('hex');
const emailValid=x=>typeof x==='string'&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x)&&x.length<255;
const audit=(action,actor,detail='')=>db.prepare('INSERT INTO admin_audit(at,action,actor,detail) VALUES(?,?,?,?)').run(new Date().toISOString(),action,actor,detail);
export function login({email,otp},remote){if(!emailValid(email))throw Error('Valid email address required');const addr=remote||'unknown',t=Date.now(),v=attempts.get(addr)||[];const recent=v.filter(x=>t-x<15*60*1000);if(recent.length>=5)throw Error('Too many attempts; retry later');recent.push(t);attempts.set(addr,recent);
// The fixed demonstration code is intentionally NEVER accepted on a public interface.
const local=['127.0.0.1','::1','::ffff:127.0.0.1'].includes(addr);
if(!local && !(process.env.PUBLIC_DEMO_MODE==='1' && process.env.ALLOW_REMOTE_DEMO_OTP==='1'))throw Error('Demo OTP login is restricted to localhost unless explicitly enabled behind the team access gate.');
const allowed=process.env.ADMIN_DEMO_OTP||'786123';if(typeof otp!=='string'||!/^\d{6}$/.test(otp)||!timingSafeEqual(Buffer.from(hash(otp)),Buffer.from(hash(allowed)))){audit('LOGIN_DENIED',email);throw Error('Invalid one-time code')}
const token=randomBytes(32).toString('base64url'),expiry=t+60*60*1000;db.prepare('INSERT INTO admin_sessions VALUES(?,?,?)').run(hash(token),email,expiry);attempts.delete(addr);audit('LOGIN',email,'Local-only demonstration login');return token}
export function session(req){const cookie=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('baap_admin='));if(!cookie)return null;const token=cookie.slice('baap_admin='.length);if(!/^[\w-]{43}$/.test(token))return null;return db.prepare('SELECT email FROM admin_sessions WHERE token_hash=? AND expires>?').get(hash(token),Date.now())?.email||null}
export function logout(req){const cookie=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('baap_admin='));if(cookie){db.prepare('DELETE FROM admin_sessions WHERE token_hash=?').run(hash(cookie.slice('baap_admin='.length)))} }
export function adminOverview(){const transactions=db.prepare('SELECT status,COUNT(*) count,SUM(amount_cents) cents FROM transactions GROUP BY status').all();const totals=db.prepare('SELECT COUNT(*) count,COALESCE(SUM(amount_cents),0) cents FROM ledger').get();const unsettled=db.prepare("SELECT COUNT(*) count FROM transactions WHERE status='CONFIRMED' AND settlement!='RECONCILED'").get().count;return {transactions,totals,unsettled,mode:'SANDBOX',node:{api:'ONLINE',database:'ONLINE',paymentAdapter:'SIMULATED',npp:'NOT_CONNECTED',payto:'NOT_CONNECTED'},infrastructure:{vcenter:{status:'NOT_CONNECTED',vms:[]},ipsec:{status:'NOT_CONNECTED',gateways:[]}},note:'No live VM, VPN, bank or scheme integrations.'}}
export function adminTransactions(){return db.prepare('SELECT id,reference,merchant_id,method,amount_cents,status,agreement,receipt,settlement,bank_tx_id,created_at,updated_at FROM transactions ORDER BY created_at DESC LIMIT 500').all()}
export function adminEvents(){return db.prepare('SELECT e.id,e.transaction_id,e.at,e.status,e.detail,t.reference,t.bank_tx_id FROM events e JOIN transactions t ON t.id=e.transaction_id ORDER BY e.id DESC LIMIT 500').all()}
export function adminSettlements(){return db.prepare('SELECT t.reference,t.merchant_id,t.method,t.amount_cents,t.status,t.settlement,t.settlement_date,t.bank_tx_id,l.posted_at FROM transactions t LEFT JOIN ledger l ON l.transaction_id=t.id ORDER BY t.created_at DESC LIMIT 500').all()}
export function adminMerchantLookup(q){if(!q)return [];return db.prepare('SELECT reference,merchant_id,method,status,bank_tx_id,amount_cents FROM transactions WHERE merchant_id LIKE ? OR reference LIKE ? OR bank_tx_id LIKE ? LIMIT 50').all(...Array(3).fill('%'+q.slice(0,80)+'%'))}
export function adminAudit(){return db.prepare('SELECT at,action,actor,detail FROM admin_audit ORDER BY id DESC LIMIT 100').all()}
export function exportCsv(rows){if(!rows.length)return 'No matching rows\n';const cols=Object.keys(rows[0]);const esc=x=>'"'+String(x??'').replace(/^[=+@\-]/,'\'$&').replace(/"/g,'""')+'"';return '\ufeff'+cols.map(esc).join(',')+'\r\n'+rows.map(r=>cols.map(c=>esc(r[c])).join(',')).join('\r\n')+'\r\n'}
export function logAccess(actor,action){audit(action,actor)}
