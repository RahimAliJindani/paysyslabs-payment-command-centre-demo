import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
export const accounts={salon:{username:'salon-reviewer',password:'synthetic-salon-password'},gym:{username:'gym-reviewer',password:'synthetic-gym-password'}};
export async function demo(options={}){
 const directory=mkdtempSync(path.join(tmpdir(),'paysyslabs-test-'));
 let child,base,cookie='';
 async function start(){
  let output='',failureCode='';
  child=spawn(process.execPath,['server/index.js'],{env:{...process.env,HOST:'127.0.0.1',PORT:'0',DATA_DIR:directory,PUBLIC_DEMO_MODE:'0',PUBLIC_BASE_URL:'',SANDBOX_AUTO_CONFIRM:'0',MERCHANT_ACCOUNTS:JSON.stringify(accounts),ADMIN_DEMO_OTP:'786123',...options},stdio:['ignore','pipe','pipe']});
  // Never print inherited environment variables or configuration values on failure.
  const exited=once(child,'exit');
  try{
   await Promise.race([
    new Promise((resolve,reject)=>{child.on('error',reject);child.stdout.on('data',chunk=>{output+=chunk.toString();const match=output.match(/http:\/\/localhost:(\d+)/);if(match){base='http://127.0.0.1:'+match[1];resolve()}});child.stderr.on('data',chunk=>{failureCode=chunk.toString().match(/EPERM|EACCES|SQLITE_[A-Z_]+|SyntaxError|ReferenceError|TypeError/)?.[0]||failureCode});}),
    exited.then(()=>{throw Error('Isolated test server exited before readiness'+(failureCode?' ('+failureCode+')':''))}),
    new Promise((_,reject)=>{const timer=setTimeout(()=>reject(Error('Isolated test server did not become ready')),8000);timer.unref()}),
   ]);
  }catch(error){await stop();throw error}
 }
 async function stop(){if(child&&child.exitCode===null&&child.signalCode===null){const exited=once(child,'exit');child.kill();await exited}}
 async function request(route,{method='GET',body,auth=cookie,headers={},signal}={}){
  const response=await fetch(base+route,{method,headers:{...(body!==undefined?{'content-type':'application/json'}:{}),...(auth?{cookie:auth}:{}),...headers},body:body!==undefined?JSON.stringify(body):undefined,signal});
  return response;
 }
 async function api(route,method='GET',body,auth=cookie){const response=await request(route,{method,body,auth});return {status:response.status,data:await response.json(),response}}
 async function admin(){const r=await request('/api/admin/login',{method:'POST',body:{email:'reviewer@example.com',otp:'786123'},auth:''});if(!r.ok)throw Error('Test admin login failed');cookie=r.headers.getSetCookie()[0].split(';')[0];return cookie}
 async function merchant(id){const r=await request('/api/merchant/login',{method:'POST',body:{merchantId:id,...accounts[id]},auth:''});if(!r.ok)throw Error('Test merchant login failed');return r.headers.getSetCookie()[0].split(';')[0]}
 try{await start()}catch(error){rmSync(directory,{recursive:true,force:true});throw error}
 return {get base(){return base},directory,api,request,admin,merchant,start,stop,async close(){await stop();rmSync(directory,{recursive:true,force:true})}};
}
