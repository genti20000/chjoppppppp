'use strict';
const {validLogin,cookieValue,cookieOptions,authenticated,adminReady} = require('../lib/core');
module.exports=async function handler(req,res) {
 res.setHeader('Cache-Control','private, no-store, max-age=0');
 if(req.method==='GET')return res.status(200).json({authenticated:authenticated(req),configured:adminReady()});
 if(req.method==='DELETE'){res.setHeader('Set-Cookie',cookieOptions('',0));return res.status(200).json({ok:true});}
 if(req.method==='POST'){
  if(!adminReady())return res.status(503).json({error:'Owner login is not configured. Set ADMIN_PASSWORD and SESSION_SECRET in Vercel.'});
  const body=typeof req.body==='string'?JSON.parse(req.body):req.body;
  const password=body?.password;
  if(typeof password!=='string'||password.length>200||!validLogin(password))return res.status(401).json({error:'Incorrect password.'});
  res.setHeader('Set-Cookie',cookieOptions(cookieValue(),43200));
  return res.status(200).json({ok:true});
 }
 res.setHeader('Allow','GET, POST, DELETE');return res.status(405).json({error:'Method not allowed.'});
};