'use strict';
const s=require('../../lib/staff');
module.exports=async function(req,res){
 res.setHeader('Cache-Control','no-store,private');
 if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json({error:'Method not allowed.'});}
 try{
  s.requireOrigin(req);
  const user=await s.requireStaff(req);
  const id=req.body?.booking_id;
  const result=await s.callCustomer(user,id);
  return res.status(200).json(result);
 }catch(e){return res.status(e.status||503).json({error:e.status?e.message:'Unable to place a masked call.'});}
};