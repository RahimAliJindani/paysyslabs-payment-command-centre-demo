import {askEnterprise} from './copilot.js';
import http from 'node:http';
import {timingSafeEqual} from 'node:crypto';
import {login,session,logout,adminOverview,adminTransactions,adminEvents,adminSettlements,adminMerchantLookup,adminAudit,exportCsv,logAccess} from './admin.js';import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {merchants} from './catalog.js';import {qrSvg} from './qr.js';import {createPayment,confirmCustomer,getPayment,listPayments,lookupToken,canonical,advance,reconcile,insights,merchantDashboard,subscribe,diagnostics} from './store.js';
const sandboxAutoConfirm=process.env.SANDBOX_AUTO_CONFIRM!=='0'; // Local-only synthetic provider, never a real bank event
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../public');const port=Number(process.env.PORT||4173);
const json=(res,code,data)=>{res.writeHead(code,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'});res.end(JSON.stringify(data))};
const body=async req=>{let s='';for await(const c of req){s+=c;if(s.length>12000)throw Error('Request too large')}try{return JSON.parse(s||'{}')}catch{throw Error('Invalid JSON')}};
const publicDemo=process.env.PUBLIC_DEMO_MODE==='1';
const demoUsername=process.env.DEMO_USERNAME||'';
const demoPassword=process.env.DEMO_PASSWORD||'';
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
const url=new URL(req.url,'http://localhost'),p=url.pathname,base=process.env.PUBLIC_BASE_URL||`http://${req.headers.host||'localhost:'+port}`;
res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Frame-Options','DENY');res.setHeader('Content-Security-Policy',"default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'self'");
if(p==='/api/admin/login'&&req.method==='POST'){const token=login(await body(req),req.socket.remoteAddress);res.setHeader('Set-Cookie',`baap_admin=${token}; HttpOnly; ${publicDemo?"Secure; ":""}SameSite=Strict; Path=/api/admin; Max-Age=3600`);return json(res,200,{ok:true,mode:'LOCAL_DEMO_ONLY'})}
if(p.startsWith('/api/admin/')){const actor=session(req);if(!actor)return json(res,401,{error:'Admin login required'});if(p==='/api/admin/logout'&&req.method==='POST'){logout(req);res.setHeader('Set-Cookie','baap_admin=; HttpOnly; SameSite=Strict; Path=/api/admin; Max-Age=0');return json(res,200,{ok:true})}
if(req.method!=='GET'&&p!=='/api/admin/ask')return json(res,405,{error:'Method not allowed'});
if(p==='/api/admin/me')return json(res,200,{email:actor,role:'BAAP demo reviewer'});
if(p==='/api/admin/ask'&&req.method==='POST')return json(res,200,askEnterprise((await body(req)).question,actor));
if(p==='/api/admin/overview')return json(res,200,adminOverview());
if(p==='/api/admin/transactions')return json(res,200,adminTransactions());
if(p==='/api/admin/settlements')return json(res,200,adminSettlements());
if(p==='/api/admin/logs')return json(res,200,adminEvents());
if(p==='/api/admin/audit')return json(res,200,adminAudit());
if(p==='/api/admin/lookup')return json(res,200,adminMerchantLookup(url.searchParams.get('q')||''));
if(p==='/api/admin/export'){const type=url.searchParams.get('type');const rows=type==='settlements'?adminSettlements():type==='logs'?adminEvents():adminTransactions();logAccess(actor,'EXPORT_'+type);res.writeHead(200,{'content-type':'text/csv; charset=utf-8','content-disposition':`attachment; filename="paysyslabs-${type==='settlements'?'settlements':type==='logs'?'logs':'transactions'}.csv"`,'cache-control':'no-store'});return res.end(exportCsv(rows))}
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
if(req.method==='GET'&&p==='/api/transactions')return json(res,200,listPayments());
if(req.method==='GET'&&p==='/api/merchant-dashboard')return json(res,200,merchantDashboard(url.searchParams.get('merchantId')));
if(req.method==='GET'&&p==='/api/insights')return json(res,200,insights(url.searchParams.get('merchantId')));
if(req.method==='GET'&&p==='/api/events'){res.writeHead(200,{'content-type':'text/event-stream','cache-control':'no-cache','connection':'keep-alive'});res.write(': connected\n\n');const send=e=>res.write(`data: ${JSON.stringify(e)}\n\n`);const unsubscribe=subscribe(send);const interval=setInterval(()=>res.write(': heartbeat\n\n'),20000);req.on('close',()=>{clearInterval(interval);unsubscribe()});return}
if(req.method==='POST'&&p==='/api/transactions'){const t=createPayment(await body(req));return json(res,201,{...t,qrUrl:`${base}/pay/${t.qrToken}`,qrSvgUrl:`/api/qr/${t.qrToken}`})}
const pay=p.match(/^\/api\/public\/([A-Za-z0-9_-]{32})$/);if(pay&&req.method==='GET'){const t=lookupToken(pay[1]);if(!t)return json(res,404,{error:'Session not found'});return json(res,200,{reference:t.reference,merchantName:t.merchantName,item:t.item,amount:t.amount,method:t.method,status:t.status,expiresAt:t.expiresAt,agreement:t.agreement,receipt:t.receipt})}
const identityRoute=p.match(/^\/api\/public\/([A-Za-z0-9_-]{32})\/identity$/);if(identityRoute&&req.method==='POST')return json(res,200,confirmCustomer(identityRoute[1],await body(req)));
const customerAction=p.match(/^\/api\/public\/([A-Za-z0-9_-]{32})\/action$/);
if(customerAction&&req.method==='POST'){
 const t=lookupToken(customerAction[1]);if(!t)return json(res,404,{error:'Session not found'});
 const action=(await body(req)).action;
 if(!['start','authorise','collect','decline'].includes(action))return json(res,403,{error:'This action requires a trusted operator/provider event'});
 const result=advance(t.id,action);
 if(sandboxAutoConfirm && result.status==='PROCESSING' && ['authorise','collect'].includes(action)){
   const txId=t.id;setTimeout(()=>{try{const latest=getPayment(txId);if(latest?.status==='PROCESSING')advance(txId,'confirm')}catch(e){console.error('Sandbox confirmation failed:',e.message)}},1400).unref();
 }
 return json(res,200,result);
}
const qr=p.match(/^\/api\/qr\/([A-Za-z0-9_-]{32})$/);if(qr&&req.method==='GET'){if(!lookupToken(qr[1]))return json(res,404,{error:'QR session not found'});res.writeHead(200,{'content-type':'image/svg+xml; charset=utf-8','cache-control':'no-store'});return res.end(qrSvg(`${base}/pay/${qr[1]}`))}
const m=p.match(/^\/api\/transactions\/([0-9a-f-]+)(?:\/(action|reconcile|inspect))?$/);if(m){const t=getPayment(m[1]);if(!t)return json(res,404,{error:'Transaction not found'});if(req.method==='GET'&&!m[2])return json(res,200,t);if(req.method==='GET'&&m[2]==='inspect')return json(res,200,canonical(m[1]));if(req.method==='POST'&&m[2]==='action')return json(res,200,advance(m[1],(await body(req)).action));if(req.method==='POST'&&m[2]==='reconcile')return json(res,200,reconcile(m[1]))}
if(req.method!=='GET')return json(res,404,{error:'Not found'});
const requested=p.startsWith('/checkout/')?'/customer-v11.html':p.startsWith('/pay/')?'/customer.html':p.startsWith('/m/')?'/merchant-pay.html':p==='/'?'/index.html':p;const file=path.resolve(root,'.'+requested);if(!file.startsWith(root+path.sep))return json(res,403,{error:'Forbidden'});const ext=path.extname(file),mime={'.html':'text/html','.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml'};fs.readFile(file,(err,data)=>{if(err)return json(res,404,{error:'Not found'});res.writeHead(200,{'content-type':mime[ext]||'application/octet-stream','cache-control':'no-store'});res.end(data)})
}catch(e){json(res,400,{error:e.message})}};
http.createServer(handler).listen(port,'0.0.0.0',()=>console.log(`PaysysLabs BAAP v1.2.0 http://localhost:${port}\nNode 22.13+ required. SQLite persists under ./data`));
