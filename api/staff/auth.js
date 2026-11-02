'use strict';
const crypto=require('node:crypto');
const s=require('../../lib/staff');
module.exports=async function(req,res){
 res.setHeader('Cache-Control','no-store,private');
 res.setHeader('X-Content-Type-Options','nosniff');
 if(req.method==='GET'){
  try{return res.status(200).json({authenticated:true,staff:s.publicUser(await s.requireStaff(req))});}
  catch{return res.status(200).json({authenticated:false,configured:s.configReady()});}
 }
 if(req.method==='DELETE'){
  try{s.requireOrigin(req);}catch(e){return res.status(e.status).json({error:e.message});}
  res.setHeader('Set-Cookie',s.cookie('',0));return res.status(200).json({ok:true});
 }
 if(req.method!=='POST'){res.setHeader('Allow','GET,POST,DELETE');return res.status(405).json({error:'Method not allowed.'});}
 try{
  s.requireOrigin(req);
  if(!s.configReady())throw s.err('Owner must configure the Choppers staff database first.',503);
  const data=req.body||{},username=s.validateUsername(data.username);
  const password=data.password;
  if(typeof password!=='string'||password.length>200)throw s.err('Wrong username or password.',401);
  const ip=String(req.headers['x-forwarded-for']||req.headers['x-real-ip']||'unknown').split(',')[0].trim();
  const key=process.env.SESSION_SECRET;
  const makeKey=v=>crypto.createHmac('sha256',key).update(v).digest('hex').slice(0,48);
  const allowIP=await s.db('rpc/choppers_staff_allow_login','POST',{p_key:'i:'+makeKey(ip),p_limit:20});
  const allowUser=await s.db('rpc/choppers_staff_allow_login','POST',{p_key:'u:'+makeKey(username),p_limit:10});
  if(!allowIP||!allowUser)throw s.err('Too many login attempts. Try again later or contact the owner.',429);
  const user=await s.findByUsername(username);
  if(!user?.active||!s.checkPassword(password,user.password_hash))throw s.err('Wrong username or password.',401);
  res.setHeader('Set-Cookie',s.cookie(s.signSession(user),8*60*60));
  return res.status(200).json({authenticated:true,staff:s.publicUser(user)});
 }catch(e){return res.status(e.status||503).json({error:e.status?e.message:'Could not sign in at the moment.'});}
};