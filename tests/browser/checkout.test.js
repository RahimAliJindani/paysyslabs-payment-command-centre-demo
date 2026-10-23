import test from 'node:test';
import assert from 'node:assert/strict';
import {demo,accounts} from '../helpers/server.js';
import {browser,chromePath} from '../helpers/browser.js';

test('real browser: mobile navigation, exact terminal session, QR recovery and both payment rails',{skip:!chromePath,timeout:60000},async t=>{
 const app=await demo({SANDBOX_AUTO_CONFIRM:'1'});t.after(()=>app.close());
 const adminCookie=await app.admin();
 const ui=await browser();t.after(()=>ui.close());
 await ui.command('Network.setCookie',{name:'baap_admin',value:adminCookie.slice('baap_admin='.length),url:app.base+'/api',path:'/api',httpOnly:true,sameSite:'Strict'});
 await ui.viewport(390);
 // A historical success for the same product must not become the active terminal purchase.
 const old=(await app.api('/api/transactions','POST',{merchantId:'restaurant',itemIndex:0,method:'payto',phone:'+61412345678'})).data;
 for(const action of ['start','authorise','collect','confirm'])await app.api('/api/transactions/'+old.id+'/action','POST',{action});
 await ui.navigate(app.base+'/');
 await ui.until('document.querySelector("#item").options.length > 0 && document.querySelector("#connection").textContent === "Connected"');
 assert.equal(await ui.evaluate('document.querySelector("#status").textContent'),'Create a checkout to begin');
 assert.equal(await ui.evaluate('getComputedStyle(document.querySelector("a[href=\'/merchant.html\']")).display !== "none"'),true);
 assert.equal(await ui.evaluate('document.documentElement.scrollWidth <= innerWidth'),true);
 await ui.evaluate('document.querySelector("#newCheckout").click()');
 await ui.until('!document.querySelector("#checkoutLink").hidden && document.querySelector("#ipadRef").textContent !== "—"');
 const reference=await ui.evaluate('document.querySelector("#ipadRef").textContent');assert.notEqual(reference,old.reference);
 assert.equal(await ui.evaluate('document.querySelector("#status").textContent'),'Awaiting customer');
 await ui.navigate(app.base+'/');await ui.until('document.querySelector("#ipadRef").textContent === '+JSON.stringify(reference));
 assert.equal(await ui.evaluate('document.querySelector("#status").textContent'),'Awaiting customer');
 for(const width of [320,768,1280]){await ui.viewport(width);assert.equal(await ui.evaluate('document.documentElement.scrollWidth <= innerWidth'),true,'terminal fits '+width)}
 for(const page of ['/merchant.html?merchantId=salon','/admin.html']){
  await ui.viewport(390);await ui.navigate(app.base+page);
  await ui.until(page.startsWith('/admin')?'document.querySelector("#data tbody") !== null':'document.querySelector("#cards").children.length === 4');
  assert.equal(await ui.evaluate('document.documentElement.scrollWidth <= innerWidth'),true,page+' fits mobile');
 }
 await ui.until(`document.querySelector('[data-operation="reconcile"]') !== null`);
 await ui.evaluate(`document.querySelector('[data-operation="reconcile"]').click()`);
 await ui.until('document.querySelector("#notice").textContent.startsWith("Sandbox operation completed")');
 assert.equal((await app.api('/api/transactions/'+old.id)).data.settlement,'RECONCILED');
 await ui.command('Network.clearBrowserCookies');
 await ui.navigate(app.base+'/');await ui.until(`document.querySelector('#loginMerchant option[value="salon"]') !== null`);
 assert.equal(await ui.evaluate('document.querySelector(".access-panel").getBoundingClientRect().top < innerHeight'),true,'sign-in panel is visible without scrolling');
 await ui.evaluate('document.querySelector("#loginMerchant").value="salon";document.querySelector("#merchantUsername").value='+JSON.stringify(accounts.salon.username)+';document.querySelector("#merchantPassword").value='+JSON.stringify(accounts.salon.password)+';document.querySelector("#merchantLogin").requestSubmit()');
 await ui.until('document.querySelector("#merchant")?.options.length === 1 && document.querySelector("#connection").textContent === "Connected"');
 assert.equal(await ui.evaluate('document.querySelector("#merchant").value'),'salon');
 await ui.evaluate('document.querySelector(".session-signout").click()');await ui.until('document.querySelector("#merchantLogin") !== null');
 for(const method of ['payid','payto']){
  const tx=(await app.api('/api/transactions','POST',{merchantId:'salon',itemIndex:0,method,phone:'+61412345678'})).data;
  const action=async name=>app.api('/api/public/'+tx.qrToken+'/action','POST',{action:name},'');
  await action('start');if(method==='payto')await action('authorise');
  // Scan an already-started QR, and restore it again after a reload.
  await ui.navigate(app.base+'/pay/'+tx.qrToken);await ui.until('!document.querySelector("#authoriseStep").hidden');
  await ui.command('Page.reload');await ui.until('!document.querySelector("#authoriseStep").hidden');
  assert.equal(await ui.evaluate('document.documentElement.scrollWidth <= innerWidth'),true);
  await ui.evaluate('document.querySelector("#slideThumb").dispatchEvent(new KeyboardEvent("keydown",{key:"Enter",bubbles:true}))');
  await ui.until('!document.querySelector("#resultStep").hidden');
  await ui.command('Page.reload');await ui.until('document.querySelector("#resultTitle").textContent === "Sandbox payment confirmed"');
 }
 // Storefront handoff retains the same token through refresh.
 await ui.navigate(app.base+'/checkout/salon?itemIndex=0&method=payid');
 await ui.until('document.querySelector("#item").options.length > 0');
 await ui.evaluate('document.querySelector("#identity").value="412345678";document.querySelector("#confirmIdentity").click()');
 await ui.until('location.pathname.startsWith("/pay/") && document.querySelector("#messageStep") && !document.querySelector("#messageStep").hidden');
 const tokenPath=await ui.evaluate('location.pathname');await ui.command('Page.reload');
 await ui.until('document.querySelector("#messageStep") && !document.querySelector("#messageStep").hidden');
 assert.equal(await ui.evaluate('location.pathname'),tokenPath);
 assert.deepEqual(ui.errors,[]);
});
