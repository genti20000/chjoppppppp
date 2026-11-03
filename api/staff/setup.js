'use strict';
const {authenticated}=require('../../lib/core');
const s=require('../../lib/staff');
module.exports=async function(req,res){
 res.setHeader('Cache-Control','private, no-store');
 res.setHeader('X-Robots-Tag','noindex, nofollow');
 if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({error:'Method not allowed.'});}
 if(!authenticated(req))return res.status(401).json({error:'Owner login required.'});

 const database={configured:s.configReady(),verified:false};
 const square={configured:s.squareReady(),verified:false};
 if(database.configured){
  try{
   await s.db('choppers_staff_users?select=id&limit=1');
   database.verified=true;
  }catch(e){
   database.detail='Staff table could not be read. Check the Malandra key and install staff-schema.sql.';
  }
 }
 if(square.configured){
  try{
   // This validates the Square token and staff-profile mapping, without loading customer details.
   const statuses=await Promise.allSettled(s.IDS.map(id=>s.teamMemberId(id)));
   square.matched_staff=s.IDS.filter((id,i)=>statuses[i].status==='fulfilled');
   square.verified=square.matched_staff.length===s.IDS.length;
   if(!square.verified)square.detail='One or more barber booking profiles could not be matched. Verify Square API scopes and names.';
  }catch(e){
   square.detail='Square appointments could not be verified.';
  }
 }
 return res.status(200).json({
  staff_database_configured:database.configured,
  square_credentials_configured:square.configured,
  masked_calls_configured:s.callsReady(),
  staff_database_verified:database.verified,
  square_staff_profiles_verified:square.verified,
  square_matched_staff:square.matched_staff||[],
  database_detail:database.detail||null,
  square_detail:square.detail||null,
  owner_login_configured:true,
  note:'Only staff-table reads and Square barber profile matching are tested here. Calling and full bookings still require separate live testing.'
 });
};