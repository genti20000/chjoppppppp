'use strict';
const s=require('../../lib/staff');
const c=require('../../lib/staff-calendar');
module.exports=async function(req,res){
 res.setHeader('Cache-Control','no-store,private');
 res.setHeader('X-Content-Type-Options','nosniff');
 if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({error:'Method not allowed.'});}
 try{
  const user=await s.requireStaff(req);
  return res.status(200).json(await c.detail(user,String(req.query?.id||'')));
 }catch(e){return res.status(e.status||503).json({error:e.status?e.message:'Unable to load appointment details.'});}
};