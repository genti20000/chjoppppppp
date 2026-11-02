(function(){
'use strict';
const fallback=document.getElementById('connection-error');
const panel=document.getElementById('booking-panel');
const service=document.getElementById('service');
const day=document.getElementById('day');
const find=document.getElementById('find-times');
const searchStatus=document.getElementById('search-status');
const slotGrid=document.getElementById('slot-grid');
const timesPanel=document.getElementById('times-panel');
const detailsPanel=document.getElementById('details-panel');
const selectedTitle=document.getElementById('selected-slot-title');
const form=document.getElementById('confirm-form');
const confirmButton=document.getElementById('confirm-button');
const confirmStatus=document.getElementById('confirm-status');
const success=document.getElementById('success-panel');
const successCopy=document.getElementById('success-copy');
const bookingRef=document.getElementById('booking-ref');
const serviceDetail=document.getElementById('service-detail');
const captcha=document.getElementById('captcha');
let services=[],chosenSlot=null,submissionId=null,widgetId=null,bookingInProgress=false;
function localToday(){
  const tokens=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
  const p=Object.fromEntries(tokens.map(t=>[t.type,t.value]));return p.year+'-'+p.month+'-'+p.day;
}
function dayIsWeekday(value){
  const d=new Date(value+'T12:00:00Z');
  return !!value && !isNaN(d.valueOf()) && d.toISOString().startsWith(value) && ![0,6].includes(d.getUTCDay());
}
async function request(url,options){
  const r=await fetch(url,{cache:'no-store',...options});
  const data=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(data.error||'Booking service unavailable. Please try again.');
  return data;
}
function gbp(money){
  if(!money || money.currency!=='GBP'||!Number.isFinite(money.amount))return '';
  return new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP',maximumFractionDigits:2}).format(money.amount/100);
}
function resetSlots(){
  chosenSlot=null;submissionId=null;timesPanel.hidden=true;detailsPanel.hidden=true;success.hidden=true;
  slotGrid.replaceChildren();
  searchStatus.textContent='';
}
function selectSlot(slot,button) {
  chosenSlot=slot;submissionId=crypto.randomUUID();
  for (const b of slotGrid.children) {
    b.classList.toggle('active',b===button);
    b.setAttribute('aria-pressed',String(b===button));
  }
  selectedTitle.textContent='Your appointment · '+slot.local_time;
  detailsPanel.hidden=false;confirmStatus.textContent='';
  form.scrollIntoView({behavior:'smooth',block:'nearest'});
}
function showTimes(slots){
  timesPanel.hidden=false;
  slotGrid.replaceChildren();
  if(!slots.length){
    const p=document.createElement('p');p.className='any-note';p.textContent='No available appointments for that date. Please try another weekday or choose a specific barber.';slotGrid.append(p);
    return;
  }
  for(const slot of slots){
    const b=document.createElement('button');
    b.type='button';b.className='slot-button';b.textContent=slot.local_time;
    b.setAttribute('aria-pressed','false');
    b.addEventListener('click',()=>selectSlot(slot,b));
    slotGrid.append(b);
  }
}
function setupCaptcha(key){
  window.choppersTurnstileReady=function(){
    if(!window.turnstile) return;
    widgetId=window.turnstile.render(captcha,{
      sitekey:key,theme:'dark',callback:function(){confirmStatus.textContent='';},
      'expired-callback':function(){confirmStatus.textContent='Security check expired. Complete it again.';}
    });
  };
  const script=document.createElement('script');
  script.src='https://challenges.cloudflare.com/turnstile/v0/api.js?onload=choppersTurnstileReady&render=explicit';
  script.async=true;script.defer=true;document.head.append(script);
}
async function init(){
  const today=localToday();day.min=today;
  const max=new Date(Date.now()+30*86400000);
  day.max=max.toISOString().slice(0,10);
  day.value=today;
  const check=await request('/api/any/status');
  if(!check.enabled){fallback.hidden=false;return;}
  const response=await request('/api/any/services');
  services=response.services||[];
  if(!services.length)throw new Error('There are no eligible Square services available for automatic booking. Use the regular booking page.');
  service.replaceChildren();
  for(const s of services){
    const option=document.createElement('option');option.value=s.id;
    option.textContent=s.name + (s.price?' · '+gbp(s.price):'');
    service.append(option);
  }
  service.addEventListener('change',()=>{resetSlots();showService();});
  day.addEventListener('change',resetSlots);
  panel.hidden=false;
  if(check.turnstile_site_key)setupCaptcha(check.turnstile_site_key);
  showService();
}
function showService(){
  const s=services.find(s=>s.id===service.value);
  serviceDetail.textContent=s?(s.duration_minutes+' minutes'+(s.price?' · '+gbp(s.price):'')):'';
}
find.addEventListener('click',async()=>{
  if(!service.value){searchStatus.textContent='Please choose a service.';return;}
  if(!dayIsWeekday(day.value)){searchStatus.textContent='Please choose Monday to Friday. Saturday appointments are handled by SimplyBook.';return;}
  resetSlots();find.disabled=true;searchStatus.textContent='Checking Square for available appointments…';
  try{
    const data=await request('/api/any/availability',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({service_id:service.value,date:day.value})});
    showTimes(data.slots||[]);searchStatus.textContent=(data.slots||[]).length+' available times found.';
    timesPanel.scrollIntoView({behavior:'smooth',block:'nearest'});
  }catch(e){searchStatus.textContent=e.message;}
  finally{find.disabled=false;}
});
form.addEventListener('submit',async(e)=>{
  e.preventDefault();if(bookingInProgress)return;
  if(!chosenSlot||!submissionId){confirmStatus.textContent='Choose a time again.';return;}
  if(!form.reportValidity())return;
  const captchaToken=window.turnstile&&widgetId!==null?window.turnstile.getResponse(widgetId):'';
  if(!captchaToken){confirmStatus.textContent='Complete the security check before booking.';return;}
  bookingInProgress=true;confirmButton.disabled=true;confirmStatus.textContent='Creating your appointment in Square…';
  try{
    const result=await request('/api/any/confirm',{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        slot_token:chosenSlot.token,submission_id:submissionId,
        first_name:document.getElementById('first-name').value,
        last_name:document.getElementById('last-name').value,
        email:document.getElementById('email').value,
        phone:document.getElementById('phone').value,
        consent:document.getElementById('consent').checked,
        captcha_token:captchaToken
      })
    });
    form.hidden=true;timesPanel.hidden=true;detailsPanel.hidden=true;success.hidden=false;
    const booking=result.booking;
    const formatted=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',weekday:'long',day:'numeric',month:'long',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(booking.start_at));
    successCopy.textContent=formatted+' with '+booking.barber+'.';
    bookingRef.textContent='Booking reference: '+booking.id+'.';
    success.scrollIntoView({behavior:'smooth',block:'start'});
  }catch(err){
    confirmStatus.textContent=err.message+'. If you are unsure whether the booking went through, contact Choppers before submitting again.';
    if(window.turnstile&&widgetId!==null)window.turnstile.reset(widgetId);
  }finally{bookingInProgress=false;confirmButton.disabled=false;}
});
init().catch(err=>{
  fallback.hidden=false;
  const p=document.createElement('p');p.className='any-note';p.textContent=err.message;fallback.append(p);
});
})();