'use strict';
const s=require('../../lib/staff');
const c=require('../../lib/staff-calendar');
module.exports=async function(req,res){
 res.setHeader('Cache-Control','no-store,private');
 res.setHeader('X-Content-Type-Options','nosniff');
 if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({error:'Method not allowed.'});}
 try{
  const user=await s.requireStaff(req);
  const result=await c.calendar(user,String(req.query?.start||''),String(req.query?.end||''),
    String(req.query?.barber||user.barber_id));
  return res.status(200).json(result);
 }catch(e){return res.status(e.status||503).json({error:e.status?e.message:'Unable to load calendar.'});}
};