(function(){
'use strict';
// Mobile-first Choppers calendar. No customer hints in list data; detail API on click only.
const $=id=>document.getElementById(id);
const state={staff:null,view:'day',barber:null,date:todayLondon(),zoom:15,events:[],callsConnected:false,sequence:0};
const NAME={liri:'Liri',marouan:'Marouan',nick:'Nick',victor:'Victor'};
const ALL=['liri','marouan','nick','victor'];
const DAY=86400000;
let requestController=null, detailController=null, priorFocus=null;
function el(tag,className,text){
 const n=document.createElement(tag);
 if(className)n.className=className;
 if(text!==undefined)n.textContent=text;
 return n;
}
function utc(day){return new Date(day+'T12:00:00Z');}
function dayString(value){return new Date(value).toISOString().slice(0,10);}
function addDays(day,n){return dayString(utc(day).getTime()+n*DAY);}
function todayLondon(){
 const p=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()).map(x=>[x.type,x.value]));
 return p.year+'-'+p.month+'-'+p.day;
}
function londonClock(time){
 const p=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(time)).map(x=>[x.type,x.value]));
 return {min:Number(p.hour)*60+Number(p.minute),text:p.hour+':'+p.minute};
}
function longDate(day,options={weekday:'short',month:'short',day:'numeric'}){
 return new Intl.DateTimeFormat('en-GB',{timeZone:'UTC',...options}).format(utc(day));
}
function labelTime(n){return String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0');}
function getPeriod(){
 if(state.view==='day')return {start:state.date,end:state.date};
 if(state.view==='week'){
  const weekday=(utc(state.date).getUTCDay()+6)%7;
  const start=addDays(state.date,-weekday);
  return {start,end:addDays(start,6)};
 }
 const year=state.date.slice(0,4),month=state.date.slice(5,7);
 const last=new Date(Date.UTC(Number(year),Number(month),0)).getUTCDate();
 return {start:year+'-'+month+'-01',end:year+'-'+month+'-'+String(last).padStart(2,'0')};
}
async function api(path,options){
 const response=await fetch(path,{cache:'no-store',...options});
 const json=await response.json().catch(()=>({}));
 if(!response.ok)throw Error(json.error||'Could not reach the Choppers booking system.');
 return json;
}
function status(message){
 const e=$('schedule-message');
 e.hidden=!message;e.textContent=message||'';
}
function note(message){
 const e=$('view-notice');
 e.hidden=!message;e.textContent=message||'';
}
function loginStatus(text){$('login-status').textContent=text||'';}
function updateControls(){
 const period=getPeriod();
 const stamp=state.view==='day'
  ?longDate(state.date,{weekday:'short',day:'numeric',month:'short',year:'numeric'})
  :state.view==='week'
  ?longDate(period.start,{day:'numeric',month:'short'})+' – '+longDate(period.end,{day:'numeric',month:'short',year:'numeric'})
  :longDate(state.date,{month:'long',year:'numeric'});
 $('date-caption').textContent=stamp;
 $('calendar-date').value=state.date;
 $('barber-select').value=state.barber;
 for(const b of document.querySelectorAll('[data-view]')){
  const yes=b.dataset.view===state.view;
  b.classList.toggle('is-active',yes);b.setAttribute('aria-pressed',String(yes));
 }
 for(const b of document.querySelectorAll('[data-zoom]')){
  const yes=Number(b.dataset.zoom)===state.zoom;
  b.classList.toggle('is-active',yes);b.setAttribute('aria-pressed',String(yes));
 }
 const all=$('barber-select').querySelector('option[value="all"]');
 all.disabled=state.view!=='day';
 $('zoom-control').hidden=state.view==='month';
 $('range-label').textContent=state.view==='day'?'DAY SCHEDULE':state.view==='week'?'WEEKLY PLANNER':'MONTHLY OVERVIEW';
 $('calendar-heading').textContent=state.barber==='all'?'All barbers · side by side':NAME[state.barber]+' · '+(state.view==='day'?'Day':state.view==='week'?'Week':'Month');
 const keys=state.barber==='all'?ALL:[state.barber];
 $('staff-legend').replaceChildren(...keys.map(id=>{
  const item=el('span','sc-legend-item');const dot=el('span','sc-legend-dot');dot.className+=' sc-'+id;
  dot.style.background='var(--sc-accent)';item.append(dot,el('span','',NAME[id]));return item;
 }));
}
function setView(view){
 if(!['day','week','month'].includes(view))return;
 state.view=view;
 if(view!=='day'&&state.barber==='all'){
  state.barber=state.staff.barber_id;
  note('Week and Month are individual-barber views. Switched to '+NAME[state.barber]+'.');
 }else note('');
 load();
}
function setBarber(id){
 if(id!=='all'&&!ALL.includes(id))return;
 if(id==='all'&&state.view!=='day'){state.view='day';note('All barbers can be viewed side by side in Day view.');}
 else note('');
 state.barber=id;load();
}
function shiftPeriod(direction){
 if(state.view==='day')state.date=addDays(state.date,direction);
 else if(state.view==='week')state.date=addDays(state.date,direction*7);
 else{
  const d=utc(state.date),wantedDay=d.getUTCDate();
  const m=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+direction,1,12));
  const monthLength=new Date(Date.UTC(m.getUTCFullYear(),m.getUTCMonth()+1,0)).getUTCDate();
  m.setUTCDate(Math.min(wantedDay,monthLength));
  state.date=dayString(m);
 }
 note('');load();
}
function appointmentButton(booking,min,scale,startMin){
 const top=Math.max(0,(londonClock(booking.start_at).min-startMin)*scale);
 const height=Math.max(19,booking.duration_minutes*scale-2);
 const card=el('button','sc-event sc-'+booking.barber);
 card.type='button';card.style.top=top+'px';card.style.height=height+'px';
 if(height<43)card.classList.add('sc-compact');
 card.setAttribute('aria-label','Open '+booking.service+' appointment at '+londonClock(booking.start_at).text+' with '+NAME[booking.barber]);
 const clock=el('span','sc-event-time',londonClock(booking.start_at).text);
 const title=el('strong','sc-event-title',booking.service||'Appointment');
 card.append(clock,title);
 if(height>=75)card.append(el('span','sc-event-status',booking.duration_minutes+' min'));
 card.addEventListener('click',()=>openDetail(booking));
 return card;
}
function visibleHours(events){
 const first=events.length?Math.min(...events.map(e=>londonClock(e.start_at).min)):540;
 const last=events.length?Math.max(...events.map(e=>londonClock(e.start_at).min+e.duration_minutes)):1080;
 return {from:Math.max(360,Math.min(540,Math.floor(first/60)*60)),to:Math.min(1440,Math.max(1200,Math.ceil(last/60)*60))};
}
function renderTimeline(lanes){
 const outer=$('calendar');
 outer.replaceChildren();
 const records=state.events;
 const tick=state.zoom,unit=tick===15?29:tick===30?20:13;
 const scale=unit/15;
 const {from,to}=visibleHours(records);
 const height=(to-from)*scale;
 const frame=el('div','sc-timeline');
 frame.style.setProperty('--sc-cols',String(lanes.length));
 frame.style.setProperty('--sc-unit',unit+'px');
 frame.style.setProperty('--sc-mincol',state.view==='week'?'188px':'210px');
 frame.style.setProperty('--sc-height',height+'px');
 const head=el('div','sc-timeline-head');
 head.append(el('span','sc-axis-head','GMT / BST'));
 for(const lane of lanes){
  const tile=el('div','sc-lane-head sc-'+lane.barber);
  const dot=el('span','sc-lane-indicator');
  const title=el('span','',lane.label);
  tile.append(dot,title);
  head.append(tile);
 }
 const body=el('div','sc-timeline-body');
 const axis=el('div','sc-time-axis');
 for(let minute=from;minute<=to;minute+=tick){
  const mark=el('span','sc-time-mark'+(minute%60===0?' is-hour':''),labelTime(minute));
  mark.style.top=(minute-from)*scale+'px';
  axis.append(mark);
 }
 body.append(axis);
 for(const lane of lanes){
  const cell=el('div','sc-lane sc-'+lane.barber);
  const matches=state.events.filter(b=>b.barber===lane.barber&&b.start_at&&
     (state.view==='week'?londonDate(b.start_at)===lane.date:true));
  for(const entry of matches)cell.append(appointmentButton(entry,0,scale,from));
  if(lane.date===todayLondon()){
   const now=londonClock(new Date().toISOString()).min;
   if(now>=from&&now<=to){
    const line=el('div','sc-now-line');
    line.style.top=(now-from)*scale+'px';cell.append(line);
   }
  }
  body.append(cell);
 }
 frame.append(head,body);
 outer.append(frame);
 const viewport=$('calendar-viewport');
 viewport.scrollTop=Math.max(0,(Math.max(from,540)-from)*scale-38);
 viewport.scrollLeft=0;
}
function londonDate(time){
 const p=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(time)).map(x=>[x.type,x.value]));
 return p.year+'-'+p.month+'-'+p.day;
}
function renderMonth(){
 const holder=$('calendar');holder.replaceChildren();
 const period=getPeriod();
 const start=period.start,end=period.end;
 const firstOffset=(utc(start).getUTCDay()+6)%7;
 const firstCell=addDays(start,-firstOffset);
 const lastOffset=6-(utc(end).getUTCDay()+6)%7;
 const lastCell=addDays(end,lastOffset);
 const grid=el('div','sc-month');
 const header=el('div','sc-month-head');
 for(const day of ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'])header.append(el('span','',day));
 grid.append(header);
 const cells=el('div','sc-month-grid');
 const grouped=new Map();
 for(const b of state.events){
  const date=londonDate(b.start_at);
  if(!grouped.has(date))grouped.set(date,[]);
  grouped.get(date).push(b);
 }
 for(let date=firstCell;date<=lastCell;date=addDays(date,1)){
  const out=date<start||date>end,bookings=grouped.get(date)||[];
  const cell=el('button','sc-month-day'+(out?' is-outside':'')+(date===todayLondon()?' is-today':''));
  cell.type='button';
  const daynum=el('span','sc-month-num',String(Number(date.slice(-2))));
  cell.append(daynum);
  if(!out&&bookings.length){
   cell.append(el('span','sc-month-count',bookings.length+' booked'));
   for(const b of bookings.slice(0,2)){
    cell.append(el('span','sc-month-chip sc-'+b.barber,b.service));
   }
   if(bookings.length>2)cell.append(el('span','sc-month-more','+'+(bookings.length-2)+' more'));
  }
  if(!out&&!bookings.length)cell.append(el('span','sc-month-count','Free'));
  cell.setAttribute('aria-label',longDate(date,{weekday:'long',day:'numeric',month:'long'})+', '+bookings.length+' appointments. View day.');
  cell.addEventListener('click',()=>{
   state.date=date;state.view='day';note('');load();
  });
  cells.append(cell);
 }
 grid.append(cells);holder.append(grid);
 $('calendar-viewport').scrollTop=0;$('calendar-viewport').scrollLeft=0;
}
function render(){
 updateControls();
 const total=state.events.length;
 $('count').textContent=String(total);
 if(state.view==='month'){renderMonth();return;}
 if(state.view==='week'){
  const {start}=getPeriod();
  const lanes=Array.from({length:7},(_,i)=>{
   const date=addDays(start,i);
   return {barber:state.barber,date,label:longDate(date,{weekday:'short',day:'numeric',month:'short'})};
  });
  renderTimeline(lanes);
 }else if(state.barber==='all'){
  renderTimeline(ALL.map(id=>({barber:id,date:state.date,label:NAME[id]})));
 }else{
  renderTimeline([{barber:state.barber,date:state.date,label:NAME[state.barber]}]);
 }
}
async function load(){
 if(!state.staff)return;
 updateControls();
 status('Loading Square appointments…');
 $('refresh').disabled=true;
 if(requestController)requestController.abort();
 requestController=new AbortController();
 const seq=++state.sequence;
 const {start,end}=getPeriod();
 try{
  const response=await api('/api/staff/calendar?'+new URLSearchParams({start,end,barber:state.barber}),{signal:requestController.signal});
  if(seq!==state.sequence)return;
  state.events=Array.isArray(response.events)?response.events:[];
  state.callsConnected=!!response.calls_connected;
  status('');
  render();
 }catch(e){
  if(seq!==state.sequence||e.name==='AbortError')return;
  state.events=[];
  render();
  status(e.message);
 }finally{if(seq===state.sequence)$('refresh').disabled=false;}
}
function detailRow(label,value){
 const row=el('div','sc-detail-row');
 row.append(el('span','',label),el('strong','',value||'Unavailable'));return row;
}
function detailContent(d){
 const root=$('detail-content');root.replaceChildren();
 $('detail-title').textContent='Booking details';
 root.append(el('div','sc-detail-service',d.service||'Appointment'));
 root.append(el('div','sc-detail-time',
  longDate(londonDate(d.start_at),{weekday:'long',day:'numeric',month:'long',year:'numeric'})+' · '+londonClock(d.start_at).text));
 const privateBox=el('div','sc-detail-private');
 privateBox.append(el('div','sc-detail-private-label','CUSTOMER · LIMITED DETAILS'));
 privateBox.append(el('div','sc-detail-private-name',d.customer?.name||'Name unavailable'));
 const hints=el('div','sc-detail-private-bits');
 hints.append(el('span','sc-detail-private-bit','☎  '+(d.customer?.phone_hint||'Phone unavailable')));
 hints.append(el('span','sc-detail-private-bit','✉  '+(d.customer?.email_hint||'Email unavailable')));
 privateBox.append(hints);root.append(privateBox);
 const info=el('div','sc-detail-grid');
 info.append(detailRow('Barber',NAME[d.barber]||d.barber),
  detailRow('Time',londonClock(d.start_at).text),
  detailRow('Duration',d.duration_minutes+' minutes'),
  detailRow('Status',d.status),
  detailRow('Reference price',Number.isFinite(d.estimated_price_pence)?'£'+(d.estimated_price_pence/100).toFixed(2):'See Square Register'));
 root.append(info);
 if(d.can_call){
  const button=el('button','sc-detail-call','☎  Call customer privately');
  button.type='button';
  const feedback=el('p','sc-detail-note');feedback.setAttribute('role','status');
  button.addEventListener('click',async()=>{
   if(!confirm('Connect a masked call using the Choppers business number? Your registered phone will ring first.'))return;
   button.disabled=true;feedback.textContent='Connecting through Choppers…';
   try{
    const x=await api('/api/staff/call',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({booking_id:d.id})});
    feedback.textContent=x.message||'Your registered phone should ring.';
   }catch(e){feedback.textContent=e.message;}
   finally{button.disabled=false;}
  });
  root.append(button,feedback);
 }else root.append(el('p','sc-detail-note',d.barber===state.staff.barber_id?
  'Masked calling will be available when the owner connects Twilio.':
  'Only the assigned barber can initiate a masked customer call.'));
 root.append(el('p','sc-detail-note','Only the first name, surname initial, last three telephone digits and first three email letters are shared with staff. Full contact information remains private.'));
}
async function openDetail(booking){
 priorFocus=document.activeElement;
 $('appointment-overlay').hidden=false;
 document.body.style.overflow='hidden';
 $('detail-title').textContent='Loading appointment…';
 $('detail-content').replaceChildren(el('p','sc-detail-note','Retrieving the limited customer details securely…'));
 $('appointment-dialog').focus();
 if(detailController)detailController.abort();
 detailController=new AbortController();
 try{
  const details=await api('/api/staff/appointment?id='+encodeURIComponent(booking.id),{signal:detailController.signal});
  if(!$('appointment-overlay').hidden)detailContent(details);
 }catch(e){
  if(e.name!=='AbortError'&&!$('appointment-overlay').hidden){
   $('detail-title').textContent='Unable to open appointment';
   $('detail-content').replaceChildren(el('p','sc-detail-error',e.message));
  }
 }
}
function closeDetail(){
 if(detailController)detailController.abort();
 $('appointment-overlay').hidden=true;
 document.body.style.overflow='';
 if(priorFocus?.isConnected)priorFocus.focus();
}
function loggedIn(user){
 state.staff=user;
 state.barber=window.matchMedia('(min-width:760px)').matches?'all':user.barber_id;
 state.date=todayLondon();
 $('staff-name').textContent=user.display_name||NAME[user.barber_id]||'team';
 const londonHour=Number(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',hour:'numeric',hourCycle:'h23'}).format(new Date()));
 document.querySelector('.sc-welcome h1').firstChild.textContent=londonHour<12?'Good morning, ':londonHour<17?'Good afternoon, ':'Good evening, ';
 $('login-panel').hidden=true;$('staff-panel').hidden=false;$('logout').hidden=false;
 load();
}
function loggedOut(){
 state.staff=null;
 if(requestController)requestController.abort();
 closeDetail();
 $('staff-panel').hidden=true;$('logout').hidden=true;$('login-panel').hidden=false;
 $('calendar').replaceChildren();
}
$('staff-login').addEventListener('submit',async e=>{
 e.preventDefault();loginStatus('Signing in…');$('login-button').disabled=true;
 try{
  const r=await api('/api/staff/auth',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({username:$('username').value.trim(),password:$('staff-password').value})});
  $('staff-password').value='';loginStatus('');
  loggedIn(r.staff);
 }catch(e){loginStatus(e.message);}
 finally{$('login-button').disabled=false;}
});
$('logout').addEventListener('click',async()=>{
 try{await api('/api/staff/auth',{method:'DELETE'});loggedOut();}
 catch(e){status('Could not sign out. '+e.message);}
});
$('previous').addEventListener('click',()=>shiftPeriod(-1));
$('next').addEventListener('click',()=>shiftPeriod(1));
$('today').addEventListener('click',()=>{state.date=todayLondon();note('');load();});
$('calendar-date').addEventListener('change',e=>{if(/^\d{4}-\d{2}-\d{2}$/.test(e.target.value)){state.date=e.target.value;note('');load();}});
document.querySelector('.sc-date-picker').addEventListener('click',e=>{
 e.preventDefault();
 const input=$('calendar-date');
 if(typeof input.showPicker==='function'){
  try{input.showPicker();}catch{input.focus();input.click();}
 }else{input.focus();input.click();}
});
for(const b of document.querySelectorAll('[data-view]'))b.addEventListener('click',()=>setView(b.dataset.view));
$('barber-select').addEventListener('change',e=>setBarber(e.target.value));
for(const b of document.querySelectorAll('[data-zoom]'))b.addEventListener('click',()=>{
 state.zoom=Number(b.dataset.zoom);updateControls();
 if(state.events.length&&state.view!=='month')render(); // zoom never fetches PII or refetches the calendar.
});
$('refresh').addEventListener('click',load);
$('detail-close').addEventListener('click',closeDetail);
$('appointment-backdrop').addEventListener('click',closeDetail);
document.addEventListener('keydown',e=>{
 if(e.key==='Escape'&&!$('appointment-overlay').hidden){e.preventDefault();closeDetail();}
 if(e.key==='Tab'&&!$('appointment-overlay').hidden){
  const nodes=[...$('appointment-dialog').querySelectorAll('button:not(:disabled),a[href]')].filter(e=>e.offsetParent!==null);
  if(!nodes.length){e.preventDefault();return;}
  const first=nodes[0],last=nodes[nodes.length-1];
  if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}
  else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
 }
});
api('/api/staff/auth').then(r=>{
 if(r.authenticated&&r.staff)loggedIn(r.staff);
 else{
  loggedOut();
  if(!r.configured)loginStatus('Owner setup required: staff login database is not configured.');
 }
}).catch(()=>loggedOut());
})();