'use strict';
const {getServices}=require('../../lib/square-any');
module.exports=async function(req,res){
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({error:'Method not allowed'});}
 try{return res.status(200).json({services:await getServices()});}
 catch(e){return res.status(e.status||500).json({error:e.status?e.message:'Could not load services from Square.'});}
};