'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');

process.env.SQUARE_ANY_BOOKING_ENABLED='true';
process.env.SQUARE_ACCESS_TOKEN='sandbox-test-token';
process.env.SQUARE_LOCATION_ID='LDBX5380WHX98';
process.env.SQUARE_SLOT_SIGNING_SECRET='test-only-long-key-that-is-not-production';
process.env.TURNSTILE_SECRET_KEY='test-turnstile-secret';
process.env.TURNSTILE_SITE_KEY='test-turnstile-site';
process.env.SQUARE_ENVIRONMENT='sandbox';

const api=require('../lib/square-any');
let customerCreates=0, bookingCreates=0, availabilityCalls=0;
const people=['Liri','Marouan ⚽️','Nick','Victor'];
const weekday=(()=>{
  for(let i=2;i<=9;i++){
    const d=new Date(Date.now()+i*86400000),weekday=d.getUTCDay();
    if(weekday>=1&&weekday<=5)return d.toISOString().slice(0,10);
  }
  throw Error('Failed to generate weekday.');
})();
const bookTime=new Date(weekday+'T13:00:00Z').toISOString();
function ok(value){return {ok:true,status:200,json:async()=>value};}
global.fetch=async function(url,options={}) {
 const path=String(url);
 if(path.includes('challenges.cloudflare.com/turnstile'))return ok({success:true});
 if(path.includes('/v2/catalog/search-catalog-items'))return ok({items:[{
  type:'ITEM',id:'ITEM1',present_at_all_locations:true,
  item_data:{name:'Haircut',product_type:'APPOINTMENTS_SERVICE',variations:[{
   type:'ITEM_VARIATION',id:'VAR123',present_at_all_locations:true,
   item_variation_data:{name:'Regular',service_duration:1800000,available_for_booking:true,
     price_money:{amount:3900,currency:'GBP'}}
  }]}
 }]});
 if(path.includes('/v2/bookings/team-member-booking-profiles'))return ok({
  team_member_booking_profiles:people.map((p,i)=>({display_name:p,team_member_id:'TEAM'+i,is_bookable:true}))
 });
 if(path.includes('/v2/bookings/availability/search')){
  availabilityCalls++;
  return ok({availabilities:people.map((p,i)=>({
   location_id:process.env.SQUARE_LOCATION_ID,start_at:bookTime,
   appointment_segments:[{
    team_member_id:'TEAM'+i,service_variation_id:'VAR123',
    service_variation_version:123456789,duration_minutes:30
   }]
  }))});
 }
 if(path.endsWith('/v2/customers')){
  customerCreates++;
  const body=JSON.parse(options.body);
  assert.ok(body.idempotency_key);
  assert.equal(body.phone_number,'+447123456789');
  return ok({customer:{id:'CUST123'}});
 }
 if(path.endsWith('/v2/bookings')){
  bookingCreates++;
  const body=JSON.parse(options.body);
  assert.ok(body.idempotency_key);
  assert.equal(body.booking.appointment_segments[0].service_variation_id,'VAR123');
  assert.equal(body.booking.customer_id,'CUST123');
  return ok({booking:{id:'BOOK123',start_at:bookTime,status:'ACCEPTED'}});
 }
 throw Error('Mock request not implemented: '+path);
};

test('ready only when all six integration settings exist',()=>{
 assert.equal(api.ready(),true);
 const before=process.env.TURNSTILE_SECRET_KEY;
 delete process.env.TURNSTILE_SECRET_KEY;
 assert.equal(api.ready(),false);
 process.env.TURNSTILE_SECRET_KEY=before;
});

test('eligible services load from the Square Catalog',async()=>{
 const services=await api.getServices();
 assert.equal(services.length,1);
 assert.equal(services[0].id,'VAR123');
 assert.equal(services[0].duration_minutes,30);
 assert.equal(services[0].price.amount,3900);
});

test('returns one time with staff candidates and validates signed ticket',async()=>{
 const result=await api.slots('VAR123',weekday);
 assert.equal(result.length,1);
 assert.equal(result[0].start_at,bookTime);
 assert.equal(api.verify(result[0].token).candidates.length,4);
 assert.throws(()=>api.verify(result[0].token.slice(0,-2)+'xx'));
 assert.ok(availabilityCalls>0);
});

test('creates one Square customer and booking with an automatically assigned barber',async()=>{
 const result=await api.slots('VAR123',weekday);
 const saved=await api.confirm({
   first_name:'Test',last_name:'Person',email:'test@example.com',
   phone:'07123456789',consent:true,
   submission_id:'6d1f1358-4495-4ec2-ac0f-310c921a3371',
   captcha_token:'captcha-test-response',
   slot_token:result[0].token
 });
 assert.equal(saved.id,'BOOK123');
 assert.ok(people.includes(saved.barber));
 assert.equal(customerCreates,1);
 assert.equal(bookingCreates,1);
});

test('weekends cannot be booked through Square',()=>{
 assert.equal(api.dateValid('2026-11-07'),false);
 assert.equal(api.dateValid('2026-11-08'),false);
});
