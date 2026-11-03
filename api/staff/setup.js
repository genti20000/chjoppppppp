'use strict';
const {authenticated}=require('../../lib/core');
const s=require('../../lib/staff');
module.exports=async function(req,res){
 res.setHeader('Cache-Control','private, no-store');
 res.setHeader('X-Robots-Tag','noindex, nofollow');
 if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({error:'Method not allowed.'});}
 if(!authenticated(req))return res.status(401).json({error:'Owner login required.'});
 return res.status(200).json({
   staff_database_configured:s.configReady(),
   square_credentials_configured:s.squareReady(),
   masked_calls_configured:s.callsReady(),
   owner_login_configured:true,
   note:'Configured only means the required environment variables are present, not that live connections have passed tests.'
 });
};