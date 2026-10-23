import {askEnterprise} from './copilot.js';
import http from 'node:http';
import {rateAllowed,acquireStream} from './limits.js';
import {timingSafeEqual} from 'node:crypto';
import {login,session,logout,adminOverview,adminTransactions,adminEvents,adminSettlements,adminMerchantLookup,adminAudit,exportCsv,logAccess,merchantLogin,merchantSession,merchantLogout,reportCount} from './admin.js';import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {merchants} from './catalog.js';import {qrSvg} from './qr.js';import {createPayment,confirmCustomer,getPayment,listPayments,lookupToken,canonical,advance,reconcile,insights,merchantDashboard,subscribe,diagnostics,maintainPayments,publicPayment} from './store.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../public');let port=Number(process.env.PORT||4173);
const json=(res,code,data)=>{res.writeHead(code,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'});res.end(JSON.stringify(data))};
const body=async req=>{let s='';for await(const c of req){s+=c;if(s.length>12000)throw Error('Request too large')}try{return JSON.parse(s||'{}')}catch{throw Error('Invalid JSON')}};
const publicDemo=process.env.PUBLIC_DEMO_MODE==='1';
const demoUsername=process.env.DEMO_USERNAME||'';
const demoPassword=process.env.DEMO_PASSWORD||'';
if(process.env.PUBLIC_BASE_URL){const baseUrl=new URL(process.env.PUBLIC_BASE_URL);if(!['http:','https:'].includes(baseUrl.protocol)||baseUrl.username||baseUrl.password||baseUrl.search||baseUrl.hash||baseUrl.pathname!=='/')throw Error('PUBLIC_BASE_URL must be an HTTP(S) origin')}
if(publicDemo && (!demoUsername || demoPassword.length<16 || !process.env.PUBLIC_BASE_URL?.startsWith('https://'))){
  throw new Error('PUBLIC_DEMO_MODE requires DEMO_USERNAME, DEMO_PASSWORD (16+ characters), and HTTPS PUBLIC_BASE_URL');
}
function allowedDemoAccess(req){
  if(!publicDemo)return true;
  const auth=req.headers.authorization||'';
  if(!auth.startsWith('Basic '))return false;
  let decoded;
  try{decoded=Buffer.from(auth.slice(6),'base64').toString('utf8')}catch{return false}
  const index=decoded.indexOf(':');
  if(index<0)return false;
  const user=decoded.slice(0,index),password=decoded.slice(index+1);
  const expectedUser=Buffer.from(demoUsername),actualUser=Buffer.from(user);
  const expectedPass=Buffer.from(demoPassword),actualPass=Buffer.from(password);
  return expectedUser.length===actualUser.length && expectedPass.length===actualPass.length &&
    timingSafeEqual(expectedUser,actualUser) && timingSafeEqual(expectedPass,actualPass);
}
const handler=async(req,res)=>{try{
if(!allowedDemoAccess(req)){
  res.writeHead(401,{'WWW-Authenticate':'Basic realm="PaysysLabs Team Sandbox"','Cache-Control':'no-store','Content-Type':'text/plain; charset=utf-8'});
  return res.end('Team demo access required');
}
const url=new URL(req.url,'http://localhost'),p=url.pathname;
const base=process.env.PUBLIC_BASE_URL?new URL(process.env.PUBLIC_BASE_URL).origin:`http://localhost:${port}`;
const address=req.socket.remoteAddress||'unknown';
if(req.method!=='GET' && req.method!=='HEAD'){
 const validOrigins=new Set([base,`http://127.0.0.1:${port}`,`http://localhost:${port}`]);
 if(req.headers['sec-fetch-site']==='cross-site'||(req.headers.origin&&!validOrigins.has(req.headers.origin)))return json(res,403,{error:'Cross-origin writes are not allowed'});
 if(!rateAllowed('write:'+address,120)){res.setHeader('Retry-After','60');return json(res,429,{error:'Too many requests; retry in one minute'})}
 if(req.headers['content-type']?.split(';')[0]!=='application/json' && (Number(req.headers['content-length']||0)>0 || req.headers['transfer-encoding']))return json(res,415,{error:'JSON requests required'});
}
const adminActor=session(req),merchantActor=merchantSession(req);
const authorised=id=>Boolean(adminActor||(merchantActor&&id===merchantActor));
const secureCookie=publicDemo||base.startsWith('https:');
const cookie=(name,token,seconds)=>`${name}=${token}; HttpOnly; ${secureCookie?'Secure; ':''}SameSite=Strict; Path=/api; Max-Age=${seconds}`;
if(p==='/api/access'&&req.method==='GET')return json(res,200,{role:adminActor?'admin':merchantActor?'merchant':'guest',merchantIds:adminActor?merchants.map(m=>m.id):merchantActor?[merchantActor]:[]});
if(p==='/api/merchant/login'&&req.method==='POST'){
 const token=merchantLogin(await body(req),address);res.setHeader('Set-Cookie',cookie('baap_merchant',token,3600));return json(res,200,{ok:true});
}
if(p==='/api/merchant/logout'&&req.method==='POST'){
 merchantLogout(req);res.setHeader('Set-Cookie',cookie('baap_merchant','',0));return json(res,200,{ok:true});
}
const requireMerchant=id=>{
 if(!adminActor&&!merchantActor){json(res,401,{error:'Sign in as a merchant or administrator'});return false}
 if(!authorised(id)){json(res,403,{error:'Merchant access denied'});return false}
 if(!merchants.some(m=>m.id===id)){json(res,400,{error:'Unknown merchant'});return false}
 return true;
};
res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Frame-Options','DENY');res.setHeader('Content-Security-Policy',"default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'self'");
if(p==='/api/admin/login'&&req.method==='POST'){const token=login(await body(req),req.socket.remoteAddress);res.setHeader('Set-Cookie',[cookie('baap_admin',token,3600),'baap_admin=; HttpOnly; SameSite=Strict; Path=/api/admin; Max-Age=0']);return json(res,200,{ok:true,mode:'LOCAL_DEMO_ONLY'})}
if(p.startsWith('/api/admin/')){const actor=adminActor;if(!actor)return json(res,401,{error:'Admin login required'});if(p==='/api/admin/logout'&&req.method==='POST'){logout(req);res.setHeader('Set-Cookie',[cookie('baap_admin','',0),'baap_admin=; HttpOnly; SameSite=Strict; Path=/api/admin; Max-Age=0']);return json(res,200,{ok:true})}
if(req.method!=='GET'&&p!=='/api/admin/ask')return json(res,405,{error:'Method not allowed'});
if(p==='/api/admin/me')return json(res,200,{email:actor,role:'BAAP demo reviewer'});
if(p==='/api/admin/ask'&&req.method==='POST')return json(res,200,askEnterprise((await body(req)).question,actor));
if(p==='/api/admin/overview')return json(res,200,adminOverview());
const limit=Number(url.searchParams.get('limit')||100),offset=Number(url.searchParams.get('offset')||0);
if(!Number.isInteger(limit)||limit<1||limit>500||!Number.isInteger(offset)||offset<0)return json(res,400,{error:'Invalid pagination'});
const report=fn=>{res.setHeader('X-Total-Count',String(reportCount(p.split('/').pop())));return json(res,200,fn(limit,offset))};
if(p==='/api/admin/transactions')return report(adminTransactions);
if(p==='/api/admin/settlements')return report(adminSettlements);
if(p==='/api/admin/logs')return report(adminEvents);
if(p==='/api/admin/audit')return json(res,200,adminAudit());
if(p==='/api/admin/lookup')return json(res,200,adminMerchantLookup(url.searchParams.get('q')||''));
if(p==='/api/admin/export'){const type=url.searchParams.get('type');const rows=type==='settlements'?adminSettlements(-1):type==='logs'?adminEvents(-1):adminTransactions(-1);logAccess(actor,'EXPORT_'+type);res.writeHead(200,{'content-type':'text/csv; charset=utf-8','content-disposition':`attachment; filename="paysyslabs-${type==='settlements'?'settlements':type==='logs'?'logs':'transactions'}.csv"`,'cache-control':'no-store'});return res.end(exportCsv(rows))}
return json(res,404,{error:'Admin route not found'})}
if(req.method==='GET'&&p==='/api/merchants')return json(res,200,merchants);
if(req.method==='GET'&&p==='/api/business-card'){
 const m=merchants.find(x=>x.id===url.searchParams.get('merchantId'));if(!m)return json(res,404,{error:'Unknown business'});
 const phone='+61 3 9000 '+String(1000+merchants.indexOf(m)).padStart(4,'0');
 const email=m.id+'@merchant-demo.paysyslabs.example';
 const vcard=['BEGIN:VCARD','VERSION:3.0','FN:'+m.name,'ORG:'+m.name,'TEL;TYPE=WORK:'+phone,'EMAIL;TYPE=WORK:'+email,'NOTE:PayTo demo merchant profile only. No registered PayID or bank mandate.','END:VCARD'].join('\r\n');
 res.writeHead(200,{'content-type':'image/svg+xml; charset=utf-8','cache-control':'no-store'});return res.end(qrSvg(vcard));
}
if(req.method==='GET'&&p==='/api/business-profile'){
 const m=merchants.find(x=>x.id===url.searchParams.get('merchantId'));if(!m)return json(res,404,{error:'Unknown business'});
 return json(res,200,{id:m.id,name:m.name,phone:'+61 3 9000 '+String(1000+merchants.indexOf(m)).padStart(4,'0'),email:m.id+'@merchant-demo.paysyslabs.example',payto:'Simulated PayTo payee (no registered agreement)',demo:true});
}
if(req.method==='GET'&&p==='/api/merchant-qr'){const id=url.searchParams.get('merchantId');if(!merchants.some(m=>m.id===id))return json(res,404,{error:'Merchant not found'});const merchant=merchants.find(m=>m.id===id);const ix=Number(url.searchParams.get('itemIndex')||0);if(!Number.isInteger(ix)||ix<0||ix>=merchant.items.length)return json(res,400,{error:'Invalid catalogue item'});res.writeHead(200,{'content-type':'image/svg+xml; charset=utf-8','cache-control':'no-store'});return res.end(qrSvg(`${base}/m/${encodeURIComponent(id)}?itemIndex=${Number(url.searchParams.get('itemIndex')||0)}&method=${url.searchParams.get('method')==='payid'?'payid':'payto'}`))}
if(req.method==='GET'&&p==='/api/health')return json(res,200,diagnostics());
if(req.method==='GET'&&p==='/api/transactions'){const id=url.searchParams.get('merchantId');if(!requireMerchant(id))return;return json(res,200,listPayments(id))}
if(req.method==='GET'&&p==='/api/merchant-dashboard'){const id=url.searchParams.get('merchantId');if(!requireMerchant(id))return;return json(res,200,merchantDashboard(id))}
if(req.method==='GET'&&p==='/api/insights'){const id=url.searchParams.get('merchantId');if(!requireMerchant(id))return;return json(res,200,insights(id))}
if(req.method==='GET'&&p==='/api/events'){
 const id=url.searchParams.get('merchantId');if(!requireMerchant(id))return;
 const release=acquireStream(address);if(!release){res.setHeader('Retry-After','60');return json(res,429,{error:'Too many live connections'})}
 res.writeHead(200,{'content-type':'text/event-stream','cache-control':'no-cache','connection':'keep-alive'});res.write(': connected\n\n');
 const send=e=>{if(!authorisedSession())return close();if(e.merchantId===id&&!res.write(`data: ${JSON.stringify(e)}\n\n`))close()};
 const unsubscribe=subscribe(send);let closed=false;
 const close=()=>{if(closed)return;closed=true;clearInterval(interval);unsubscribe();release();res.end()};
 const interval=setInterval(()=>{if(!authorisedSession())return close();res.write(': heartbeat\n\n')},20000);
 const authorisedSession=()=>Boolean(session(req)||merchantSession(req)===id);
 req.on('close',close);return;
}
if(req.method==='POST'&&(p==='/api/transactions'||p==='/api/public/checkouts')){
 const payload=await body(req);
 if(p==='/api/transactions'&&!requireMerchant(payload.merchantId))return;
 if(!rateAllowed('create:'+address,30)){res.setHeader('Retry-After','60');return json(res,429,{error:'Too many checkouts; retry in one minute'})}
 // Public storefront creation accepts catalogue selection only; never payment state or operator controls.
 const input=p==='/api/public/checkouts'?{merchantId:payload.merchantId,itemIndex:payload.itemIndex,method:payload.method}:payload;
 const t=createPayment(input);return json(res,201,{...publicPayment(t.qrToken),id:p==='/api/transactions'?t.id:undefined,qrToken:t.qrToken,qrUrl:`${base}/pay/${t.qrToken}`,qrSvgUrl:`/api/qr/${t.qrToken}`});
}
const pay=p.match(/^\/api\/public\/([A-Za-z0-9_-]{32})$/);if(pay&&req.method==='GET'){const t=publicPayment(pay[1]);if(!t)return json(res,404,{error:'Session not found'});return json(res,200,t)}
const identityRoute=p.match(/^\/api\/public\/([A-Za-z0-9_-]{32})\/identity$/);if(identityRoute&&req.method==='POST'){confirmCustomer(identityRoute[1],await body(req));return json(res,200,publicPayment(identityRoute[1]))}
const customerAction=p.match(/^\/api\/public\/([A-Za-z0-9_-]{32})\/action$/);
if(customerAction&&req.method==='POST'){
 const t=lookupToken(customerAction[1]);if(!t)return json(res,404,{error:'Session not found'});
 const action=(await body(req)).action;
 if(!['start','authorise','collect','decline'].includes(action))return json(res,403,{error:'This action requires a trusted operator/provider event'});
 advance(t.id,action);
 return json(res,200,publicPayment(customerAction[1]));
}
const qr=p.match(/^\/api\/qr\/([A-Za-z0-9_-]{32})$/);if(qr&&req.method==='GET'){if(!lookupToken(qr[1]))return json(res,404,{error:'QR session not found'});res.writeHead(200,{'content-type':'image/svg+xml; charset=utf-8','cache-control':'no-store'});return res.end(qrSvg(`${base}/pay/${qr[1]}`))}
const m=p.match(/^\/api\/transactions\/([0-9a-f-]+)(?:\/(action|reconcile|inspect))?$/);if(m){if(!adminActor&&!merchantActor)return json(res,401,{error:'Sign in required'});const t=getPayment(m[1]);if(!t)return json(res,404,{error:'Transaction not found'});if(!requireMerchant(t.merchantId))return;if(req.method==='GET'&&!m[2])return json(res,200,t);if(req.method==='GET'&&m[2]==='inspect')return json(res,200,canonical(m[1]));if(req.method==='POST'&&['action','reconcile'].includes(m[2])){
 if(!adminActor)return json(res,403,{error:'Administrator access required for operator/provider controls'});
 const result=m[2]==='reconcile'?reconcile(m[1]):advance(m[1],(await body(req)).action);
 logAccess(adminActor,'PAYMENT_'+m[2].toUpperCase()+':'+result.reference);return json(res,200,result);
}}
if(req.method!=='GET')return json(res,404,{error:'Not found'});
const requested=p.startsWith('/checkout/')?'/customer-v11.html':p.startsWith('/pay/')?'/customer.html':p.startsWith('/m/')?'/merchant-pay.html':p==='/'?'/index.html':p;const file=path.resolve(root,'.'+requested);if(!file.startsWith(root+path.sep))return json(res,403,{error:'Forbidden'});const ext=path.extname(file),mime={'.html':'text/html','.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml'};fs.readFile(file,(err,data)=>{if(err)return json(res,404,{error:'Not found'});res.writeHead(200,{'content-type':mime[ext]||'application/octet-stream','cache-control':'no-store'});res.end(data)})
}catch(e){json(res,400,{error:e.message})}};
const server=http.createServer(handler);
const maintenance=setInterval(()=>{try{maintainPayments()}catch{console.error('Payment maintenance failed; retrying on next cycle')}},500);maintenance.unref();
server.on('close',()=>clearInterval(maintenance));
server.listen(port,process.env.HOST||'127.0.0.1',()=>{port=server.address().port;console.log(`PaysysLabs BAAP v1.2.0 http://localhost:${port}\nNode 22.13+ required. SQLite persists under ./data`)});
