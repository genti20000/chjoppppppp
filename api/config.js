'use strict';
const {readConfig,writeConfig,authenticated} = require('../lib/core');
module.exports=async function handler(req,res) {
 res.setHeader('Cache-Control','private, no-store, max-age=0');
 if(req.method==='GET') {
  try {return res.status(200).json(await readConfig());}
  catch(e){console.error('config read:',e.message);return res.status(503).json({error:'Booking configuration temporarily unavailable.'});}
 }
 if(req.method==='PUT') {
  if(!authenticated(req))return res.status(401).json({error:'Sign in as owner to save changes.'});
  try {const data=await writeConfig(typeof req.body==='string'?JSON.parse(req.body):req.body);return res.status(200).json({ok:true,...data});}
  catch(e){return res.status(/Invalid|Only secure|complete https|too long|links|order|text/.test(e.message)?400:503).json({error:e.message});}
 }
 res.setHeader('Allow','GET, PUT');return res.status(405).json({error:'Method not allowed.'});
};