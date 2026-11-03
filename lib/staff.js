'use strict';
// Choppers staff backend. Only import from Vercel serverless functions.
const crypto=require('node:crypto');
const cryptoScrypt=(password,salt)=>crypto.scryptSync(password,salt,64).toString('base64url');
const IDS=['liri','marouan','nick','victor'];
const NAMES={liri:'Liri',marouan:'Marouan',nick:'Nick',victor:'Victor'};
const COOKIE='choppers_staff';
const SESSION_MS=8*60*60*1000;
const SQUARE_VERSION='2026-09-16';
const err=(message,status=400)=>Object.assign(new Error(message),{status});
function configReady(){
 return !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.SESSION_SECRET);
}
function squareReady(){return !!(process.env.SQUARE_ACCESS_TOKEN&&process.env.SQUARE_LOCATION_ID);}
function callsReady(){return squareReady()&&configReady()&&!!(process.env.TWILIO_ACCOUNT_SID&&process.env.TWILIO_AUTH_TOKEN&&(process.env.TWILIO_CALLER_ID||process.env.TWILIO_PHONE_NUMBER));}
function safeOrigin(req){
 const origin=req.headers.origin;
 const host=req.headers.host;
 if(!host||!origin)return false;
 try{return new URL(origin).host===host && /^https?:$/.test(new URL(origin).protocol);}
 catch{return false;}
}
function requireOrigin(req){if(!safeOrigin(req))throw err('Request origin is not allowed.',403);}
function cookie(value,age){
 return COOKIE+'='+encodeURIComponent(value)+'; Path=/; HttpOnly; SameSite=Strict; Max-Age='+age+(process.env.VERCEL?'; Secure':'');
}
function hashPassword(password){
 if(typeof password!=='string'||password.length<12||password.length>160)throw err('Staff passwords must be 12 to 160 characters.');
 const salt=crypto.randomBytes(24).toString('base64url');
 return 'scrypt:'+salt+':'+cryptoScrypt(password,salt);
}
function checkPassword(password,stored){
 if(typeof password!=='string'||!stored?.startsWith('scrypt:'))return false;
 const p=stored.split(':');if(p.length!==3)return false;
 try{
  const expected=Buffer.from(p[2],'base64url');
  const got=Buffer.from(cryptoScrypt(password,p[1]),'base64url');
  return expected.length===got.length&&crypto.timingSafeEqual(expected,got);
 }catch{return false;}
}
function signSession(user){
 const exp=Date.now()+SESSION_MS;
 const raw=Buffer.from(JSON.stringify({id:user.id,nonce:user.session_nonce,exp})).toString('base64url');
 const mac=crypto.createHmac('sha256',process.env.SESSION_SECRET).update('staff:'+raw).digest('base64url');
 return raw+'.'+mac;
}
function parseSession(req){
 if(!configReady())return null;
 const raw=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(COOKIE+'='));
 if(!raw)return null;
 try{
  const token=decodeURIComponent(raw.slice(COOKIE.length+1));
  const [data,signature]=token.split('.');
  if(!data||!signature||data.length>500)return null;
  const expected=crypto.createHmac('sha256',process.env.SESSION_SECRET).update('staff:'+data).digest();
  const actual=Buffer.from(signature,'base64url');
  if(expected.length!==actual.length||!crypto.timingSafeEqual(expected,actual))return null;
  const session=JSON.parse(Buffer.from(data,'base64url').toString('utf8'));
  if(!session.id||!Number.isSafeInteger(session.exp)||Date.now()>=session.exp)return null;
  return session;
 }catch{return null;}
}
function restUrl(){
 if(!configReady())throw err('Staff login database is not configured yet.',503);
 const base=process.env.SUPABASE_URL.replace(/\/+$/,'');
 if(!/^https:\/\/[a-z0-9.-]+\.supabase\.co$/i.test(base))throw err('Invalid database configuration.',503);
 return base+'/rest/v1/';
}
async function db(path,method='GET',body,extra={}){
 const url=restUrl()+path;
 const token=process.env.SUPABASE_SERVICE_ROLE_KEY;
 const ac=new AbortController(), timeout=setTimeout(()=>ac.abort(),9000);
 try{
  const response=await fetch(url,{method,headers:{apikey:token,Authorization:'Bearer '+token,
   'Content-Type':'application/json',...(method==='POST'&&path.startsWith('choppers_staff_')?{Prefer:'return=representation'}:{}),...extra},
   ...(body===undefined?{}:{body:JSON.stringify(body)}),cache:'no-store',signal:ac.signal});
  if(!response.ok){
   console.error('Choppers staff DB error',response.status,path.split('?')[0]);
   throw err('Staff records temporarily unavailable. Please contact the owner.',503);
  }
  const text=await response.text();
  return text?JSON.parse(text):null;
 }catch(e){
  if(e.status)throw e;
  console.error('Choppers staff DB network failure',String(e.message).slice(0,90));
  throw err('Staff records temporarily unavailable.',503);
 }finally{clearTimeout(timeout);}
}
const fields='id,barber_id,display_name,username,password_hash,session_nonce,phone_e164,active';
async function findByUsername(username){
 const records=await db('choppers_staff_users?username=eq.'+encodeURIComponent(username)+'&select='+fields+'&limit=1');
 return records?.[0]||null;
}
async function requireStaff(req){
 const s=parseSession(req);
 if(!s)throw err('Sign in to your staff account.',401);
 const users=await db('choppers_staff_users?id=eq.'+encodeURIComponent(s.id)+'&select='+fields+'&limit=1');
 const user=users?.[0];
 if(!user?.active||!IDS.includes(user.barber_id)||s.nonce!==user.session_nonce)throw err('Staff access has expired or been disabled. Please sign in again.',401);
 return user;
}
function publicUser(user){
 return {barber_id:user.barber_id,display_name:user.display_name,username:user.username};
}
function validateUsername(input){
 const v=String(input||'').trim().toLowerCase();
 if(!/^[a-z][a-z0-9._-]{2,31}$/.test(v))throw err('Username must be 3–32 characters, starting with a letter.');
 return v;
}
function phone(input){
 const v=String(input||'').replace(/[\s().-]/g,'');
 if(/^07\d{9}$/.test(v))return '+44'+v.slice(1);
 if(/^0044[1-9]\d{8,14}$/.test(v))return '+'+v.slice(2);
 if(/^\+[1-9]\d{8,14}$/.test(v))return v;
 throw err('Enter a valid staff mobile number, e.g. 07123 456789.');
}
function locationId(){
 if(!squareReady())throw err('Square appointment read access is not configured yet.',503);
 return process.env.SQUARE_LOCATION_ID;
}
async function square(path,method='GET',body){
 const token=process.env.SQUARE_ACCESS_TOKEN;
 locationId();
 const host=process.env.SQUARE_ENVIRONMENT==='sandbox'?'https://connect.squareupsandbox.com':'https://connect.squareup.com';
 const ac=new AbortController(),timer=setTimeout(()=>ac.abort(),12000);
 try{
  const response=await fetch(host+path,{method,headers:{Authorization:'Bearer '+token,'Square-Version':SQUARE_VERSION,'Content-Type':'application/json'},
    ...(body===undefined?{}:{body:JSON.stringify(body)}),cache:'no-store',signal:ac.signal});
  if(!response.ok){
   console.error('Choppers staff Square read error',response.status,path.split('?')[0]);
   throw err('Square appointments are unavailable. Check Square account permissions.',503);
  }
  return response.json();
 }catch(e){
  if(e.status)throw e;
  throw err('Could not reach Square right now.',503);
 }finally{clearTimeout(timer);}
}
function normalizedName(name){
 return String(name||'').trim().toLowerCase().replace(/[\u0300-\u036f]/g,'');
}
async function teamMemberId(barber){
 if(!IDS.includes(barber))throw err('Invalid staff member.',403);
 const q=new URLSearchParams({bookable_only:'true',location_id:locationId(),limit:'100'});
 const p=await square('/v2/bookings/team-member-booking-profiles?'+q);
 const matches=(p.team_member_booking_profiles||[]).filter(x=>x.is_bookable && 
  (normalizedName(x.display_name)===barber||normalizedName(x.display_name).startsWith(barber+' ')));
 if(matches.length!==1)throw err('Could not match your Square booking profile uniquely. Ask the owner to check the Square staff names.',503);
 return matches[0].team_member_id;
}
function isoRange(day){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(day||''))throw err('Choose a valid appointment date.');
 const date=new Date(day+'T12:00:00Z');
 if(Number.isNaN(date.getTime())||date.toISOString().slice(0,10)!==day)throw err('Invalid date.');
 if(Math.abs(date.getTime()-Date.now())>15*86400000)throw err('Appointment date is outside the available range.');
 const start=new Date(day+'T00:00:00Z');
 // Broader UTC range covers GMT/BST, then filter using the London calendar date.
 return {start:new Date(start.getTime()-3*3600000).toISOString(),end:new Date(start.getTime()+27*3600000).toISOString()};
}
function ukDay(iso){
 const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(iso));
 const p=Object.fromEntries(parts.map(x=>[x.type,x.value]));
 return p.year+'-'+p.month+'-'+p.day;
}
async function appointments(user,day){
 const {start,end}=isoRange(day);
 const teamId=await teamMemberId(user.barber_id);
 const base={team_member_id:teamId,location_id:locationId(),start_at_min:start,start_at_max:end,limit:'100'};
 let cursor,bookings=[];
 for(let page=0;page<3;page++){
  const q=new URLSearchParams({...base,...(cursor?{cursor}:{})});
  const response=await square('/v2/bookings?'+q.toString());
  bookings.push(...(response.bookings||[]));
  cursor=response.cursor;
  if(!cursor)break;
 }
 const current=bookings.filter(b=>b.id && b.start_at && ukDay(b.start_at)===day &&
   b.appointment_segments?.some(segment=>segment.team_member_id===teamId) &&
   !['CANCELLED','DECLINED'].includes(b.status))
   .sort((a,b)=>a.start_at.localeCompare(b.start_at)).slice(0,100);
 // Fetch only service catalog data. No customer identities or notes are sent to staff.
 const ids=[...new Set(current.flatMap(b=>(b.appointment_segments||[]).map(x=>x.service_variation_id).filter(Boolean)))];
 const names=new Map();
 if(ids.length){
  try {
   const catalog=await square('/v2/catalog/batch-retrieve','POST',{object_ids:ids,include_related_objects:true});
   const objects=[...(catalog.objects||[]),...(catalog.related_objects||[])];
   const itemNames=new Map(objects.filter(o=>o.type==='ITEM').map(o=>[o.id,o.item_data?.name]));
   for(const variation of objects.filter(o=>o.type==='ITEM_VARIATION')){
    const d=variation.item_variation_data||{};
    const title=itemNames.get(d.item_id)||d.name||'Service';
    names.set(variation.id,{
     name:String(title).slice(0,80),
     price_pence:d.price_money?.currency==='GBP'?Number(d.price_money.amount):null
    });
   }
  }catch(e){console.warn('Staff catalog detail not available',e.message);}
 }
 return current.map(b=>{
  const segments=(b.appointment_segments||[]).filter(x=>x.team_member_id===teamId);
  return {
   id:b.id,start_at:b.start_at,status:b.status||'BOOKED',
   duration_minutes:segments.reduce((sum,x)=>sum+(Number(x.duration_minutes)||0),0),
   service:segments.map(x=>names.get(x.service_variation_id)?.name||'Appointment').join(' + ').slice(0,140),
   // Prices are reference only. Staff still charge through the Square Register.
   estimated_price_pence:segments.every(x=>Number.isFinite(names.get(x.service_variation_id)?.price_pence))
      ? segments.reduce((total,x)=>total+names.get(x.service_variation_id).price_pence,0):null
  };
 });
}
async function ownedBooking(user,id){
 if(typeof id!=='string'||id.length>128||! /^[a-zA-Z0-9_-]+$/.test(id))throw err('Invalid booking.');
 const b=(await square('/v2/bookings/'+encodeURIComponent(id))).booking;
 const teamId=await teamMemberId(user.barber_id);
 if(!b||b.location_id!==locationId()||!b.appointment_segments?.some(x=>x.team_member_id===teamId)||
    !b.customer_id||!b.start_at||['CANCELLED','DECLINED'].includes(b.status))throw err('That booking is not available for your staff account.',403);
 const time=Date.parse(b.start_at);
 if(time<Date.now()-3*3600000 || time>Date.now()+7*86400000)throw err('Calling is available only near an upcoming appointment.',403);
 return b;
}
async function callCustomer(user,id){
 if(!callsReady())throw err('Masked calling has not been connected yet.',503);
 const booking=await ownedBooking(user,id);
 const customer=(await square('/v2/customers/'+encodeURIComponent(booking.customer_id))).customer;
 let target;
 try{target=phone(customer?.phone_number);}catch{throw err('No callable customer mobile number is available for this appointment.',409);}
 const allowed=await db('rpc/choppers_staff_reserve_call','POST',{p_staff_id:user.id,p_booking_id:booking.id});
 if(allowed!==true)throw err('Call limit reached for this appointment. Please ask the owner for assistance.',429);
 // Either a Twilio-owned number or an existing Choppers number verified as an Outgoing Caller ID.
 const businessNumber=phone(process.env.TWILIO_CALLER_ID||process.env.TWILIO_PHONE_NUMBER);
 const staffNumber=phone(user.phone_e164);
 if(staffNumber===target)throw err('The caller and customer phone numbers cannot be the same.',409);
 // First ring the barber's registered phone, then bridge to customer.
 // Both legs present only Choppers' business number. No TwiML URL with customer PII.
 const twiml='<Response><Say voice="alice">Connecting you to the Choppers customer now.</Say><Dial callerId="'+businessNumber+'" timeout="25" record="do-not-record"><Number>'+target+'</Number></Dial></Response>';
 const sid=process.env.TWILIO_ACCOUNT_SID;
 if(!/^AC[a-f0-9]{32}$/i.test(sid))throw err('Twilio account is not configured correctly.',503);
 const params=new URLSearchParams({From:businessNumber,To:staffNumber,Twiml:twiml,Timeout:'25',TimeLimit:'900'});
 const auth=Buffer.from(sid+':'+process.env.TWILIO_AUTH_TOKEN).toString('base64');
 let successful=false,callSid=null;
 try{
  const r=await fetch('https://api.twilio.com/2010-04-01/Accounts/'+sid+'/Calls.json',{
   method:'POST',headers:{Authorization:'Basic '+auth,'Content-Type':'application/x-www-form-urlencoded'},
   body:params,signal:AbortSignal.timeout(10000),cache:'no-store'});
  const response=await r.json();
  successful=r.ok && /^CA[a-f0-9]{32}$/i.test(response.sid||'');
  callSid=successful?response.sid:null;
  if(!successful)console.error('Twilio outbound masked call failed',r.status,response.code||'');
 }catch(e){console.error('Twilio outbound masked call request uncertain',String(e.message).slice(0,90));}
 try{
  await db('choppers_staff_call_audit','POST',{
   staff_id:user.id,booking_id:booking.id,call_sid:callSid,status:successful?'initiated':'failed'
  });
 }catch(e){console.error('Call audit failed',e.message);}
 if(!successful)throw err('The call could not be connected. Please ask the owner before trying again.',502);
 return {ok:true,message:'Your registered phone should ring shortly. The customer number is hidden.'};
}
module.exports={IDS,NAMES,configReady,squareReady,callsReady,err,requireOrigin,cookie,hashPassword,checkPassword,signSession,parseSession,
 db,findByUsername,requireStaff,publicUser,validateUsername,phone,appointments,ownedBooking,callCustomer,teamMemberId,isoRange};
