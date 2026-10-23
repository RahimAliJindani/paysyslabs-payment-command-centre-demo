import {adminTransactions,adminSettlements,adminEvents,logAccess} from './admin.js';
import {merchants} from './catalog.js';
const aud=n=>new Intl.NumberFormat('en-AU',{style:'currency',currency:'AUD'}).format(n/100);
const name=id=>merchants.find(m=>m.id===id)?.name||id;
export function askEnterprise(question,actor){
 if(typeof question!=='string'||question.length<3||question.length>500)throw Error('Ask a question between 3 and 500 characters');
 const q=question.toLowerCase(),tx=adminTransactions(),confirmed=tx.filter(t=>t.status==='CONFIRMED'&&t.receipt==='POSTED'),failed=tx.filter(t=>['FAILED','DECLINED','EXPIRED'].includes(t.status)),sett=adminSettlements(),events=adminEvents();
 const total=confirmed.reduce((n,t)=>n+t.amount_cents,0),sum=rows=>rows.reduce((n,t)=>n+t.amount_cents,0);
 const by=(rows,key)=>Object.entries(rows.reduce((a,t)=>(a[key(t)]=(a[key(t)]||[]).concat(t),a),{})).map(([label,items])=>({label,count:items.length,amount_cents:sum(items)})).sort((a,b)=>b.amount_cents-a.amount_cents);
 let intent='overview',headline,answer,rows=[],recommendation='Use these sandbox results to choose an operational follow-up; do not infer real-world customer behaviour.';
 if(/(fail|declin|reject|error|exception|risk|fraud|guardrail)/.test(q)){
  intent='exceptions';headline='Exceptions and protected payment outcomes';answer=`${failed.length} of ${tx.length} sandbox payment attempts ended in failed, declined or expired states. ${tx.filter(t=>t.status==='UNKNOWN').length} have an unknown provider outcome. None of these should be treated as confirmed receipts.`;
  rows=by(failed,t=>t.status);recommendation='Investigate repeated failure reasons and unknown outcomes before retrying; do not post a receipt without verified confirmation.';
 }else if(/(reconcil|settle|unmatched|ledger)/.test(q)){
  intent='reconciliation';const outstanding=sett.filter(t=>t.status==='CONFIRMED'&&t.settlement!=='RECONCILED');headline='Settlement exceptions';answer=`${outstanding.length} confirmed sandbox payments (${aud(sum(outstanding))}) await synthetic settlement reconciliation. Payment confirmation is not the same as interbank settlement.`;rows=outstanding.slice(0,12).map(t=>({label:t.reference,count:1,amount_cents:t.amount_cents}));recommendation='Prioritise confirmed-but-unreconciled items; verify settlement source records before marking matched.';
 }else if(/(payid|payto|method|rail|channel)/.test(q)){
  intent='payment_methods';headline='PayID versus PayTo performance';rows=by(confirmed,t=>t.method.toUpperCase());answer=rows.length?rows.map(r=>`${r.label}: ${r.count} confirmed, ${aud(r.amount_cents)}`).join(' · '):'No confirmed payments yet. Complete sample transactions on both rails to compare.';recommendation='Compare approval and exception rates as the sample grows; these are simulated journeys, not live scheme performance.';
 }else if(/(hour|time|peak|when|busy)/.test(q)){
  intent='peak_hours';headline='Peak transaction hours';rows=by(confirmed,t=>new Intl.DateTimeFormat('en-AU',{hour:'2-digit',hour12:false,timeZone:'Australia/Melbourne'}).format(new Date(t.created_at))+':00 Melbourne').slice(0,8);answer=rows.length?`The highest-value confirmed payment hour in the current demo sample is ${rows[0].label}, with ${rows[0].count} payments totalling ${aud(rows[0].amount_cents)}.`:'No confirmed payments yet to identify peak hours.';recommendation='Combine with staffing or inventory data before making operational decisions.';
 }else if(/(merchant|business|top|best|perform|rank|growth|opportunit|10x)/.test(q)){
  intent='merchants';headline='Merchant portfolio intelligence';rows=by(confirmed,t=>name(t.merchant_id)).slice(0,10);answer=rows.length?`${rows[0].label} leads the current demo sample with ${rows[0].count} confirmed payments and ${aud(rows[0].amount_cents)}. ${rows.length} merchants have confirmed sales.`:'No confirmed merchant sales yet. Run sample payments to populate this view.';recommendation='Offer merchants tailored insights and next-best-action prompts; sales lift requires a measured real-world pilot.';
 }else if(/(today|daily|month|trend|revenue|sales|volume|total|how much)/.test(q)){
  intent='revenue';headline='Confirmed payment value';rows=by(confirmed,t=>t.created_at.slice(0,10)).slice(0,14);answer=`${confirmed.length} confirmed sandbox payments total ${aud(total)} across ${tx.length} payment attempts. Daily totals are based on UTC timestamps in the persisted ledger.`;recommendation='Use a larger dataset and a consistent business timezone before interpreting trends.';
 }else{
  headline='Enterprise payment overview';answer=`The sandbox contains ${tx.length} payment attempts, ${confirmed.length} confirmed receipts (${aud(total)}), ${failed.length} terminal failures and ${tx.filter(t=>t.status==='UNKNOWN').length} unknown outcomes.`;rows=by(confirmed,t=>name(t.merchant_id)).slice(0,6);recommendation='Try asking about top merchants, PayID versus PayTo, reconciliation, failures, peak hours or daily revenue.';
 }
 logAccess(actor,'ANALYTICS_QUERY_'+intent);
 return {mode:'DETERMINISTIC_GROUNDED_ANALYTICS',intent,headline,answer,rows,recommendation,source:'Read-only persisted sandbox transactions and settlement records',scope:'Enterprise buyer · synthetic data',generatedAt:new Date().toISOString(),limitations:'Not a generative LLM, predictive model, or actual bank integration. No live financial data.'};
}
