const token=location.pathname.split('/').pop(),$=s=>document.querySelector(s);
let tx,step='identity',type='mobile',busy=false,refreshing=false;
const money=n=>new Intl.NumberFormat('en-AU',{style:'currency',currency:'AUD'}).format(n);
const labels={CREATED:'Ready to identify',AWAITING_AUTH:'Customer authorisation required',AGREEMENT_PENDING:'PayTo agreement approval required',AGREEMENT_AUTHORISED:'Agreement approved; collection pending',PROCESSING:'Waiting for simulated bank verification',UNKNOWN:'Outcome unknown — verification required',CONFIRMED:'Sandbox payment confirmed',DECLINED:'Payment declined',FAILED:'Payment rejected',EXPIRED:'Checkout expired'};
async function request(suffix,body){
 const r=await fetch('/api/public/'+encodeURIComponent(token)+suffix,{method:body?'POST':'GET',headers:body?{'content-type':'application/json'}:{},body:body?JSON.stringify(body):undefined,cache:'no-store'});
 const data=await r.json();if(!r.ok)throw Error(data.error||'Unable to continue');return data;
}
function error(value){$('#error').textContent=value||''}
function show(name){
 step=name;
 for(const s of ['identity','message','review','authorise','result'])$('#'+s+'Step').hidden=s!==name;
 ['p1','p2','p3'].forEach((s,i)=>$('#'+s).classList.toggle('active',i===(name==='identity'?0:['message','review'].includes(name)?1:2)));
}
function paint(){
 if(!tx)return;
 $('#merchant').textContent=tx.merchantName;$('#item').textContent=tx.item+' · '+tx.reference;$('#total').textContent=money(tx.amount);
 $('#reviewMerchant').textContent=tx.merchantName;$('#reviewItem').textContent=tx.item;$('#reviewAmount').textContent=money(tx.amount);
 $('#reviewMethod').textContent=tx.method==='payto'?'PayTo (agreement required)':'PayID (customer-initiated)';
 $('#state').textContent=labels[tx.status]||tx.status;
 $('#messageHeading').textContent=tx.method==='payto'?'PayTo agreement request':'PayID payment request';
 $('#messageSub').textContent=`A ${money(tx.amount)} sandbox request from ${tx.merchantName} is ready for review. No bank notification was sent.`;
 if(tx.status==='CREATED'){
  if(step==='identity')show(tx.identitySupplied?'message':'identity');
 }else if(['AWAITING_AUTH','AGREEMENT_PENDING','AGREEMENT_AUTHORISED'].includes(tx.status)){
  show('authorise');
  $('#authTitle').textContent=tx.status==='AGREEMENT_AUTHORISED'?'Initiate PayTo collection':tx.method==='payto'?'Approve PayTo agreement':'Authorise PayID payment';
  $('#authHint').textContent='This is a simulation. Final payment requires a separate simulated provider confirmation.';
 }else{
  show('result');$('#resultIcon').textContent=tx.status==='CONFIRMED'?'✓':tx.status==='PROCESSING'?'◷':'!';
  $('#resultTitle').textContent=labels[tx.status]||tx.status;
  $('#resultText').textContent=tx.status==='CONFIRMED'?'Your simulated payment is confirmed. The merchant has been updated.':tx.status==='PROCESSING'?'Payment is pending. Refreshing or reopening this link safely restores its status.':tx.status==='UNKNOWN'?'Do not retry. An authorised operator must resolve the provider outcome.':tx.status==='EXPIRED'?'This checkout has expired. Ask the merchant for a new checkout.':'No successful payment was recorded.';
 }
}
async function refresh(){
 if(busy||refreshing)return;refreshing=true;
 try{tx=await request('');paint();error('')}catch(e){error(e.message)}finally{refreshing=false}
}
async function act(fn){
 if(busy||refreshing)return;busy=true;error('');
 const controls=[...document.querySelectorAll('button')];controls.forEach(b=>b.disabled=true);
 try{await fn();paint()}catch(e){error(e.message);try{tx=await request('');paint()}catch{}}
 finally{busy=false;controls.forEach(b=>b.disabled=false)}
}
function selectType(value){
 type=value;
 for(const [id,kind] of [['mobileBtn','mobile'],['emailBtn','email']]){$('#'+id).classList.toggle('chosen',kind===type);$('#'+id).setAttribute('aria-pressed',String(kind===type))}
 $('#identityLabel').textContent=type==='mobile'?'Australian mobile PayID (+61 and 9 digits)':'Email PayID';
 $('#identity').placeholder=type==='mobile'?'412345678':'customer@example.com';$('#identity').inputMode=type==='mobile'?'numeric':'email';
 $('#identity').type=type==='mobile'?'tel':'email';$('#identity').maxLength=type==='mobile'?9:254;$('#dialCode').hidden=type!=='mobile';
 $('#identityHelp').textContent=type==='mobile'?'Enter exactly 9 digits after +61, beginning with 4.':'Use a fictional email address as your PayID identifier.';$('#identity').value='';
}
$('#mobileBtn').onclick=()=>selectType('mobile');$('#emailBtn').onclick=()=>selectType('email');
$('#identity').oninput=()=>{if(type==='mobile')$('#identity').value=$('#identity').value.replace(/\D/g,'').slice(0,9)};
$('#identityConfirm').onclick=()=>act(async()=>{
 const value=$('#identity').value.trim();if(type==='mobile'&&!/^4\d{8}$/.test(value))throw Error('Enter 9 digits beginning with 4 after +61.');
 tx=await request('/identity',{identityType:type,identity:type==='mobile'?'+61'+value:value});show('message');
});
$('#openMessage').onclick=()=>{
 show('review');$('#mappingFields').replaceChildren();
 for(const [key,value] of [['Merchant',tx.merchantName],['Purchase',tx.item],['Amount',money(tx.amount)],['Reference',tx.reference],['Payment rail',tx.method==='payto'?'PayTo sandbox':'PayID sandbox'],['Status',tx.status],['Settlement','Not yet settled']]){
  const line=document.createElement('div');line.className='mapping-line';const label=document.createElement('span');label.textContent=key;const data=document.createElement('strong');data.textContent=value;line.append(label,data);$('#mappingFields').append(line);
 }
};
$('#reviewConfirm').onclick=()=>act(async()=>{tx=await request('/action',{action:'start'})});
$('#decline').onclick=()=>act(async()=>{tx=await request('/action',{action:'decline'})});
$('#refreshStatus').onclick=refresh;
const track=$('#slideTrack'),thumb=$('#slideThumb');let dragging=false,startX=0,offset=0;
function position(value){offset=Math.max(0,Math.min(value,track.clientWidth-thumb.clientWidth-10));thumb.style.transform=`translateX(${offset}px)`;$('#slideFill').style.width=(offset+thumb.clientWidth)+'px'}
function finish(){return act(async()=>{
 if(tx.status!=='AGREEMENT_AUTHORISED')tx=await request('/action',{action:'authorise'});
 if(tx.status==='AGREEMENT_AUTHORISED')tx=await request('/action',{action:'collect'});
 position(0);
})}
thumb.addEventListener('pointerdown',e=>{if(busy)return;dragging=true;startX=e.clientX-offset;thumb.setPointerCapture(e.pointerId)});
thumb.addEventListener('pointermove',e=>{if(dragging)position(e.clientX-startX)});
thumb.addEventListener('pointerup',()=>{if(!dragging)return;dragging=false;if(offset>track.clientWidth-thumb.clientWidth-38)finish();else position(0)});
thumb.addEventListener('pointercancel',()=>{dragging=false;position(0)});
thumb.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();finish()}});
selectType('mobile');refresh();
setInterval(()=>{if(!document.hidden&&(!tx||!['CONFIRMED','FAILED','DECLINED','EXPIRED'].includes(tx.status)))refresh()},2000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh()});
