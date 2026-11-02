'use strict';
const {slots}=require('../../lib/square-any');
module.exports=async function(req,res){
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json({error:'Method not allowed'});}
 const b=typeof req.body==='object'&&req.body?req.body:{};
 try{
   if(JSON.stringify(b).length>2000)return res.status(413).json({error:'Request too large.'});
   return res.status(200).json({slots:await slots(b.service_id,b.date)});
 }catch(e){return res.status(e.status||500).json({error:e.status?e.message:'Could not search available times.'});}
};