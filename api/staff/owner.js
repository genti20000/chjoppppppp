'use strict';
const crypto=require('node:crypto');
const {authenticated}=require('../../lib/core');
const s=require('../../lib/staff');
const COLUMNS='id,barber_id,display_name,username,phone_e164,active,created_at';
function randomPassword(){return crypto.randomBytes(19).toString('base64url');}
function clean(user){return user?{id:user.id,barber_id:user.barber_id,display_name:user.display_name,username:user.username,phone_e164:user.phone_e164,active:user.active}:null;}
module.exports=async function(req,res){
 res.setHeader('Cache-Control','no-store,private');
 if(!authenticated(req))return res.status(401).json({error:'Owner login required. Sign in through /admin first.'});
 try{
  if(req.method==='GET'){
   const users=await s.db('choppers_staff_users?select='+COLUMNS+'&order=display_name.asc');
   return res.status(200).json({configured:s.configReady(),users:(users||[]).map(clean)});
  }
  if(!['POST','PATCH'].includes(req.method)){
   res.setHeader('Allow','GET,POST,PATCH');
   return res.status(405).json({error:'Method not allowed.'});
  }
  s.requireOrigin(req);
  const body=req.body||{};
  if(req.method==='POST'){
   if(!s.IDS.includes(body.barber_id))throw s.err('Choose one of the four Choppers barbers.');
   const barber_id=body.barber_id,username=s.validateUsername(body.username);
   const phone_e164=s.phone(body.phone);
   const existing=await s.db('choppers_staff_users?barber_id=eq.'+barber_id+'&select=id');
   if(existing?.length)throw s.err('A staff account already exists for this barber. Update it rather than creating another.',409);
   const password=randomPassword();
   const users=await s.db('choppers_staff_users','POST',{
    barber_id,display_name:s.NAMES[barber_id],username,phone_e164,
    password_hash:s.hashPassword(password),active:true
   });
   return res.status(201).json({user:clean(users?.[0]),one_time_password:password});
  }
  const barber_id=body.barber_id;
  if(!s.IDS.includes(barber_id))throw s.err('Invalid barber.');
  const changed={updated_at:new Date().toISOString()};
  if(Object.prototype.hasOwnProperty.call(body,'active')){
   if(typeof body.active!=='boolean')throw s.err('Active must be a boolean.');
   changed.active=body.active;
  }
  if(Object.prototype.hasOwnProperty.call(body,'phone'))changed.phone_e164=s.phone(body.phone);
  if(Object.prototype.hasOwnProperty.call(body,'username'))changed.username=s.validateUsername(body.username);
  let password;
  if(body.reset_password===true){password=randomPassword();changed.password_hash=s.hashPassword(password);}
  const users=await s.db('choppers_staff_users?barber_id=eq.'+barber_id,'PATCH',changed,{Prefer:'return=representation'});
  if(!users?.length)throw s.err('Staff account not found.',404);
  return res.status(200).json({user:clean(users[0]),...(password?{one_time_password:password}:{})});
 }catch(e){
  return res.status(e.status||503).json({error:e.status?e.message:'Owner staff management is unavailable.'});
 }
};