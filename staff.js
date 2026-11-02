(function(){
'use strict';
const loginPanel=document.getElementById('login-panel');
const loginForm=document.getElementById('staff-login');
const loginMessage=document.getElementById('login-status');
const staffPanel=document.getElementById('staff-panel');
const staffName=document.getElementById('welcome');
const scheduleMessage=document.getElementById('schedule-message');
const appointments=document.getElementById('appointments');
const count=document.getElementById('count');
const date=document.getElementById('staff-date');
const refresh=document.getElementById('refresh');
let staff=null,connected=false,loading=false;
function dayLondon(){
 const p=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()).map(x=>[x.type,x.value]));
 return p.year+'-'+p.month+'-'+p.day;
}
function localTime(value){
 return new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(value));
}
async function api(path,options){
 const r=await fetch(path,{cache:'no-store',...options});
 const data=await r.json().catch(()=>({}));
 if(!r.ok)throw Error(data.error||'Connection unavailable.');
 return data;
}
function el(tag,cls,text){
 const n=document.createElement(tag);
 if(cls)n.className=cls;
 if(text!==undefined)n.textContent=text;
 return n;
}
function loggedIn(user){
 staff=user;loginPanel.hidden=true;staffPanel.hidden=false;
 staffName.textContent=user.display_name+"'s appointments";
 date.value=dayLondon();
 load();
}
function loggedOut(){
 staff=null;staffPanel.hidden=true;loginPanel.hidden=false;
 appointments.replaceChildren();date.value='';
}
function appointmentCard(b){
 const card=el('article','staff-appointment');
 const head=el('div','staff-appt-head');
 const time=el('div','staff-appt-time',localTime(b.start_at));
 const desc=el('div','staff-appt-desc');
 const price=Number.isFinite(b.estimated_price_pence)?' · £'+(b.estimated_price_pence/100).toFixed(2):'';
 desc.append(el('strong','',b.service||'Appointment'),el('span','',(b.duration_minutes||0)+' min'+price+' · '+(b.status||'Booked')));
 head.append(time,desc,el('span','staff-appt-tag','BOOKED'));
 const privacy=el('div','staff-appt-privacy');
 privacy.append(el('span','staff-lock-symbol','◈'),el('span','',"Customer's phone and email are hidden."));
 const tools=el('div','staff-appt-tools');
 if(connected){
  const call=el('button','staff-call','☎  Call customer');
  call.type='button';call.setAttribute('aria-label','Call customer for the '+localTime(b.start_at)+' appointment');
  const status=el('p','staff-call-status');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  call.addEventListener('click',async function(){
   if(!confirm('Connect a masked call for the '+localTime(b.start_at)+' appointment? Your registered phone will ring first.'))return;
   call.disabled=true;status.textContent='Connecting through Choppers…';
   try{
    const result=await api('/api/staff/call',{
      method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({booking_id:b.id})
    });
    status.textContent=result.message||'Your registered phone should ring.';
   }catch(e){status.textContent=e.message;}
   finally{call.disabled=false;}
  });
  tools.append(call,status);
 }else{
  tools.append(el('p','staff-setup-note','Masked calling will become available once the owner connects Twilio.'));
 }
 card.append(head,privacy,tools);
 return card;
}
async function load(){
 if(!staff||loading)return;
 loading=true;refresh.disabled=true;
 scheduleMessage.textContent='Loading your Square appointments…';
 appointments.replaceChildren();
 try{
  const r=await api('/api/staff/appointments?date='+encodeURIComponent(date.value));
  connected=!!r.calls_connected;
  const bookings=r.appointments||[];
  count.textContent=bookings.length+' BOOKED';
  if(bookings.length){
   appointments.replaceChildren(...bookings.map(appointmentCard));
   scheduleMessage.textContent='';
  }else{
   appointments.append(el('p','staff-empty','No appointments booked for this date.'));
   scheduleMessage.textContent='';
  }
 }catch(e){
  scheduleMessage.textContent=e.message;
  count.textContent='—';
 }finally{refresh.disabled=false;loading=false;}
}
loginForm.addEventListener('submit',async function(e){
 e.preventDefault();loginMessage.textContent='Signing in…';
 const button=document.getElementById('login-button');button.disabled=true;
 try{
  const r=await api('/api/staff/auth',{method:'POST',headers:{'Content-Type':'application/json'},
   body:JSON.stringify({username:document.getElementById('username').value.trim(),password:document.getElementById('staff-password').value})});
  document.getElementById('staff-password').value='';
  loginMessage.textContent='';loggedIn(r.staff);
 }catch(e){loginMessage.textContent=e.message;}
 finally{button.disabled=false;}
});
document.getElementById('logout').addEventListener('click',async function(){
 try{await api('/api/staff/auth',{method:'DELETE'});}catch(e){scheduleMessage.textContent=e.message;return;}
 loggedOut();
});
date.addEventListener('change',load);refresh.addEventListener('click',load);
api('/api/staff/auth').then(r=>{
 if(r.authenticated&&r.staff)loggedIn(r.staff);
 else{
  loggedOut();
  if(!r.configured)loginMessage.textContent='Owner setup required: staff login database has not been connected.';
 }
}).catch(()=>loggedOut());
})();