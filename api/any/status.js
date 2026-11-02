'use strict';
const {ready}=require('../../lib/square-any');
module.exports=async function(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({error:'Method not allowed'});}
  res.status(200).json({enabled:ready(),turnstile_site_key:ready()?process.env.TURNSTILE_SITE_KEY:null});
};