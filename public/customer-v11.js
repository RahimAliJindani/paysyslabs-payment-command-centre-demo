// Storefront selection hands off to the same recoverable, token-scoped checkout as QR scans.
const $=s=>document.querySelector(s);
const id=decodeURIComponent(location.pathname.split('/').pop()),query=new URLSearchParams(location.search);
let merchant,method=query.get('method')==='payid'?'payid':'payto',kind='mobile',token,busy=false;
const money=n=>new Intl.NumberFormat('en-AU',{style:'currency',currency:'AUD'}).format(n);
async function api(url,payload){
 const r=await fetch(url,{method:payload?'POST':'GET',headers:payload?{'content-type':'application/json'}:{},body:payload?JSON.stringify(payload):undefined});
 const data=await r.json();if(!r.ok)throw Error(data.error||'Request failed');return data;
}
function setKind(value){kind=value;for(const k of ['mobile','email']){$('#'+k).classList.toggle('selected',k===kind);$('#'+k).setAttribute('aria-pressed',String(k===kind))}$('#prefix').hidden=kind==='email';$('#identity').value='';$('#identity').type=kind==='mobile'?'tel':'email';$('#identity').inputMode=kind==='mobile'?'numeric':'email';$('#identity').maxLength=kind==='mobile'?9:254;$('#identity').placeholder=kind==='mobile'?'412345678':'customer@example.com';$('#identity').autocomplete=kind==='mobile'?'tel-national':'email'}
function setMethod(value){method=value;for(const k of ['payto','payid']){$('#'+k).classList.toggle('selected',k===method);$('#'+k).setAttribute('aria-pressed',String(k===method))}}
function paint(){const [name,price]=merchant.items[Number($('#item').value)];$('#product').textContent=name;$('#amount').textContent=money(price)}
$('#confirmIdentity').onclick=async()=>{
 if(busy)return;busy=true;$('#confirmIdentity').disabled=true;$('#error').textContent='';
 try{
  const raw=$('#identity').value.trim();
  if(kind==='mobile'&&!/^4\d{8}$/.test(raw))throw Error('Enter 9 digits beginning with 4 after +61.');
  if(kind==='email'&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw))throw Error('Enter a valid email address.');
  if(!token){const t=await api('/api/public/checkouts',{merchantId:id,itemIndex:Number($('#item').value),method});token=t.qrToken;history.replaceState(null,'','/pay/'+token)}
  await api('/api/public/'+token+'/identity',{identityType:kind,identity:kind==='mobile'?'+61'+raw:raw});
  location.replace('/pay/'+token);
 }catch(e){$('#error').textContent=e.message}finally{busy=false;$('#confirmIdentity').disabled=false}
};
async function init(){
 merchant=(await api('/api/merchants')).find(m=>m.id===id);if(!merchant)throw Error('Business not found');
 $('#merchantName').textContent=merchant.name;
 for(const [i,[name,price]] of merchant.items.entries()){const option=document.createElement('option');option.value=i;option.textContent=`${name} · ${money(price)}`;$('#item').append(option)}
 const ix=Number(query.get('itemIndex'));if(Number.isInteger(ix)&&ix>=0&&ix<merchant.items.length)$('#item').value=String(ix);
 $('#item').onchange=paint;
 for(const k of ['mobile','email'])$('#'+k).onclick=()=>setKind(k);
 for(const k of ['payto','payid'])$('#'+k).onclick=()=>setMethod(k);
 $('#identity').oninput=()=>{if(kind==='mobile')$('#identity').value=$('#identity').value.replace(/\D/g,'').slice(0,9)};
 setKind(kind);setMethod(method);paint();
}
init().catch(e=>{$('#error').textContent=e.message;$('#confirmIdentity').disabled=true});
