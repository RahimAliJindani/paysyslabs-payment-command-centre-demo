// Merchant-selected QR landing page: do not allow customers to change the bill.
const $ = s => document.querySelector(s);
const merchantId = decodeURIComponent(location.pathname.split('/').pop());
const params = new URLSearchParams(location.search);
const itemIndex = Number(params.get('itemIndex'));
const method = params.get('method') === 'payid' ? 'payid' : 'payto';
const error = $('#error');
async function begin(){
  try {
    const merchantsResponse = await fetch('/api/merchants');
    if(!merchantsResponse.ok) throw Error('Merchant catalogue unavailable');
    const merchant = (await merchantsResponse.json()).find(m => m.id === merchantId);
    if(!merchant || !Number.isInteger(itemIndex) || itemIndex < 0 || itemIndex >= merchant.items.length) throw Error('This business QR is invalid');
    $('#name').textContent = merchant.name;
    $('#description').textContent = merchant.items[itemIndex][0] + ' · Amount set by business';
    $('#price').textContent = new Intl.NumberFormat('en-AU',{style:'currency',currency:'AUD'}).format(merchant.items[itemIndex][1]);
    const response = await fetch('/api/transactions', {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({merchantId,itemIndex,method})});
    const tx = await response.json();
    if(!response.ok) throw Error(tx.error || 'Could not initiate checkout');
    location.replace('/pay/' + encodeURIComponent(tx.qrToken));
  } catch(e) {error.textContent=e.message;$('#retry').hidden=false;}
}
$('#retry').onclick=begin;
begin();
