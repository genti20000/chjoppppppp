'use strict';
const crypto = require('node:crypto');
const ID = 'choppers';
const IDS = ['liri','marouan','nick','victor'];
const DEFAULT = {order: IDS, links: {}};
const COOKIE = 'choppers_owner';
function storageReady() {return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);}
function adminReady() {return Boolean(process.env.ADMIN_PASSWORD && process.env.SESSION_SECRET);}
function same(a,b) {
  const ah=crypto.createHash('sha256').update(String(a)).digest();
  const bh=crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ah,bh);
}
function validLogin(pass) {return adminReady() && same(pass,process.env.ADMIN_PASSWORD);}
function sign(timestamp) {return crypto.createHmac('sha256',process.env.SESSION_SECRET).update(String(timestamp)).digest('hex');}
function cookieValue() {const expires=Date.now()+12*60*60*1000; return expires+'.'+sign(expires);}
function cookieOptions(value,maxAge) {return COOKIE+'='+encodeURIComponent(value)+'; Path=/; HttpOnly; SameSite=Strict; Max-Age='+maxAge+(process.env.VERCEL ? '; Secure' : '');}
function authenticated(req) {
  if (!adminReady()) return false;
  const c=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(COOKIE+'='));
  if (!c) return false;
  const tok=decodeURIComponent(c.slice(COOKIE.length+1));
  const pair=tok.split('.');if(pair.length!==2)return false;
  const exp=Number(pair[0]);if(!Number.isSafeInteger(exp)||exp<=Date.now())return false;
  return same(pair[1],sign(pair[0]));
}
function squareUrl(value) {
  if (typeof value!=='string') throw Error('Booking links must be text.');
  const trimmed=value.trim();
  if(!trimmed)return '';
  if(trimmed.length>1000)throw Error('Booking link is too long.');
  let url;try {url=new URL(trimmed);}catch{throw Error('Enter a complete https:// Square booking URL.');}
  const host=url.hostname.toLowerCase();
  if(url.protocol!=='https:'||url.username||url.password||url.port||!['squareup.com','square.site'].some(root=>host===root||host.endsWith('.'+root))){
    throw Error('Only secure Square booking links are permitted.');
  }
  return url.toString();
}
function validate(body) {
  if(!body||!Array.isArray(body.order)||body.order.length!==IDS.length||new Set(body.order).size!==IDS.length||!IDS.every(x=>body.order.includes(x)))throw Error('Invalid barber order.');
  if(!body.links||typeof body.links!=='object'||Array.isArray(body.links))throw Error('Invalid booking links.');
  const links={};
  for(const id of IDS) links[id]=squareUrl(body.links[id]||'');
  return {order:body.order,links};
}
function supabaseEndpoint() {
 const base=process.env.SUPABASE_URL.replace(/\/+$/,'');
 if(!/^https:\/\/[a-z0-9.-]+\.supabase\.co$/i.test(base))throw Error('SUPABASE_URL must be an https Supabase project address.');
 return base+'/rest/v1/choppers_booking_config';
}
async function dbFetch(url,options) {
 const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 const res=await fetch(url,{...options,headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json',...options.headers},cache:'no-store',signal:AbortSignal.timeout(8000)});
 if(!res.ok)throw Error('Database unavailable ('+res.status+'). Run schema.sql and check Vercel environment variables.');
 return res;
}
async function readConfig() {
 if(!storageReady())return {...DEFAULT,storageReady:false};
 const res=await dbFetch(supabaseEndpoint()+'?id=eq.'+ID+'&select=settings',{method:'GET'});
 const rows=await res.json();
 const c=rows[0]?.settings;
 try{return {...(c?validate(c):DEFAULT),storageReady:true};}catch{return {...DEFAULT,storageReady:true};}
}
async function writeConfig(data) {
 if(!storageReady())throw Error('Permanent saving is not set up. Configure Supabase in Vercel first.');
 const valid=validate(data);
 await dbFetch(supabaseEndpoint()+'?on_conflict=id',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify([{id:ID,settings:valid}])});
 return valid;
}
module.exports={validLogin,cookieValue,cookieOptions,authenticated,adminReady,readConfig,writeConfig,validate};