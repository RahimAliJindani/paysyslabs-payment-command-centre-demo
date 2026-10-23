import {existsSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {setTimeout as delay} from 'node:timers/promises';
export const chromePath=[process.env.CHROME_BIN,'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome','/usr/bin/google-chrome','/usr/bin/chromium','/usr/bin/chromium-browser'].find(p=>p&&existsSync(p));
export async function browser(){
 const profile=mkdtempSync(path.join(tmpdir(),'paysyslabs-browser-'));
 const child=spawn(chromePath,['--headless=new','--remote-debugging-port=0','--no-first-run','--no-default-browser-check','--disable-background-networking','--disable-component-update','--disable-sync','--disable-extensions','--user-data-dir='+profile,'about:blank'],{stdio:['ignore','ignore','pipe']});
 let socket,sequence=0,sessionId;const pending=new Map(),errors=[];
 async function close(){
  socket?.close();if(child.exitCode===null&&child.signalCode===null){const exited=once(child,'exit');child.kill();await exited}
  rmSync(profile,{recursive:true,force:true});
 }
 try{
  const endpoint=await new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>reject(Error('Headless browser did not become ready')),15000);timer.unref();
   let output='';child.stderr.on('data',chunk=>{output+=chunk.toString();const match=output.match(/DevTools listening on (ws:\/\/[^\s]+)/);if(match){clearTimeout(timer);resolve(match[1])}});
   child.on('error',reject);child.on('exit',()=>{clearTimeout(timer);reject(Error('Headless browser exited'))});
  });
  socket=new WebSocket(endpoint);await once(socket,'open');
  socket.addEventListener('message',event=>{
   const message=JSON.parse(event.data);
   if(message.id){const callbacks=pending.get(message.id);if(callbacks){pending.delete(message.id);clearTimeout(callbacks.timer);if(message.error)callbacks.reject(Error(message.error.message));else callbacks.resolve(message.result)}}
   if(message.method==='Runtime.exceptionThrown')errors.push(message.params.exceptionDetails.text);
  });
  async function command(method,params={},target=sessionId){
   const id=++sequence;
   return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{pending.delete(id);reject(Error('Browser command timed out: '+method))},10000);timer.unref();pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params,...(target?{sessionId:target}:{})}))});
  }
  const target=await command('Target.createTarget',{url:'about:blank'},null);
  sessionId=(await command('Target.attachToTarget',{targetId:target.targetId,flatten:true},null)).sessionId;
  await command('Page.enable');await command('Runtime.enable');await command('Network.enable');
  async function evaluate(expression){const r=await command('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error('Browser evaluation failed: '+r.exceptionDetails.text);return r.result.value}
  async function until(expression){for(let i=0;i<60;i++){if(await evaluate(expression))return;await delay(100)}throw Error('Browser condition not reached: '+expression)}
  async function navigate(url){await command('Page.navigate',{url});await until('document.readyState === "complete"')}
  async function viewport(width,height=844){await command('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<600})}
  return {command,evaluate,until,navigate,viewport,errors,close};
 }catch(error){await close();throw error}
}
