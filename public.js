(function () {
  'use strict';
  const BASE = 'https://book.squareup.com/appointments/zqexq32vqp1hkn/location/LDBX5380WHX98/services';
  const PHOTOS = {
    liri: 'https://appointments-production-f.squarecdn.com/files/6adcc9b2ad67b0186d53b9be7c11b2fc/original.jpeg?width=60&height=60&fit=crop&enable=upscale&dpr=1',
    marouan: 'https://appointments-production-f.squarecdn.com/files/a6288951b027ad148eddd138992068ad/original.jpeg?width=60&height=60&fit=crop&enable=upscale&dpr=1',
    nick: 'https://appointments-production-f.squarecdn.com/files/09502eb1799cdfb52bfc55e151be1627/original.jpg?width=60&height=60&fit=crop&enable=upscale&dpr=1',
    victor: 'https://appointments-production-f.squarecdn.com/files/95e5fff5e23e446a637a6ca0108d1231/original.jpg?width=60&height=60&fit=crop&enable=upscale&dpr=1'
  };
  const SQUARE_LINKS = {
  "liri": "https://squareup.com/appointments/book/5b02w9466dexxu/LDBX5380WHX98/services",
  "marouan": "https://squareup.com/appointments/book/ycy9pbpbxlrgy8/LDBX5380WHX98/services",
  "nick": "https://squareup.com/appointments/book/yqs1tx0qnxicha/LDBX5380WHX98/services",
  "victor": "https://book.squareup.com/appointments/cqxqe8k9vaad1m/location/LDBX5380WHX98/services"
};
  const SATURDAY_LINKS = {
  "liri": "https://choppersbarbers.simplybook.it/v2/#book/provider/4",
  "marouan": "https://choppersbarbers.simplybook.it/v2/#book/provider/5",
  "nick": "https://choppersbarbers.simplybook.it/v2/#book/provider/10",
  "victor": "https://choppersbarbers.simplybook.it/v2/#book/provider/3"
};
  const SATURDAY_ANY = 'https://choppersbarbers.simplybook.it/';
  const DEFAULT = {order: ['liri','marouan','nick','victor'], links: SQUARE_LINKS};
  const NAMES = {liri:'Liri',marouan:'Marouan ⚽',nick:'Nick',victor:'Victor'};
  let settings = DEFAULT, selected = 'any';
  const list = document.getElementById('barber-list');
  const button = document.getElementById('book-button');
  const saturdayButton = document.getElementById('saturday-button');
  const hint = document.getElementById('booking-hint');
  function choose(id) { selected = id; render(); }
  function row(id) {
    const isAny = id === 'any', name = isAny ? 'Any Barber' : NAMES[id], element = document.createElement('button');
    element.type = 'button'; element.className = 'staff-row' + (selected === id ? ' selected' : '');
    element.setAttribute('role','radio'); element.setAttribute('aria-checked', String(selected === id));
    const avatar = isAny ? document.createElement('span') : document.createElement('img');
    if (isAny) {avatar.className='any-avatar';avatar.textContent='♧';avatar.setAttribute('aria-hidden','true');}
    else {avatar.className='avatar';avatar.src=PHOTOS[id];avatar.alt='';avatar.loading='lazy';}
    const copy=document.createElement('span');copy.className='staff-copy';
    const strong=document.createElement('span');strong.className='staff-name';strong.textContent=name;
    const sub=document.createElement('span');sub.className='staff-detail';sub.textContent=isAny?'First available appointment':'Book with '+name;
    const radio=document.createElement('span');radio.className='radio';radio.setAttribute('aria-hidden','true');
    copy.append(strong,sub); element.append(avatar,copy,radio);
    element.addEventListener('click',function(){choose(id);});
    return element;
  }
  function render() {
    list.replaceChildren(row('any'), ...settings.order.map(row));
    const name=selected==='any'?'Any Barber':NAMES[selected];
    button.replaceChildren(document.createTextNode('Book with '+name+' '));
    const arrow=document.createElement('span');arrow.textContent='↗';arrow.setAttribute('aria-hidden','true');button.append(arrow);
    const direct = selected==='any' ? BASE : ((settings.links && settings.links[selected]) || SQUARE_LINKS[selected]);
    button.href=direct;
    button.target='_blank';button.rel='noopener noreferrer';
    saturdayButton.href = selected==='any' ? SATURDAY_ANY : SATURDAY_LINKS[selected];
    saturdayButton.textContent = selected==='any' ? 'Book Saturday · Any Barber ↗' : 'Book Saturday · '+name+' ↗';
    hint.textContent=selected==='any'?'Choose any available barber. Weekday bookings use Square; Saturdays use SimplyBook.':'Weekdays: book '+name+' through Square. Saturday: use the separate SimplyBook link.';
  }
  fetch('/api/config',{cache:'no-store'}).then(function(r){if(!r.ok)throw Error('Config');return r.json();})
    .then(function(c){if(Array.isArray(c.order)&&c.order.length===4) settings=c;render();})
    .catch(function(){render();});
})();