(function(){
'use strict';
const locked=document.getElementById('owner-locked');
const content=document.getElementById('owner-content');
const list=document.getElementById('owner-list');
const msg=document.getElementById('owner-message');
const secret=document.getElementById('owner-secret');
const pass=document.getElementById('one-time-password');
const form=document.getElementById('create-staff');
async function api(path,options){
 const r=await fetch(path,{cache:'no-store',...options});
 const data=await r.json().catch(()=>({}));
 if(!r.ok)throw Error(data.error||'Request failed.');
 return data;
}
function el(tag,cls,text){
 const n=document.createElement(tag);if(cls)n.className=cls;
 if(text!==undefined)n.textContent=text;return n;
}
function credentials(password){
 if(!password)return;
 pass.textContent=password;secret.hidden=false;
 secret.scrollIntoView({behavior:'smooth',block:'nearest'});
}
async function changeUser(barber_id,data){
 msg.textContent='Saving…';
 try{
  const r=await api('/api/staff/owner',{method:'PATCH',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({barber_id,...data})});
  msg.textContent='Staff account updated.';
  if(r.one_time_password)credentials(r.one_time_password);
  await load();
 }catch(e){msg.textContent=e.message;}
}
function row(u){
 const section=el('article','owner-staff-row');
 const header=el('div','owner-staff-header');
 const name=el('div','');
 name.append(el('strong','',u.display_name),el('small','',u.username+' · '+(u.active?'ACTIVE':'DISABLED')));
 header.append(name,el('span','owner-staff-pill',u.active?'Active':'Disabled'));
 const phone=el('label','staff-label','Registered staff mobile');
 const number=el('input','staff-input');number.type='tel';number.value=u.phone_e164;
 const save=el('button','owner-small-button','Save mobile');save.type='button';
 save.addEventListener('click',()=>changeUser(u.barber_id,{phone:number.value}));
 const rotate=el('button','owner-small-button','Reset password');rotate.type='button';
 rotate.addEventListener('click',()=>{if(confirm('Reset the password for '+u.display_name+'? This invalidates their old password.'))changeUser(u.barber_id,{reset_password:true});});
 const enable=el('button','owner-small-button '+(u.active?'owner-danger':''),u.active?'Disable login':'Enable login');
 enable.type='button';enable.addEventListener('click',()=>{if(confirm((u.active?'Disable':'Enable')+' '+u.display_name+'?'))changeUser(u.barber_id,{active:!u.active});});
 const tools=el('div','owner-staff-buttons');tools.append(save,rotate,enable);
 section.append(header,phone,number,tools);return section;
}
async function loadSetup(){
 const statuses=[
  ['staff_database_configured','setup-database'],
  ['square_credentials_configured','setup-square'],
  ['masked_calls_configured','setup-calls']
 ];
 try{
  const r=await api('/api/staff/setup');
  for(const [key,id] of statuses){
   const e=document.getElementById(id);
   const configured=!!r[key];
   e.textContent=configured?'Configured · not yet tested':'Not connected';
   e.className=configured?'owner-connected':'owner-not-connected';
  }
 }catch(e){
  for(const [,id] of statuses){
   const target=document.getElementById(id);
   target.textContent='Unable to check';
   target.className='owner-not-connected';
  }
 }
}
async function load(){
 try{
  const r=await api('/api/staff/owner');
  list.replaceChildren(...(r.users||[]).map(row));
  if(!r.users?.length)list.append(el('p','staff-empty','No accounts yet. Create a barber login below.'));
 }catch(e){msg.textContent=e.message;}
}
form.addEventListener('submit',async e=>{
 e.preventDefault();msg.textContent='Creating the staff account…';
 const button=form.querySelector('[type="submit"]');button.disabled=true;
 try{
  const r=await api('/api/staff/owner',{method:'POST',headers:{'Content-Type':'application/json'},
   body:JSON.stringify({
    barber_id:document.getElementById('new-barber').value,
    username:document.getElementById('new-username').value,
    phone:document.getElementById('new-phone').value
   })});
  msg.textContent='Staff account created. Copy the new password before leaving.';
  credentials(r.one_time_password);form.reset();await load();
 }catch(e){msg.textContent=e.message;}
 finally{button.disabled=false;}
});
document.getElementById('copy-password').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(pass.textContent);msg.textContent='Password copied.';}catch{msg.textContent='Select and copy the password manually.';}});
api('/api/auth').then(r=>{
 if(!r.authenticated){locked.hidden=false;return;}
 content.hidden=false;loadSetup();load();
}).catch(()=>{locked.hidden=false;});
})();