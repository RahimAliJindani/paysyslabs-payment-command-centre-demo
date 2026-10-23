import {requireAccess,addSignOut} from './access.js';
const $=s=>document.querySelector(s);
const money=n=>new Intl.NumberFormat('en-AU',{style:'currency',currency:'AUD'}).format(n);
let merchant,merchants=[],method='payto',active=null,events,revision=0,loading=false;
async function api(url,payload){
 const r=await fetch(url,{cache:'no-store',method:payload?'POST':'GET',headers:payload?{'content-type':'application/json'}:{},body:payload?JSON.stringify(payload):undefined});
 const data=await r.json();if(!r.ok)throw Error(data.error||'Request failed');return data;
}
const key=()=>`paysyslabs:checkout:${merchant.id}:${$('#item').value}:${method}`;
function save(){try{if(active)sessionStorage.setItem(key(),JSON.stringify(active));else sessionStorage.removeItem(key())}catch{}}
function reset(){
 revision++;active=null;
 try{active=JSON.parse(sessionStorage.getItem(key())||'null')}catch{}
 $('#checkoutLink').hidden=!active;$('#paymentQR').hidden=!active;
 if(active){$('#checkoutLink').href=active.qrUrl;$('#paymentQR').src=active.qrSvgUrl}
 const [name,price]=merchant.items[Number($('#item').value)];
 $('#itemName').textContent=name;$('#amount').textContent=money(price);$('#ipadMerchant').textContent=merchant.name;
 $('#ipadItem').textContent=name;$('#ipadAmount').textContent=money(price);$('#ipadRail').textContent=method==='payto'?'PayTo':'PayID';
 $('#ipadRef').textContent='—';$('#ipadReceipt').textContent='Not posted';$('#ipadSettlement').textContent='Unreconciled';
 $('#status').textContent=active?'Loading this checkout…':'Create a checkout to begin';$('#status').className='status';
 updateStatus();
}
function paint(t){
 $('#ipadRef').textContent=t.reference;$('#ipadReceipt').textContent=t.receipt;$('#ipadSettlement').textContent=t.settlement;
 const labels={CREATED:'Awaiting customer',AGREEMENT_PENDING:'Awaiting PayTo authorisation',AWAITING_AUTH:'Awaiting PayID authorisation',AGREEMENT_AUTHORISED:'Agreement authorised; collection pending',PROCESSING:'Bank simulation processing',CONFIRMED:'✓ Payment successful',DECLINED:'Payment declined',FAILED:'Payment blocked',UNKNOWN:'Outcome unknown — verification required',EXPIRED:'Checkout expired'};
 $('#status').textContent=labels[t.status]||t.status;
 $('#status').className='status '+(t.status==='CONFIRMED'?'success':['DECLINED','FAILED','EXPIRED','UNKNOWN'].includes(t.status)?'fail':'pending');
}
async function updateStatus(){
 if(!merchant||loading)return;loading=true;const version=revision,id=merchant.id,checkout=active;
 try{
  const [recent,current]=await Promise.all([api('/api/transactions?merchantId='+encodeURIComponent(id)),checkout?api('/api/transactions/'+checkout.id):null]);
  if(version!==revision)return;
  $('#recent').replaceChildren();
  if(!recent.length)$('#recent').textContent='No payments yet for this merchant.';
  for(const t of recent.slice(0,5)){const row=document.createElement('div');row.className='recentrow';row.textContent=`${t.reference} · ${money(t.amount)} · ${t.status}`;$('#recent').append(row)}
  if(current)paint(current);
  $('#connection').textContent='Connected';
 }catch(e){if(version===revision){$('#connection').textContent='Connection unavailable';$('#status').textContent=e.message}}
 finally{loading=false;if(version!==revision)updateStatus()}
}
async function selectMerchant(){
 revision++;merchant=merchants.find(m=>m.id===$('#merchant').value);
 $('#item').replaceChildren();for(const [i,[name,price]] of merchant.items.entries()){const option=document.createElement('option');option.value=i;option.textContent=`${name} · ${money(price)}`;$('#item').append(option)}
 $('#vcardQR').src='/api/business-card?merchantId='+encodeURIComponent(merchant.id);
 const id=merchant.id,profile=await api('/api/business-profile?merchantId='+encodeURIComponent(id));if(id!==merchant.id)return;
 $('#businessDetails').textContent=`${profile.name} · ${profile.email} · ${profile.phone} · Synthetic contact profile`;
 reset();events?.close();events=new EventSource('/api/events?merchantId='+encodeURIComponent(id));
 events.onopen=()=>{$('#connection').textContent='Connected'};
 events.onerror=()=>{$('#connection').textContent='Reconnecting…'};
 events.onmessage=()=>updateStatus();
}
$('#newCheckout').onclick=async()=>{
 const button=$('#newCheckout'),version=revision;button.disabled=true;
 try{
  const t=await api('/api/transactions',{merchantId:merchant.id,itemIndex:Number($('#item').value),method});
  if(version!==revision)return;
  active={id:t.id,qrUrl:t.qrUrl,qrSvgUrl:t.qrSvgUrl};save();reset();
 }catch(e){$('#status').textContent=e.message}finally{button.disabled=false}
};
async function init(){
 const access=await requireAccess();if(!access)return;addSignOut(access);
 merchants=(await api('/api/merchants')).filter(m=>access.merchantIds.includes(m.id));
 for(const m of merchants){const option=document.createElement('option');option.value=m.id;option.textContent=`${m.icon} ${m.name}`;$('#merchant').append(option)}
 if(merchants.some(m=>m.id==='restaurant'))$('#merchant').value='restaurant';
 $('#merchant').onchange=()=>selectMerchant().catch(e=>{$('#status').textContent=e.message});$('#item').onchange=reset;
 for(const value of ['payto','payid'])$('#'+value).onclick=()=>{method=value;for(const v of ['payto','payid']){$('#'+v).classList.toggle('selected',v===value);$('#'+v).setAttribute('aria-pressed',String(v===value))}reset()};
 await selectMerchant();setInterval(()=>{if(!document.hidden)updateStatus()},10000);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)updateStatus()});
}
init().catch(e=>{const target=$('#status')||$('#loginError');if(target)target.textContent=e.message});
