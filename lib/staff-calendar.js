'use strict';
// Server-only Square appointment calendar for Choppers. No customer PII in calendar responses.
const s=require('./staff');
const DATE_RE=/^\d{4}-\d{2}-\d{2}$/;
const DAY_MS=86400000;
function dateUTC(value){
 if(typeof value!=='string'||!DATE_RE.test(value))throw s.err('Choose a valid date.',400);
 const date=new Date(value+'T12:00:00Z');
 if(!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==value)throw s.err('Invalid date.',400);
 if(Math.abs(date.getTime()-Date.now())>370*DAY_MS)throw s.err('Calendar date is outside the available range.',400);
 return date;
}
function dayPlus(day,n){
 const d=new Date(dateUTC(day).getTime()+n*DAY_MS);
 return d.toISOString().slice(0,10);
}
function barberParam(barber){
 const id=String(barber||'').toLowerCase();
 if(id!=='all'&&!s.IDS.includes(id))throw s.err('Choose a valid barber.',400);
 return id;
}
function interval(start,end,barber){
 dateUTC(start);dateUTC(end);
 const days=Math.round((dateUTC(end)-dateUTC(start))/DAY_MS)+1;
 if(days<1||days>31)throw s.err('Calendar range must be 1–31 days.',400);
 if(barber==='all'&&days!==1)throw s.err('All barbers is available for Day view only.',400);
 return days;
}
async function staffMapping(){
 // Only the four published Choppers staff members; never return other Square employees.
 const entries=await Promise.all(s.IDS.map(async id=>[id,await s.teamMemberId(id)]));
 const ids=new Map(entries.map(([name,squareId])=>[squareId,name]));
 if(ids.size!==s.IDS.length)throw s.err('Square barber profiles are not uniquely configured.',503);
 return {ids,byName:Object.fromEntries(entries)};
}
function squareBounds(first,last){
 // Extend both sides for UTC conversion to Europe/London including daylight-saving changes.
 const a=new Date(first+'T00:00:00Z').getTime();
 const b=new Date(last+'T00:00:00Z').getTime();
 return {from:new Date(a-3*3600000).toISOString(),to:new Date(b+27*3600000).toISOString()};
}
async function listPeriod(start,end,teamId){
 const base={location_id:s.locationId(),limit:'100'};
 if(teamId)base.team_member_id=teamId;
 const all=[];
 const days=Math.round((dateUTC(end)-dateUTC(start))/DAY_MS)+1;
 for(let offset=0;offset<days;offset+=12){
  const chunkEnd=dayPlus(start,Math.min(offset+11,days-1));
  const b=squareBounds(dayPlus(start,offset),chunkEnd);
  let cursor;
  for(let page=0;page<20;page++){
   const q=new URLSearchParams({...base,start_at_min:b.from,start_at_max:b.to,...(cursor?{cursor}:{})});
   const result=await s.square('/v2/bookings?'+q);
   all.push(...(result.bookings||[]));
   cursor=result.cursor;
   if(!cursor)break;
   if(page===19)throw s.err('Too many bookings to load at once. Choose a shorter range.',503);
  }
 }
 const unique=new Map();
 for(const b of all){
  if(!b?.id||!b.start_at||!b.appointment_segments?.length||!b.location_id||b.location_id!==s.locationId())continue;
  if(['CANCELLED','DECLINED'].includes(b.status))continue;
  const uk=s.ukDay(b.start_at);
  if(uk<start||uk>end)continue;
  unique.set(b.id,b);
 }
 return [...unique.values()].sort((a,b)=>a.start_at.localeCompare(b.start_at));
}
async function variationInfo(bookings){
 const ids=[...new Set(bookings.flatMap(b=>(b.appointment_segments||[]).map(x=>x.service_variation_id).filter(Boolean)))];
 const info=new Map();
 for(let i=0;i<ids.length;i+=100){
  try{
   const result=await s.square('/v2/catalog/batch-retrieve','POST',{object_ids:ids.slice(i,i+100),include_related_objects:true});
   const objects=[...(result.objects||[]),...(result.related_objects||[])];
   const items=new Map(objects.filter(o=>o.type==='ITEM').map(o=>[o.id,String(o.item_data?.name||'Service').slice(0,65)]));
   for(const v of objects.filter(o=>o.type==='ITEM_VARIATION')){
    const d=v.item_variation_data||{};
    const price=d.price_money?.currency==='GBP'?Number(d.price_money.amount):null;
    info.set(v.id,{title:items.get(d.item_id)||String(d.name||'Appointment').slice(0,65),
      pence:Number.isFinite(price)?price:null});
   }
  }catch(e){console.warn('Calendar catalog labels unavailable.');}
 }
 return info;
}
function summary(b,barberId,teamId,variationInfo){
 const seg=(b.appointment_segments||[]).filter(x=>x.team_member_id===teamId);
 const duration=seg.reduce((total,x)=>total+(Number(x.duration_minutes)||0),0);
 const info=seg.map(x=>variationInfo.get(x.service_variation_id));
 return {
  id:b.id,
  barber:barberId,
  start_at:b.start_at,
  duration_minutes:Math.max(15,Math.min(600,duration||30)),
  status:b.status||'BOOKED',
  service:info.map(x=>x?.title||'Appointment').join(' + ').slice(0,120),
  estimated_price_pence:info.length&&info.every(x=>Number.isFinite(x?.pence))
    ? info.reduce((t,x)=>t+x.pence,0):null
  // NO first name, surname initial, customer ID, phone or email in the calendar response.
 };
}
async function calendar(user,start,end,barberInput){
 const barber=barberParam(barberInput||user.barber_id);
 interval(start,end,barber);
 const mapping=await staffMapping();
 const teamId=barber==='all'?null:mapping.byName[barber];
 const bookings=await listPeriod(start,end,teamId);
 const allowed=bookings.filter(b=>b.appointment_segments.some(x=>mapping.ids.has(x.team_member_id)&&
   (barber==='all'||x.team_member_id===teamId)));
 const catalog=await variationInfo(allowed);
 const events=[];
 for(const b of allowed){
  const involved=[...new Set(b.appointment_segments.map(x=>x.team_member_id).filter(x=>mapping.ids.has(x)))];
  for(const id of involved){
   const name=mapping.ids.get(id);
   if(barber==='all'||name===barber)events.push(summary(b,name,id,catalog));
  }
 }
 return {
  start,end,barber,
  barbers:s.IDS.map(id=>({id,name:s.NAMES[id]})),
  own_barber:user.barber_id,
  calls_connected:s.callsReady(),
  events
 };
}
async function detail(user,id){
 if(typeof id!=='string'||id.length>128||!/^[a-zA-Z0-9_-]+$/.test(id))throw s.err('Invalid appointment.',400);
 const b=(await s.square('/v2/bookings/'+encodeURIComponent(id))).booking;
 if(!b||b.location_id!==s.locationId()||!b.start_at||!b.appointment_segments?.length||
    ['CANCELLED','DECLINED'].includes(b.status))throw s.err('Appointment not found.',404);
 const scheduled=new Date(b.start_at).getTime();
 if(!Number.isFinite(scheduled)||Math.abs(scheduled-Date.now())>370*DAY_MS)throw s.err('Appointment outside the viewing range.',403);
 const mapping=await staffMapping();
 const matching=b.appointment_segments.find(x=>mapping.ids.has(x.team_member_id));
 if(!matching)throw s.err('This appointment does not belong to Choppers.',403);
 const who=mapping.ids.get(matching.team_member_id);
 const catalog=await variationInfo([b]);
 const value=summary(b,who,matching.team_member_id,catalog);
 // Only at this point do we request PII; it is reduced to limited hints on the server.
 let customer=null;
 if(b.customer_id){
  try{
   const profile=(await s.square('/v2/customers/'+encodeURIComponent(b.customer_id))).customer;
   customer=s.customerHint(profile);
  }catch(e){console.warn('Calendar appointment customer hints unavailable.');}
 }
 return {...value,customer,can_call:user.barber_id===who&&s.callsReady()};
}
module.exports={calendar,detail,interval,dayPlus,barberParam,dateUTC,summary};