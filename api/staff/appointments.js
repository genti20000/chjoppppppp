'use strict';
// Legacy day endpoint: retains staff-only schedule access but NO customer identifiers.
// Masked hints are returned only by the explicitly opened appointment-details endpoint.
const s=require('../../lib/staff');
const c=require('../../lib/staff-calendar');
module.exports=async function(req,res){
 res.setHeader('Cache-Control','no-store,private');
 if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({error:'Method not allowed.'});}
 try{
  const user=await s.requireStaff(req);
  const day=String(req.query?.date||'');
  const data=await c.calendar(user,day,day,user.barber_id);
  return res.status(200).json({
   barber:s.publicUser(user),date:day,
   square_connected:s.squareReady(),
   calls_connected:s.callsReady(),
   appointments:data.events
  });
 }catch(e){return res.status(e.status||503).json({error:e.status?e.message:'Appointments unavailable.'});}
};