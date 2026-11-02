'use strict';
const s=require('../../lib/staff');
module.exports=async function(req,res){
 res.setHeader('Cache-Control','no-store,private');
 if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({error:'Method not allowed.'});}
 try{
  const staff=await s.requireStaff(req);
  const day=String(req.query?.date||'');
  return res.status(200).json({
   barber:s.publicUser(staff),date:day,
   square_connected:s.squareReady(),
   calls_connected:s.callsReady(),
   appointments:await s.appointments(staff,day)
  });
 }catch(e){return res.status(e.status||503).json({error:e.status?e.message:'Appointments unavailable.'});}
};