import {randomUUID} from 'node:crypto';
export const merchants = [
{id:'grocer',name:'Harvest Grocery',type:'Grocery Store',icon:'🥬',category:'Retail',items:[['Fresh produce basket',24.5],['Milk & bread',9.7],['Weekly groceries',78.9]]},
{id:'milk',name:'Corner Milk Bar',type:'Milk Bar',icon:'🥛',category:'Retail',items:[['Milk & snacks',12.5],['Ice cream',5.5]]},
{id:'salon',name:'Studio Bloom',type:'Hair Salon',icon:'✂️',category:'Services',items:[['Haircut & style',65],['Colour treatment',145],['Blow dry',45]]},
{id:'fuel',name:'Metro Fuel',type:'Fuel Station',icon:'⛽',category:'Retail',items:[['Unleaded fuel',72.4],['Car wash',18]]},
{id:'juice',name:'Pressed & Fresh',type:'Juice Bar',icon:'🥤',category:'Hospitality',items:[['Fresh juice',8.5],['Smoothie',11]]},
{id:'coffee',name:'Good Morning Coffee',type:'Coffee Shop',icon:'☕',category:'Hospitality',items:[['Flat white',5.5],['Coffee & pastry',12.5]]},
{id:'cafe',name:'Sunday Table',type:'Café',icon:'🥐',category:'Hospitality',items:[['Breakfast for two',48],['Lunch special',23.5]]},
{id:'restaurant',name:'Olive & Ember',type:'Restaurant',icon:'🍽️',category:'Hospitality',items:[['Dinner bill',86],['Table for two',124]]},
{id:'mechanic',name:'Precision Auto',type:'Auto Mechanic',icon:'🔧',category:'Services',items:[['Vehicle service',240],['Safety inspection',95]]},
{id:'childcare',name:'Little Steps',type:'Childcare',icon:'🧸',category:'Recurring',items:[['Weekly childcare fee',180],['Excursion fee',35]]},
{id:'gym',name:'Elevate Fitness',type:'Gym',icon:'🏋️',category:'Recurring',items:[['Weekly membership',39],['Single visit',20]]},
{id:'market',name:'Market Lane Stall',type:'Market Stall',icon:'🛍️',category:'Retail',items:[['Market basket',22],['Handmade goods',38]]},
{id:'bakery',name:'Golden Crust',type:'Bakery',icon:'🥖',category:'Hospitality',items:[['Bread & pastries',18.5]]},
{id:'barber',name:'The Local Barber',type:'Barbershop',icon:'💈',category:'Services',items:[['Classic cut',42]]},
{id:'tutor',name:'Bright Minds',type:'Tutoring',icon:'📚',category:'Recurring',items:[['Tutoring session',75]]},
{id:'florist',name:'Petal House',type:'Florist',icon:'💐',category:'Retail',items:[['Bouquet',65]]}];
export const phoneValid = s => typeof s==='string' && /^\+614[0-9]{8}$/.test(s);
export const state={transactions:new Map(),events:[],listeners:new Set()};
export function publish(event){state.events.push(event);if(state.events.length>200)state.events.shift();for(const listener of state.listeners)listener(event)}
export function createPayment({merchantId,itemIndex=0,method,phone}){
 const m=merchants.find(x=>x.id===merchantId);
 if(!m)throw Error('Unknown merchant');
 if(!Number.isInteger(itemIndex)||itemIndex<0||itemIndex>=m.items.length)throw Error('Invalid item');
 if(!['payid','payto'].includes(method))throw Error('Unsupported collection method');
 if(!phoneValid(phone))throw Error('Phone must be +61 followed by exactly 9 digits');
 const [item,amount]=m.items[itemIndex];
 const t={id:randomUUID(),reference:`PSL-${Date.now().toString(36).toUpperCase()}`,merchantId,merchantName:m.name,merchantType:m.type,item,amount,method,phoneMasked:`+61••••••${phone.slice(-3)}`,status:'CREATED',agreement:'NONE',receipt:'NOT_POSTED',settlement:'UNRECONCILED',createdAt:new Date().toISOString(),history:[]};
 state.transactions.set(t.id,t); record(t,'CREATED','Order validated by Inquiry API');return t;
}
function record(t,status,detail){t.status=status;const e={at:new Date().toISOString(),transactionId:t.id,merchantId:t.merchantId,status,detail};t.history.push(e);publish(e);return t}
export function advance(t,action){
 if(action==='reset')throw Error('Create a new payment to reset');
 if(['CONFIRMED','FAILED','DECLINED','EXPIRED'].includes(t.status))throw Error('Transaction is terminal');
 if(action==='decline'&&['AWAITING_AUTH','AGREEMENT_PENDING','AGREEMENT_AUTHORISED','PROCESSING'].includes(t.status))return record(t,'DECLINED','Customer declined payment or agreement');
 if(action==='timeout'&&['AWAITING_AUTH','AGREEMENT_PENDING','PROCESSING'].includes(t.status))return record(t,'EXPIRED','Bank response timeout — do not mark paid');
 if(action==='bank-failure'&&t.status==='PROCESSING')return record(t,'FAILED','Simulated bank rejection — no receipt posted');
 if(action==='mismatch'&&['AWAITING_AUTH','PROCESSING'].includes(t.status))return record(t,'FAILED','Beneficiary verification mismatch — payment blocked');
 if(action==='start'&&t.status==='CREATED')return record(t,t.method==='payid'?'AWAITING_AUTH':'AGREEMENT_PENDING',t.method==='payid'?'PayID instructions shown; customer must authorise in bank':'PayTo agreement request delivered to customer');
 if(action==='authorise'&&t.status==='AGREEMENT_PENDING'){t.agreement='AUTHORISED';return record(t,'AGREEMENT_AUTHORISED','Customer approved PayTo agreement')}
 if(action==='authorise'&&t.status==='AWAITING_AUTH')return record(t,'PROCESSING','Customer submitted PayID payment; awaiting trusted bank evidence');
 if(action==='collect'&&t.status==='AGREEMENT_AUTHORISED')return record(t,'PROCESSING','PayTo collection initiated under authorised agreement');
 if(action==='confirm'&&t.status==='PROCESSING'){t.receipt='POSTED';return record(t,'CONFIRMED','Simulated trusted bank event verified; PaymentMarking posted exactly once')}
 throw Error('Action not permitted in current state');
}
export function reconcile(t){if(t.status!=='CONFIRMED')throw Error('Cannot reconcile an unconfirmed payment');if(t.settlement==='RECONCILED')return t;t.settlement='RECONCILED';publish({at:new Date().toISOString(),transactionId:t.id,merchantId:t.merchantId,status:'RECONCILED',detail:'Simulated settlement report matched'});return t}
export function insights(merchantId){const m=merchants.find(x=>x.id===merchantId);if(!m)throw Error('Unknown merchant');const tx=[...state.transactions.values()].filter(x=>x.merchantId===merchantId);const paid=tx.filter(x=>x.status==='CONFIRMED');const revenue=paid.reduce((s,x)=>s+x.amount,0);return {merchant:m.name,transactions:tx.length,paid:paid.length,failed:tx.filter(x=>['FAILED','DECLINED','EXPIRED'].includes(x.status)).length,revenue:Number(revenue.toFixed(2)),unreconciled:paid.filter(x=>x.settlement!=='RECONCILED').length,topItem:paid.length?Object.entries(paid.reduce((a,x)=>(a[x.item]=(a[x.item]||0)+1,a),{})).sort((a,b)=>b[1]-a[1])[0][0]:null}}
