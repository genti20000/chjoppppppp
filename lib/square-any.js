'use strict';

// Server-side only. Never import this module into public browser scripts.
// Square: https://developer.squareup.com/reference/square/bookings-api
const crypto = require('node:crypto');
const VERSION = '2026-09-16';
const LOCATION = () => process.env.SQUARE_LOCATION_ID || 'LDBX5380WHX98';
const KNOWN_BARBERS = ['liri', 'marouan', 'nick', 'victor'];
const TOKEN_TTL_MS = 10 * 60 * 1000;
const MIN_NOTICE_MS = 30 * 60 * 1000;
const publicError = (message, status = 400) => Object.assign(new Error(message), {status});
const ready = () => Boolean(
  process.env.SQUARE_ANY_BOOKING_ENABLED === 'true' &&
  process.env.SQUARE_ACCESS_TOKEN &&
  process.env.SQUARE_SLOT_SIGNING_SECRET &&
  process.env.TURNSTILE_SECRET_KEY &&
  process.env.TURNSTILE_SITE_KEY
);
function requireReady() {
  if (!ready()) throw publicError('Automatic bookings are not connected yet. Please book through Square instead.', 503);
}
function squareHost() {
  return process.env.SQUARE_ENVIRONMENT === 'sandbox'
    ? 'https://connect.squareupsandbox.com'
    : 'https://connect.squareup.com';
}
async function square(method, path, body) {
  requireReady();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(squareHost() + path, {
      method,
      headers: {
        Authorization: 'Bearer ' + process.env.SQUARE_ACCESS_TOKEN,
        'Square-Version': VERSION,
        'Content-Type': 'application/json'
      },
      ...(body === undefined ? {} : {body: JSON.stringify(body)}),
      signal: controller.signal,
      cache: 'no-store'
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.errors?.length) {
      const codes = (data.errors || []).map(e => e.code).filter(Boolean);
      const err = publicError(
        response.status === 401 || response.status === 403
          ? 'Square credentials or Appointments API permissions are not configured correctly.'
          : (response.status === 429
            ? 'Square is busy. Please try again shortly.'
            : 'Square could not complete this request. Please try another time or use the regular booking page.'),
        response.status === 429 ? 429 : 502
      );
      err.squareCodes = codes;
      err.squareStatus = response.status;
      console.error('Square request failed', method, path.split('?')[0], response.status, codes.join(','));
      throw err;
    }
    return data;
  } catch (error) {
    if (error.status) throw error;
    console.error('Square network request failed', method, path.split('?')[0], String(error.message).slice(0,100));
    throw publicError('Could not contact Square right now. Please retry shortly.', 502);
  } finally {
    clearTimeout(timer);
  }
}
function ukDate(instant = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(instant);
  const x = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return x.year + '-' + x.month + '-' + x.day;
}
function dateValid(day) {
  if (typeof day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
  const d = new Date(day + 'T12:00:00Z');
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0,10) !== day) return false;
  if ([0,6].includes(d.getUTCDay())) return false; // Saturday: SimplyBook. Sunday: closed.
  const today = ukDate();
  return day >= today && day <= new Date(Date.now() + 31*86400000).toISOString().slice(0,10);
}
function safeServiceId(id) {
  return typeof id === 'string' && /^[A-Za-z0-9_-]{3,80}$/.test(id);
}
function labelTime(iso) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',hour:'2-digit',minute:'2-digit',hour12:false
  }).format(new Date(iso));
}
function validateVariation(item, variation) {
  const v = variation.item_variation_data || {};
  const duration = Math.round(Number(v.service_duration || 0) / 60000);
  // Square cannot API-book services with non-zero no-show fees.
  const noShowFee = v.no_show_fee || item.item_data?.no_show_fee || {};
  const fee = Number(noShowFee.amount ?? noShowFee.money?.amount ?? 0);
  const allowedLocation = variation.present_at_all_locations !== false &&
    item.present_at_all_locations !== false
    || (variation.present_at_location_ids || item.present_at_location_ids || []).includes(LOCATION());
  return v.available_for_booking === true && duration >= 5 && duration <= 240 &&
    fee === 0 && allowedLocation && !variation.is_deleted && !item.is_deleted;
}
async function getServices() {
  requireReady();
  let cursor, pages = 0, result = [];
  do {
    const data = await square('POST', '/v2/catalog/search-catalog-items', {
      product_types: ['APPOINTMENTS_SERVICE'],
      limit: 100,
      ...(cursor ? {cursor} : {})
    });
    for (const item of data.items || []) {
      if (item.type !== 'ITEM' || item.item_data?.product_type !== 'APPOINTMENTS_SERVICE') continue;
      for (const variation of item.item_data?.variations || []) {
        if (!validateVariation(item, variation)) continue;
        const v = variation.item_variation_data;
        const name = item.item_data?.name || 'Service';
        const suffix = v.name && !['regular','default','standard'].includes(v.name.toLowerCase()) ? ' · ' + v.name : '';
        result.push({
          id: variation.id, name: (name+suffix).slice(0,100),
          duration_minutes: Math.round(v.service_duration/60000),
          price: v.price_money ? {amount: Number(v.price_money.amount), currency: v.price_money.currency} : null
        });
      }
    }
    cursor = data.cursor;
    pages++;
  } while (cursor && pages < 6);
  const unique = new Map(result.map(service => [service.id, service]));
  return [...unique.values()].sort((a,b)=>a.name.localeCompare(b.name)).slice(0,100);
}
function keyForDisplayName(name) {
  const plain = String(name || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').trim();
  return KNOWN_BARBERS.find(id => plain === id || plain.startsWith(id + ' ') || plain.startsWith(id + '⚽')) || null;
}
async function team() {
  let cursor, pages = 0, profiles=[];
  do {
    const query = new URLSearchParams({bookable_only:'true',location_id:LOCATION(),limit:'100',...(cursor?{cursor}:{})});
    const data = await square('GET','/v2/bookings/team-member-booking-profiles?'+query.toString());
    profiles.push(...(data.team_member_booking_profiles||[]));
    cursor = data.cursor;
    pages++;
  } while (cursor && pages < 5);
  const allowed = new Map();
  for (const p of profiles) {
    const name = keyForDisplayName(p.display_name);
    if (p.is_bookable && name && !allowed.has(name)) allowed.set(name, p);
  }
  return [...allowed.values()];
}
function sign(obj) {
  const payload = Buffer.from(JSON.stringify(obj)).toString('base64url');
  const signature = crypto.createHmac('sha256',process.env.SQUARE_SLOT_SIGNING_SECRET).update(payload).digest('base64url');
  return payload+'.'+signature;
}
function verify(token) {
  if (typeof token !== 'string' || token.length>16000 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)) {
    throw publicError('This time slot is invalid. Please choose a time again.',409);
  }
  const split = token.split('.');
  const signature = crypto.createHmac('sha256',process.env.SQUARE_SLOT_SIGNING_SECRET).update(split[0]).digest();
  const supplied = Buffer.from(split[1], 'base64url');
  if (supplied.length!==signature.length || !crypto.timingSafeEqual(supplied,signature)) {
    throw publicError('This time slot is invalid. Please choose a time again.',409);
  }
  let payload;
  try {payload=JSON.parse(Buffer.from(split[0],'base64url').toString('utf8'));}
  catch {throw publicError('This time slot is invalid. Please choose a time again.',409);}
  if (!payload || payload.exp < Date.now() || payload.exp > Date.now()+TOKEN_TTL_MS+1000 ||
      !dateValid(payload.day) || !safeServiceId(payload.serviceId) ||
      typeof payload.startAt !== 'string' || !Array.isArray(payload.candidates) ||
      payload.candidates.length < 1 || payload.candidates.length > 30) {
    throw publicError('This time slot has expired. Please choose a fresh time.',409);
  }
  if (Date.parse(payload.startAt) < Date.now()+MIN_NOTICE_MS) {
    throw publicError('That appointment is too soon. Please choose another time.',409);
  }
  return payload;
}
function candidate(segment) {
  if (!segment || !safeServiceId(segment.service_variation_id) ||
    typeof segment.team_member_id!=='string' || segment.team_member_id.length>80 ||
    !Number.isInteger(Number(segment.service_variation_version)) ||
    !Number.isInteger(Number(segment.duration_minutes)) ||
    segment.duration_minutes<5 || segment.duration_minutes>240) return null;
  return {
    team_member_id: segment.team_member_id,
    service_variation_id: segment.service_variation_id,
    service_variation_version: Number(segment.service_variation_version),
    duration_minutes: Number(segment.duration_minutes)
  };
}
async function slots(serviceId,day) {
  if(!safeServiceId(serviceId) || !dateValid(day))throw publicError('Choose a weekday and a valid service.');
  const services = await getServices();
  if (!services.some(s=>s.id===serviceId))throw publicError('This service is not available for automatic booking.');
  const availableBarbers = await team();
  if (!availableBarbers.length) throw publicError('Square does not list Liri, Marouan, Nick or Victor as bookable staff. The shop must check Square team permissions.',503);
  const start = new Date(day+'T00:00:00Z');
  const before = new Date(start.getTime()-12*3600000).toISOString();
  const after = new Date(start.getTime()+36*3600000).toISOString();
  const data = await square('POST','/v2/bookings/availability/search',{
    query:{filter:{
      location_id:LOCATION(),
      start_at_range:{start_at:before,end_at:after},
      segment_filters:[{service_variation_id:serviceId,team_member_id_filter:{any:availableBarbers.map(p=>p.team_member_id)}}]
    }}
  });
  const ids = new Set(availableBarbers.map(p=>p.team_member_id));
  const byTime = new Map();
  for (const slot of data.availabilities || []) {
    const raw = slot.appointment_segments || [];
    if (raw.length !== 1 || ukDate(new Date(slot.start_at))!==day ||
      Date.parse(slot.start_at) < Date.now()+MIN_NOTICE_MS) continue;
    const segment = candidate(raw[0]);
    if (!segment || segment.service_variation_id!==serviceId || !ids.has(segment.team_member_id)) continue;
    if(!byTime.has(slot.start_at)) byTime.set(slot.start_at,new Map());
    byTime.get(slot.start_at).set(segment.team_member_id,segment);
  }
  const entries=[...byTime.entries()].sort(([a],[b])=>a.localeCompare(b)).slice(0,100);
  return entries.map(([startAt,group])=>({
    start_at:startAt,
    local_time:labelTime(startAt),
    token:sign({serviceId,day,startAt,candidates:[...group.values()].sort((a,b)=>a.team_member_id.localeCompare(b.team_member_id)),exp:Date.now()+TOKEN_TTL_MS})
  }));
}
function digest(v) {return crypto.createHash('sha256').update(v).digest('hex').slice(0,48);}
function normalizePhone(input) {
  const compact=String(input || '').replace(/[\s().-]/g,'');
  if (/^07\d{9}$/.test(compact)) return '+44'+compact.slice(1);
  if (/^0044\d{9,10}$/.test(compact)) return '+'+compact.slice(2);
  if (/^\+[1-9]\d{8,15}$/.test(compact)) return compact;
  throw publicError('Enter a valid phone number, such as 07123 456789.');
}
async function verifyCaptcha(token) {
  if (typeof token !== 'string' || token.length < 8 || token.length > 4000)throw publicError('Complete the security check before confirming.',400);
  const body=new URLSearchParams({secret:process.env.TURNSTILE_SECRET_KEY,response:token});
  const response=await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify',{
    method:'POST',body,headers:{'Content-Type':'application/x-www-form-urlencoded'},
    signal:AbortSignal.timeout(10000)
  }).catch(()=>null);
  const result=await response?.json().catch(()=>null);
  if (!result?.success)throw publicError('The security check expired or failed. Please try again.',400);
}
async function confirm(input) {
  requireReady();
  if(!input||typeof input!=='object')throw publicError('Please complete all booking details.');
  const first=String(input.first_name||'').trim();
  const last=String(input.last_name||'').trim();
  const email=String(input.email||'').trim().toLowerCase();
  const phone=normalizePhone(input.phone);
  if(first.length<1||first.length>60||last.length<1||last.length>60 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254) {
    throw publicError('Enter your first name, surname and a valid email address.');
  }
  if(input.consent!==true)throw publicError('Accept the booking privacy notice to continue.');
  const submissionId=String(input.submission_id||'');
  if(!/^[a-f0-9-]{36}$/i.test(submissionId))throw publicError('Refresh the page and try the booking again.');
  const ticket=verify(input.slot_token);
  await verifyCaptcha(input.captcha_token);
  const profileList=await team();
  const allowed=new Map(profileList.map(p=>[p.team_member_id,p]));
  const candidates=ticket.candidates.filter(seg=>allowed.has(seg.team_member_id));
  if(!candidates.length)throw publicError('The available barbers have changed. Choose another appointment time.',409);
  // Keep ordering deterministic across browser retries, but rotate by submission.
  const rotation=parseInt(digest(submissionId+'|'+ticket.startAt).slice(0,8),16) % candidates.length;
  const ordered=candidates.slice(rotation).concat(candidates.slice(0,rotation));
  // All customer and booking credentials stay on the server. Square idempotency protects retry calls.
  const customer=await square('POST','/v2/customers',{
    idempotency_key:'chp-c-'+digest(submissionId+'|'+email),
    given_name:first,family_name:last,email_address:email,phone_number:phone
  });
  const customerId=customer.customer?.id;
  if(!customerId)throw publicError('Square could not create the customer record. Please try again.',502);
  for (let i=0;i<ordered.length;i++) {
    const selected=ordered[i];
    try {
      const result=await square('POST','/v2/bookings',{
        idempotency_key:'chp-b-'+digest(submissionId+'|'+ticket.startAt+'|'+selected.team_member_id),
        booking:{
          customer_id:customerId,
          location_id:LOCATION(),
          start_at:ticket.startAt,
          appointment_segments:[selected]
        }
      });
      if (result.booking?.id) {
        return {
          id:result.booking.id,
          start_at:result.booking.start_at || ticket.startAt,
          barber:allowed.get(selected.team_member_id)?.display_name || 'Your barber',
          status:result.booking.status || 'ACCEPTED'
        };
      }
    }catch(error) {
      const codes=error.squareCodes || [];
      const conflict=codes.some(code=>/CONFLICT|AVAILAB|BOOKING_OUTSIDE|TIME_SLOT/i.test(code));
      if (!conflict) throw error; // Never fall through after a network timeout: could double-book.
      if (i===ordered.length-1)break;
    }
  }
  throw publicError('Sorry, that appointment has just been taken. Choose another time.',409);
}
module.exports={ready,requireReady,ukDate,dateValid,safeServiceId,getServices,team,slots,verify,confirm,publicError};
