(function () {
  'use strict';
  const IDS=['liri','marouan','nick','victor'];
  const NAMES={liri:'Liri',marouan:'Marouan ⚽',nick:'Nick',victor:'Victor'};
  const PHOTOS={
    liri:'https://appointments-production-f.squarecdn.com/files/6adcc9b2ad67b0186d53b9be7c11b2fc/original.jpeg?width=60&height=60&fit=crop&enable=upscale&dpr=1',
    marouan:'https://appointments-production-f.squarecdn.com/files/a6288951b027ad148eddd138992068ad/original.jpeg?width=60&height=60&fit=crop&enable=upscale&dpr=1',
    nick:'https://appointments-production-f.squarecdn.com/files/09502eb1799cdfb52bfc55e151be1627/original.jpg?width=60&height=60&fit=crop&enable=upscale&dpr=1',
    victor:'https://appointments-production-f.squarecdn.com/files/95e5fff5e23e446a637a6ca0108d1231/original.jpg?width=60&height=60&fit=crop&enable=upscale&dpr=1'
  };
  let data={order:IDS.slice(),links:{}},dragged=null;
  const list=document.getElementById('editor-list'), message=document.getElementById('message'), editor=document.getElementById('editor-panel'), login=document.getElementById('login-panel');
  function tell(text){message.textContent=text;}
  async function api(url,opts){const r=await fetch(url,opts);const j=await r.json().catch(function(){return {};});if(!r.ok)throw Error(j.error || ('Server error '+r.status));return j;}
  function row(id,index){
    const el=document.createElement('div');el.className='editor-row';el.draggable=true;el.dataset.id=id;
    const top=document.createElement('div');top.className='editor-top';
    const drag=document.createElement('span');drag.className='drag-handle';drag.textContent='⠿';drag.title='Drag to reorder';
    const img=document.createElement('img');img.className='avatar';img.src=PHOTOS[id];img.alt='';
    const name=document.createElement('b');name.textContent=(index+1)+'. '+NAMES[id];
    const controls=document.createElement('div');controls.className='order-controls';
    [-1,1].forEach(function(n){const b=document.createElement('button');b.textContent=n<0?'↑':'↓';b.type='button';b.disabled=(n<0&&index===0)||(n>0&&index===data.order.length-1);b.title=n<0?'Move up':'Move down';b.addEventListener('click',function(){const i=data.order.indexOf(id);const other=i+n; if(other<0||other>=data.order.length)return;data.order.splice(i,1);data.order.splice(other,0,id);paint();});controls.append(b);});
    top.append(drag,img,name,controls);
    const wrap=document.createElement('label');wrap.className='url-wrap';
    const lab=document.createElement('span');lab.className='field-label';lab.textContent='Square booking URL for '+NAMES[id];wrap.append(lab);
    const input=document.createElement('input');input.className='url-input';input.type='url';input.placeholder='https://book.squareup.com/... (optional)';input.value=data.links[id]||'';input.autocomplete='off';input.addEventListener('input',function(){data.links[id]=input.value.trim();});wrap.append(input);
    const small=document.createElement('small');small.textContent='Leave blank to use the general Square page (customer will select this barber again).';wrap.append(small);
    el.append(top,wrap);
    el.addEventListener('dragstart',function(e){dragged=id;e.dataTransfer.effectAllowed='move';el.classList.add('dragging');});
    el.addEventListener('dragend',function(){dragged=null;el.classList.remove('dragging');document.querySelectorAll('.drop-target').forEach(function(n){n.classList.remove('drop-target');});});
    el.addEventListener('dragover',function(e){e.preventDefault();el.classList.add('drop-target');});
    el.addEventListener('dragleave',function(){el.classList.remove('drop-target');});
    el.addEventListener('drop',function(e){e.preventDefault();if(dragged&&dragged!==id){data.order=data.order.filter(function(x){return x!==dragged;});data.order.splice(data.order.indexOf(id),0,dragged);paint();}});
    return el;
  }
  function paint(){list.replaceChildren(...data.order.map(row));}
  async function load(){const config=await api('/api/config');data.order=Array.isArray(config.order)?config.order:IDS.slice();data.links=config.links||{};paint();document.getElementById('storage-warning').hidden=!!config.storageReady;}
  async function session(){try{const s=await api('/api/auth');if(s.authenticated){login.hidden=true;editor.hidden=false;await load();}else{login.hidden=false;editor.hidden=true;}}catch(e){tell(e.message);}}
  document.getElementById('login-form').addEventListener('submit',async function(e){e.preventDefault();tell('');try{await api('/api/auth',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:document.getElementById('password').value})});document.getElementById('password').value='';await session();}catch(err){tell(err.message);}});
  document.getElementById('logout').addEventListener('click',async function(){await api('/api/auth',{method:'DELETE'});await session();tell('Signed out.');});
  document.getElementById('save').addEventListener('click',async function(){tell('Saving…');try{await api('/api/config',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});tell('Saved! The public booking page now uses this order.');}catch(e){tell(e.message);}});
  session();
})();