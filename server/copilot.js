import {enterpriseAnalytics,logAccess} from './admin.js';
import {periodFor,timezone} from './reporting.js';
const aud=n=>new Intl.NumberFormat('en-AU',{style:'currency',currency:'AUD'}).format(n/100);
export function askEnterprise(question,actor){
 if(typeof question!=='string'||question.length<3||question.length>500)throw Error('Ask a question between 3 and 500 characters');
 const q=question.toLowerCase();
 if(/\b(last week|this week|last year|this year|between|since|before|after|20\d{2})\b/.test(q))throw Error('Supported periods are today, yesterday, this month, last month, or all time. Please specify one of these.');
 const period=periodFor(q),a=enterpriseAnalytics({period}),t=a.totals;
 let intent='overview',headline,answer,rows=[],recommendation='Use these sandbox results to choose an operational follow-up; do not infer real-world customer behaviour.';
 if(/(fail|declin|reject|error|exception|risk|fraud|guardrail)/.test(q)){
  intent='exceptions';headline='Exceptions and protected payment outcomes';rows=a.failures;
  answer=`${t.failed} of ${t.attempts} sandbox payment attempts ended in failed, declined or expired states. ${t.unknown} have an unknown provider outcome. These are not confirmed receipts.`;
  recommendation='Resolve unknown outcomes before retrying; do not post a receipt without verified confirmation.';
 }else if(/(reconcil|settle|unmatched|ledger)/.test(q)){
  intent='reconciliation';headline='Settlement exceptions';rows=a.outstanding.slice(0,12);
  answer=`${t.unreconciled} confirmed sandbox payments (${aud(t.unsettled_cents)}) await synthetic settlement reconciliation. Payment confirmation is separate from interbank settlement.`;
  recommendation='Verify settlement source records before marking matched.';
 }else if(/(payid|payto|method|rail|channel)/.test(q)){
  intent='payment_methods';headline='PayID versus PayTo performance';rows=a.methods;
  answer=rows.length?rows.map(r=>`${r.label}: ${r.count} confirmed, ${aud(r.amount_cents)}`).join(' · '):'No confirmed payments in this period.';
 }else if(/(hour|peak|when|busy|busiest)/.test(q)){
  intent='peak_hours';headline='Peak transaction hours';rows=a.hours.slice(0,8).map(r=>({...r,label:r.label+':00 Melbourne'}));
  answer=rows.length?`The highest-value confirmed payment hour is ${rows[0].label}, with ${rows[0].count} payments totalling ${aud(rows[0].amount_cents)}.`:'No confirmed payments in this period.';
 }else if(/(merchant|business|top|best|perform|rank|growth|opportunit|10x)/.test(q)){
  intent='merchants';headline='Merchant portfolio intelligence';rows=a.merchants.slice(0,10);
  answer=rows.length?`${rows[0].label} leads with ${rows[0].count} confirmed payments and ${aud(rows[0].amount_cents)}. ${a.merchants.length} merchants have confirmed sales.`:'No confirmed merchant sales in this period.';
 }else if(/(today|yesterday|daily|month|trend|revenue|sales|volume|total|how much)/.test(q)){
  intent='revenue';headline='Confirmed payment value';rows=a.days.slice(0,14);
  answer=`${t.confirmed} confirmed sandbox payments total ${aud(t.cents)} across ${t.attempts} payment attempts.`;
 }else{
  headline='Enterprise payment overview';rows=a.merchants.slice(0,6);
  answer=`${t.attempts} payment attempts, ${t.confirmed} confirmed receipts (${aud(t.cents)}), ${t.failed} terminal failures and ${t.unknown} unknown outcomes.`;
  recommendation='Try asking about top merchants, PayID versus PayTo, reconciliation, failures, peak hours or daily revenue.';
 }
 answer+=` Reporting period: ${period.label}${period.value?' ('+period.value+')':''}; ${timezone}. Totals include every matching record.`;
 logAccess(actor,'ANALYTICS_QUERY_'+intent);
 return {mode:'DETERMINISTIC_GROUNDED_ANALYTICS',intent,headline,answer,rows,recommendation,period,timezone,
  source:'Full-scope SQLite aggregates over persisted sandbox transactions',scope:'Enterprise reviewer · synthetic data',
  generatedAt:new Date().toISOString(),limitations:'Not an LLM, predictive model, or bank integration. Dates refer to payment creation time. Detail rows may be limited; totals are complete.'};
}
