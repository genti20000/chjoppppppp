'use strict';
// Calendar privacy and view-scope regression tests. All Square calls are mocked.
const {test}=require('node:test');
const assert=require('node:assert/strict');
process.env.SQUARE_ACCESS_TOKEN='test-token';
process.env.SQUARE_LOCATION_ID='LDBX5380WHX98';
process.env.SQUARE_ENVIRONMENT='sandbox';
process.env.SESSION_SECRET='calendar-tests-strong-test-secret';
const s=require('../lib/staff');
const c=require('../lib/staff-calendar');
const d=new Date();
const date=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/London',year:'numeric',month:'2-digit',day:'2-digit'}).format(d);
const today=(()=>{
 const p=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(d).map(x=>[x.type,x.value]));
 return p.year+'-'+p.month+'-'+p.day;
})();
const START=today+'T12:00:00Z',location=process.env.SQUARE_LOCATION_ID;
const B1={id:'B1',location_id:location,start_at:START,status:'ACCEPTED',customer_id:'C1',
 appointment_segments:[{team_member_id:'TM_VICTOR',service_variation_id:'V1',duration_minutes:30}]};
const B2={id:'B2',location_id:location,start_at:START,status:'ACCEPTED',customer_id:'C2',
 appointment_segments:[{team_member_id:'TM_LIRI',service_variation_id:'V1',duration_minutes:45}]};
const actor={barber_id:'victor',display_name:'Victor',id:'admin-test'};
let profileReads=0,customerReads=0;
function j(data){return {ok:true,status:200,json:async()=>data,text:async()=>JSON.stringify(data)};}
global.fetch=async(url,opt={})=>{
 const u=String(url);
 if(u.includes('/v2/bookings/team-member-booking-profiles?')){
  profileReads++;
  return j({team_member_booking_profiles:[
   {display_name:'Liri',team_member_id:'TM_LIRI',is_bookable:true},
   {display_name:'Marouan',team_member_id:'TM_MAROUAN',is_bookable:true},
   {display_name:'Nick',team_member_id:'TM_NICK',is_bookable:true},
   {display_name:'Victor',team_member_id:'TM_VICTOR',is_bookable:true}]});
 }
 if(u.includes('/v2/bookings?'))return j({bookings:[B1,B2]});
 if(u.includes('/v2/bookings/B1'))return j({booking:B1});
 if(u.includes('/v2/bookings/B2'))return j({booking:B2});
 if(u.includes('/v2/catalog/batch-retrieve'))return j({objects:[
  {id:'V1',type:'ITEM_VARIATION',item_variation_data:{item_id:'I1',name:'Short',price_money:{amount:2400,currency:'GBP'}}},
  {id:'I1',type:'ITEM',item_data:{name:'Men Haircut'}}]});
 if(u.includes('/v2/customers/C1')||u.includes('/v2/customers/C2')){
  customerReads++;
  return j({customer:{given_name:'James',family_name:'Smith',phone_number:'+447700900123',
   email_address:'james.smith@example.com',note:'PRIVATE MEDICAL INFORMATION'}});
 }
 throw Error('Unhandled Square mock: '+u);
};
test('all-barbers day lists all four lanes but no customer data or names',async()=>{
 const r=await c.calendar(actor,today,today,'all');
 assert.deepEqual(r.events.map(x=>x.barber).sort(),['liri','victor']);
 assert.equal(r.barbers.length,4);
 assert.equal(customerReads,0,'Calendar must not fetch personal data');
 const serialized=JSON.stringify(r);
 for(const secret of ['James','Smith','123','james.smith','customer_id','given_name','customer','PRIVATE MEDICAL','C1','C2']){
  assert.ok(!serialized.includes(secret),'Private data leaked into calendar: '+secret);
 }
});
test('single barber Week contains no bookings for other barbers',async()=>{
 const start=c.dayPlus(today,-((new Date(today+'T12:00:00Z').getUTCDay()+6)%7));
 const end=c.dayPlus(start,6);
 const result=await c.calendar(actor,start,end,'victor');
 assert.equal(result.events.length,1);
 assert.equal(result.events[0].barber,'victor');
 assert.equal(customerReads,0);
});
test('Month permitted for single barber, disallowed for all barbers',async()=>{
 const start=today.slice(0,7)+'-01';
 const max=new Date(Date.UTC(Number(today.slice(0,4)),Number(today.slice(5,7)),0)).getUTCDate();
 const end=today.slice(0,7)+'-'+String(max).padStart(2,'0');
 const r=await c.calendar(actor,start,end,'liri');
 assert.equal(r.events.length,1);
 await assert.rejects(c.calendar(actor,start,end,'all'),e=>e.status===400);
});
test('clicking appointment returns only masked identifiers; assigned barber can call when configured',async()=>{
 const r=await c.detail(actor,'B1');
 assert.deepEqual(r.customer,{name:'James S.',phone_hint:'••• 123',email_hint:'jam•••'});
 assert.equal(r.can_call,false,'Twilio not connected in test environment');
 assert.equal(customerReads,1);
 const response=JSON.stringify(r);
 for(const secret of ['Smith','7700900123','james.smith','@example.com','PRIVATE MEDICAL','customer_id','family_name','phone_number']){
  assert.ok(!response.includes(secret),'Unmasked field leaked: '+secret);
 }
});
test('any signed-in barber can open masked details of another team member, but cannot call them',async()=>{
 const r=await c.detail(actor,'B2');
 assert.equal(r.barber,'liri');
 assert.equal(r.customer.name,'James S.');
 assert.equal(r.can_call,false);
 await assert.rejects(s.ownedBooking(actor,'B2'), e=>e.status===403);
});
test('invalid dates and all-barber multi-day request rejected server-side',async()=>{
 await assert.rejects(c.calendar(actor,'2026-19-99','2026-19-99','victor'), e=>e.status===400);
 await assert.rejects(c.calendar(actor,today,c.dayPlus(today,1),'all'),e=>e.status===400);
 assert.ok(profileReads>0);
});