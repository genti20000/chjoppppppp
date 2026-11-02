'use strict';
const {confirm}=require('../../lib/square-any');
module.exports=async function(req,res){
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json({error:'Method not allowed'});}
 const b=typeof req.body==='object'&&req.body?req.body:{};
 try{
   if(JSON.stringify(b).length>20000)return res.status(413).json({error:'Request too large.'});
   const booking=await confirm(b);
   return res.status(201).json({booking});
 }catch(e){return res.status(e.status||500).json({error:e.status?e.message:'Could not confirm the booking. If you submitted it, check with the barbershop before trying again.'});}
};