// Shared sign-in boundary for merchant pages. Admin sessions can operate all demo merchants.
export async function requireAccess(){
 const access=await fetch('/api/access',{cache:'no-store'}).then(r=>r.json());
 if(access.role!=='guest')return access;
 const section=document.createElement('section');section.className='access-panel';
 section.innerHTML=`<h1>Sign in to your business</h1><p>Merchant reports and terminals require an authorised session.</p>
 <form id="merchantLogin"><label>Business<select id="loginMerchant" required></select></label>
 <label>Username<input id="merchantUsername" autocomplete="username" required></label>
 <label>Password<input id="merchantPassword" type="password" autocomplete="current-password" required></label>
 <button type="submit" class="primary">Sign in</button><p id="loginError" role="alert"></p></form>
 <p>Demo reviewer? <a href="/admin.html">Sign in to Enterprise Admin</a>, then return to the terminal.</p>`;
 document.querySelector('main').replaceChildren(section);
 const merchants=await fetch('/api/merchants').then(r=>r.json());
 for(const m of merchants){const option=document.createElement('option');option.value=m.id;option.textContent=m.name;section.querySelector('select').append(option)}
 section.querySelector('form').onsubmit=async e=>{
  e.preventDefault();const button=section.querySelector('button');button.disabled=true;
  try{
   const r=await fetch('/api/merchant/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({merchantId:section.querySelector('select').value,username:section.querySelector('#merchantUsername').value,password:section.querySelector('#merchantPassword').value})});
   const data=await r.json();if(!r.ok)throw Error(data.error||'Sign in failed');location.reload();
  }catch(error){section.querySelector('#loginError').textContent=error.message}finally{button.disabled=false}
 };
 return null;
}
export function addSignOut(access){
 const button=document.createElement('button');button.className='session-signout';button.textContent='Sign out';
 button.onclick=async()=>{
  await fetch(access.role==='admin'?'/api/admin/logout':'/api/merchant/logout',{method:'POST'});
  try{for(const key of Object.keys(sessionStorage))if(key.startsWith('paysyslabs:'))sessionStorage.removeItem(key)}catch{}
  location.reload();
 };
 document.querySelector('header').append(button);
}
