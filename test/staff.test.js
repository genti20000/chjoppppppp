'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');

process.env.SUPABASE_URL='https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY='not-a-real-test-service-key';
process.env.SESSION_SECRET='staff-unit-tests-only-long-signature-secret';
process.env.SQUARE_ACCESS_TOKEN='not-a-real-square-token';
process.env.SQUARE_LOCATION_ID='LDBX5380WHX98';
process.env.TWILIO_ACCOUNT_SID='AC'+'a'.repeat(32);
process.env.TWILIO_AUTH_TOKEN='dummy-twilio-secret';
process.env.TWILIO_PHONE_NUMBER='+442070000000';
let nonce='nonce-for-test-session';
const USER={id:'11111111-1111-4111-8111-111111111111',barber_id:'victor',
 display_name:'Victor',username:'victor',password_hash:'unused',phone_e164:'+447700900111',active:true};
const staff=require('../lib/staff');
const localDay=instant=>{
 const p=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(instant).map(x=>[x.type,x.value]));
 return p.year+'-'+p.month+'-'+p.day;
};
const start=new Date(Date.now()+3600000).toISOString();
const day=localDay(new Date(start));
const booking={id:'BOOKING123',status:'ACCEPTED',location_id:process.env.SQUARE_LOCATION_ID,
 customer_id:'CUST_ID',start_at:start,
 appointment_segments:[{team_member_id:'TEAMVICTOR',service_variation_id:'VARHAIRCUT',duration_minutes:30}]};
let twilioRequest=null,rateCalls=0,customerReads=0;
function json(data,status=200){return {ok:status>=200&&status<300,status,text:async()=>JSON.stringify(data),json:async()=>data};}
global.fetch=async(url,options={})=>{
 const u=String(url);
 if(u.includes('/rest/v1/choppers_staff_users?'))return json([{...USER,session_nonce:nonce}]);
 if(u.includes('/rest/v1/rpc/choppers_staff_reserve_call')){rateCalls++;return json(true);}
 if(u.includes('/rest/v1/choppers_staff_call_audit'))return json([]);
 if(u.includes('/v2/bookings/team-member-booking-profiles'))return json({team_member_booking_profiles:[
  {is_bookable:true,display_name:'Victor',team_member_id:'TEAMVICTOR'},
  {is_bookable:true,display_name:'Nick',team_member_id:'TEAMNICK'}]});
 if(u.includes('/v2/bookings?'))return json({bookings:[booking,{...booking,id:'NICKONLY',
  appointment_segments:[{team_member_id:'TEAMNICK',service_variation_id:'VARHAIRCUT',duration_minutes:30}]}]});
 if(u.includes('/v2/catalog/batch-retrieve'))return json({objects:[{type:'ITEM_VARIATION',id:'VARHAIRCUT',item_variation_data:{
  item_id:'ITEM_HAIR',price_money:{amount:3900,currency:'GBP'},name:'Regular'}}],
  related_objects:[{type:'ITEM',id:'ITEM_HAIR',item_data:{name:'Haircut'}}]});
 if(u.includes('/v2/bookings/BOOKING123'))return json({booking});
 if(u.includes('/v2/bookings/NICKONLY'))return json({booking:{...booking,id:'NICKONLY',appointment_segments:[
  {team_member_id:'TEAMNICK',service_variation_id:'VARHAIRCUT',duration_minutes:30}]}});
 if(u.includes('/v2/customers/CUST_ID')){customerReads++;return json({customer:{
  id:'CUST_ID',given_name:'Private',family_name:'Customer',email_address:'private@example.com',
  phone_number:'+447700900222'}});}
 if(u.includes('api.twilio.com/2010-04-01')){twilioRequest=String(options.body);return json({sid:'CA'+'a'.repeat(32)});}
 throw Error('Unexpected mocked request: '+u);
};
const userSession=()=>({...USER,session_nonce:nonce});
const asStaff=()=>({headers:{cookie:staff.cookie(staff.signSession(userSession()),28800)}});
test('staff password is salted scrypt and validates safely',()=>{
 const hash=staff.hashPassword('VeryStrongStaffPassword2026');
 assert.ok(hash.startsWith('scrypt:'));
 assert.ok(staff.checkPassword('VeryStrongStaffPassword2026',hash));
 assert.equal(staff.checkPassword('bad-password',hash),false);
 assert.notEqual(hash,staff.hashPassword('VeryStrongStaffPassword2026'));
});
test('staff authentication rejects unsigned cookie',()=>{
 assert.equal(staff.parseSession({headers:{cookie:'choppers_staff=spoofed'}}),null);
});
test('valid staff can authenticate; owner password reset instantly revokes old session',async()=>{
 const req=asStaff();
 assert.equal((await staff.requireStaff(req)).barber_id,'victor');
 nonce='new-nonce-issued-on-password-reset';
 await assert.rejects(staff.requireStaff(req),e=>e.status===401);
 nonce='nonce-for-test-session';
});
test('appointment response excludes customer names, numbers, email and identifiers',async()=>{
 const response=await staff.appointments(userSession(),day);
 assert.equal(response.length,1);
 assert.equal(response[0].id,'BOOKING123');
 assert.equal(response[0].service,'Haircut');
 assert.equal(response[0].estimated_price_pence,3900);
 const payload=JSON.stringify(response);
 for(const forbidden of ['CUST_ID','private@example.com','+447700900222','Private','customer_id','email_address','phone_number']){
  assert.ok(!payload.includes(forbidden),forbidden+' leaked in staff payload');
 }
});
test('staff cannot call a booking belonging to another barber',async()=>{
 const req=userSession();
 await assert.rejects(staff.ownedBooking(req,'NICKONLY'),e=>e.status===403);
 assert.equal(customerReads,0);
});
test('masked calling uses company caller ID and never returns customer number to browser',async()=>{
 const result=await staff.callCustomer(userSession(),'BOOKING123');
 assert.equal(result.ok,true);
 assert.ok(rateCalls>=1);
 assert.ok(twilioRequest.includes('To=%2B447700900111'),'Twilio rings staff first');
 assert.ok(twilioRequest.includes('%2B447700900222'),'Twilio bridges customer server-side');
 assert.ok(twilioRequest.includes('From=%2B442070000000'),'Twilio uses business caller ID');
 assert.ok(!JSON.stringify(result).includes('+447700900222'),'Customer number leaked to browser');
 assert.ok(!JSON.stringify(result).includes('private@example.com'));
});
