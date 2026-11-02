(function () {
  'use strict';

  // Public booking links published on the Choppers Barbers website.
  const SQUARE_ANY = '/any';
  const SQUARE_LINKS = {
    liri: 'https://squareup.com/appointments/book/5b02w9466dexxu/LDBX5380WHX98/services',
    marouan: 'https://squareup.com/appointments/book/ycy9pbpbxlrgy8/LDBX5380WHX98/services',
    nick: 'https://squareup.com/appointments/book/yqs1tx0qnxicha/LDBX5380WHX98/services',
    victor: 'https://book.squareup.com/appointments/cqxqe8k9vaad1m/location/LDBX5380WHX98/services'
  };
  const SATURDAY_ANY = 'https://choppersbarbers.simplybook.it/';
  const SATURDAY_LINKS = {
    liri: 'https://choppersbarbers.simplybook.it/v2/#book/provider/4',
    marouan: 'https://choppersbarbers.simplybook.it/v2/#book/provider/5',
    nick: 'https://choppersbarbers.simplybook.it/v2/#book/provider/10',
    victor: 'https://choppersbarbers.simplybook.it/v2/#book/provider/3'
  };
  // Request larger source images so the new 88px portraits stay sharp on Retina displays.
  const PHOTOS = {
    liri: 'https://appointments-production-f.squarecdn.com/files/6adcc9b2ad67b0186d53b9be7c11b2fc/original.jpeg?width=220&height=220&fit=crop&enable=upscale&dpr=1',
    marouan: 'https://appointments-production-f.squarecdn.com/files/a6288951b027ad148eddd138992068ad/original.jpeg?width=220&height=220&fit=crop&enable=upscale&dpr=1',
    nick: 'https://appointments-production-f.squarecdn.com/files/09502eb1799cdfb52bfc55e151be1627/original.jpg?width=220&height=220&fit=crop&enable=upscale&dpr=1',
    victor: 'https://appointments-production-f.squarecdn.com/files/95e5fff5e23e446a637a6ca0108d1231/original.jpg?width=220&height=220&fit=crop&enable=upscale&dpr=1'
  };
  const NAMES = {liri:'Liri', marouan:'Marouan', nick:'Nick', victor:'Victor'};
  const DEFAULT_ORDER = ['liri','marouan','nick','victor'];
  const list = document.getElementById('barber-list');
  let settings = {order:DEFAULT_ORDER, links:SQUARE_LINKS};

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function closeAll() {
    for (const menu of list.querySelectorAll('.barber-book-menu:not([hidden])')) {
      menu.hidden = true;
      const card = menu.closest('.barber-row');
      card.classList.remove('is-open');
      const toggle = card.querySelector('.barber-book-toggle');
      toggle.setAttribute('aria-expanded','false');
    }
  }

  function bookingLink(label, sublabel, href, isInternal) {
    const link = el('a','barber-book-option');
    link.href = href;
    if (!isInternal) {
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
    }
    link.setAttribute('aria-label',label+' – '+sublabel);
    const body = el('span','barber-option-body');
    body.append(el('strong','',label),el('small','',sublabel));
    const arrow = el('span','barber-option-arrow','↗');
    arrow.setAttribute('aria-hidden','true');
    link.append(body,arrow);
    link.addEventListener('click',closeAll);
    return link;
  }

  function barberRow(id) {
    const any = id === 'any';
    const name = any ? 'Any Barber' : NAMES[id];
    const card = el('article','barber-row' + (any ? ' barber-row-any' : ''));
    card.dataset.barber = id;
    const main = el('div','barber-main');

    let portrait;
    if (any) {
      portrait = el('span','barber-portrait barber-portrait-any','✂');
      portrait.setAttribute('aria-hidden','true');
    } else {
      portrait = el('img','barber-portrait');
      portrait.src = PHOTOS[id];
      portrait.alt = name + ', Choppers barber';
      portrait.loading = 'lazy';
      portrait.decoding = 'async';
      portrait.width = 88;
      portrait.height = 88;
    }

    const details = el('div','barber-info');
    details.append(
      el('strong','barber-display-name',name),
      el('span','barber-description',any ? 'First available barber' : 'Choppers Barbers · London Bridge')
    );
    const toggle = el('button','barber-book-toggle');
    toggle.type = 'button';
    const menuId = 'book-menu-' + id;
    toggle.setAttribute('aria-controls',menuId);
    toggle.setAttribute('aria-expanded','false');
    toggle.setAttribute('aria-label','Book with '+name+' – choose a day');
    toggle.append(
      el('span','barber-toggle-label',any ? 'Book Any' : 'Book ' + name),
      el('span','barber-toggle-arrow','⌄')
    );
    toggle.querySelector('.barber-toggle-arrow').setAttribute('aria-hidden','true');
    main.append(portrait,details,toggle);

    const menu = el('div','barber-book-menu');
    menu.id = menuId;
    menu.hidden = true;
    menu.setAttribute('role','group');
    menu.setAttribute('aria-label','Book with '+name);

    const square = any ? SQUARE_ANY : ((settings.links && settings.links[id]) || SQUARE_LINKS[id]);
    const saturday = any ? SATURDAY_ANY : SATURDAY_LINKS[id];
    menu.append(
      bookingLink('Book Mon–Fri',any ? 'Square · Any available barber' : 'Square · '+name,square,any),
      bookingLink('Book Saturday',any ? 'SimplyBook · Any barber' : 'SimplyBook · '+name,saturday,false)
    );
    toggle.addEventListener('click',function() {
      const wasOpen = !menu.hidden;
      closeAll();
      if (!wasOpen) {
        menu.hidden = false;
        card.classList.add('is-open');
        toggle.setAttribute('aria-expanded','true');
      }
    });
    card.append(main,menu);
    return card;
  }

  function render() {
    closeAll();
    list.replaceChildren(barberRow('any'),...settings.order.map(barberRow));
  }

  document.addEventListener('click',function(event) {
    if (!event.target.closest('.barber-book-toggle') && !event.target.closest('.barber-book-menu')) {
      closeAll();
    }
  });
  document.addEventListener('keydown',function(event) {
    if (event.key === 'Escape') {
      const expanded = list.querySelector('.barber-book-toggle[aria-expanded="true"]');
      if (expanded) {
        closeAll();
        expanded.focus();
      }
    }
  });

  // Immediately render defaults so a slow config API doesn't leave an empty screen.
  render();
  fetch('/api/config',{cache:'no-store'})
    .then(function(response) {
      if (!response.ok) throw Error('Config unavailable');
      return response.json();
    })
    .then(function(config) {
      const order = config.order;
      if (Array.isArray(order) && order.length === DEFAULT_ORDER.length &&
          new Set(order).size === DEFAULT_ORDER.length &&
          DEFAULT_ORDER.every(function(id){return order.includes(id);})) {
        settings = {
          order:order,
          links:config.links && typeof config.links === 'object' ? config.links : SQUARE_LINKS
        };
        render();
      }
    })
    .catch(function(){ /* Use the verified public links and default display order. */ });
})();