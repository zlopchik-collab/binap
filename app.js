(function(){
  var C = window.SITE_CONFIG || {};
  var L = C.LINKS || {};
  var store = {
    get:function(k){ try{return localStorage.getItem(k)}catch(e){return null} },
    set:function(k,v){ try{localStorage.setItem(k,v)}catch(e){} }
  };
  function $$(s,r){ return Array.prototype.slice.call((r||document).querySelectorAll(s)); }

  /* Ссылки на каналы */
  $$('[data-link]').forEach(function(a){
    var u = L[a.getAttribute('data-link')];
    var real = /^https?:/.test(a.getAttribute('href') || '');   // сборщик уже вписал настоящую ссылку — не трогаем
    if(u){ a.href = u; }
    if(u || real){ a.target = '_blank'; a.rel = 'noopener'; }
    else { a.href = (document.body.getAttribute('data-root')||'') + 'podpiska.html'; a.title = 'Канал скоро появится'; }
  });

  /* Формы подписки на рассылку */
  $$('form.form').forEach(function(f){
    var note = f.querySelector('.note');
    var email = f.querySelector('input[type=email]');
    if(email && C.EMAIL_FIELD_NAME) email.name = C.EMAIL_FIELD_NAME;
    if(C.EMAIL_FORM_ACTION){ f.action = C.EMAIL_FORM_ACTION; f.method = 'post'; }
    f.addEventListener('submit', function(e){
      var ok = f.querySelector('.consent input');
      if(ok && !ok.checked){ e.preventDefault(); note.textContent='Отметьте согласие на обработку данных, чтобы подписаться.'; note.className='note'; return; }
      if(!C.EMAIL_FORM_ACTION){
        e.preventDefault();
        note.textContent='Рассылка запускается. Пока подпишитесь на канал — там те же новости каждое утро.';
        note.className='note'; return;
      }
      store.set('bnp_sub','1');
    });
  });

  /* Партнёрские ссылки с маркировкой */
  $$('a.offer').forEach(function(a){
    var o = (C.OFFERS||{})[a.getAttribute('data-offer')];
    if(o && o.url && o.erid){   // без erid рекламу не показываем: маркировка обязательна
      a.href = o.url; a.target='_blank'; a.rel='sponsored noopener'; a.textContent = o.label || a.textContent;
      if(o.advertiser || o.erid){
        var m = document.createElement('small'); m.className='admark';
        m.textContent = 'Реклама' + (o.advertiser ? '. ' + o.advertiser : '') + (o.erid ? (o.advertiser ? ', ' : '. ') + 'erid: ' + o.erid : '');
        a.parentNode.insertBefore(m, a.nextSibling);
      }
    } else {
      // Оффера пока нет: короткий абзац с партнёрской ссылкой прячем целиком, в длинном убираем только ссылку
      var p = a.closest('p, li');
      if(p && p.textContent.length < 160) p.style.display = 'none'; else a.remove();
    }
  });

  /* Подсказки на графиках: наведение мышью или касание */
  $$('.chart-plot').forEach(function(plot){
    var tip = plot.querySelector('.chart-tip'), svg = plot.querySelector('svg');
    function show(el){
      var r = el.getBoundingClientRect(), pr = plot.getBoundingClientRect();
      tip.textContent = el.getAttribute('data-tip'); tip.hidden = false;
      var x = r.left + r.width/2 - pr.left;
      x = Math.max(tip.offsetWidth/2, Math.min(pr.width - tip.offsetWidth/2, x));
      tip.style.left = x + 'px'; tip.style.top = (r.top - pr.top + 12) + 'px';
    }
    $$('[data-tip]', svg).forEach(function(el){
      el.addEventListener('mouseenter', function(){ show(el); });
      el.addEventListener('click', function(){ show(el); });
    });
    plot.addEventListener('mouseleave', function(){ tip.hidden = true; });
  });

  /* Видео: плеер загружается только по нажатию */
  $$('.video-play').forEach(function(b){
    b.addEventListener('click', function(){
      var f = document.createElement('iframe');
      f.src = b.getAttribute('data-src') + (b.getAttribute('data-src').indexOf('?') < 0 ? '?' : '&') + 'autoplay=1';
      f.allow = 'autoplay; encrypted-media; fullscreen; picture-in-picture';
      f.allowFullscreen = true; f.title = b.getAttribute('aria-label');
      b.replaceWith(f);
    });
  });

  /* Сроки для ИП */
  var dl = document.getElementById('deadlines-list');
  if(dl && C.DEADLINES){
    var today = new Date(); today.setHours(0,0,0,0);
    var items = C.DEADLINES.filter(function(d){ return new Date(d.date+'T00:00:00') >= today; }).slice(0,3);
    if(!items.length){ dl.closest('.deadlines').hidden = true; }
    items.forEach(function(d){
      var p = d.date.split('-'), li = document.createElement('li');
      var t = document.createElement('time'); t.dateTime = d.date; t.textContent = p[2]+'.'+p[1]+'.'+p[0];
      var div = document.createElement('div'); div.textContent = d.title;
      var sm = document.createElement('small'); sm.textContent = d.who; div.appendChild(sm);
      li.appendChild(t); li.appendChild(div); dl.appendChild(li);
    });
  }

  /* Push-уведомления */
  $$('[data-push]').forEach(function(b){ b.hidden = !C.PUSH_SCRIPT_URL; });
  if(C.PUSH_SCRIPT_URL){ var s=document.createElement('script'); s.src=C.PUSH_SCRIPT_URL; s.async=true; document.head.appendChild(s); }

  /* Собственный счётчик: без cookie, без IP, без идентификаторов. Передаём только страницу,
     источник перехода (домен), тип устройства и признак первого просмотра в сессии. */
  if(C.COUNTER_URL && navigator.sendBeacon){
    var ses = false; try{ ses = !sessionStorage.getItem('bnp_v'); sessionStorage.setItem('bnp_v','1'); }catch(e){}
    var ref = ''; try{ var rh = document.referrer ? new URL(document.referrer).hostname : ''; if(rh && rh !== location.hostname) ref = rh; }catch(e){}
    var u = new URLSearchParams(location.search).get('utm_source') || '';
    navigator.sendBeacon(C.COUNTER_URL, JSON.stringify({ p: location.pathname, r: u ? 'utm:' + u : ref,
      d: /Mobi|Android|iPhone/i.test(navigator.userAgent) ? 'm' : 'd', v: ses ? 1 : 0 }));
  }

  /* Cookie и аналитика: счётчики грузим только после согласия (152-ФЗ) */
  function loadCounters(){
    var c = window.BNP_CNT || {}, d = document;
    if(c.metrika){
      window.ym = window.ym || function(){ (window.ym.a = window.ym.a || []).push(arguments); }; window.ym.l = 1*new Date();
      var m = d.createElement('script'); m.async = true; m.src = 'https://mc.yandex.ru/metrika/tag.js'; d.head.appendChild(m);
      window.ym(+c.metrika, 'init', {clickmap:true, trackLinks:true, accurateTrackBounce:true, webvisor:true});
    }
    if(c.topmail){
      var _tmr = window._tmr || (window._tmr = []); _tmr.push({id:String(c.topmail), type:'pageView', start:(new Date()).getTime()});
      var t = d.createElement('script'); t.async = true; t.id = 'tmr-code'; t.src = 'https://top-fwz1.mail.ru/js/code.js'; d.head.appendChild(t);
    }
  }
  var cookie = document.getElementById('cookie'), choice = store.get('bnp_cookie');
  if(choice === 'yes') loadCounters();
  function decide(v){
    store.set('bnp_cookie', v); if(cookie) cookie.hidden = true;
    if(v === 'yes') loadCounters();
    var st = document.getElementById('stick'); if(st && st.dataset.wait){ st.hidden = false; delete st.dataset.wait; }
  }
  if(cookie){
    if(!choice) cookie.hidden = false;
    var y = document.getElementById('cookie-yes'), n = document.getElementById('cookie-no');
    if(y) y.addEventListener('click', function(){ decide('yes'); });
    if(n) n.addEventListener('click', function(){ decide('no'); });
  }
  var cr = document.getElementById('cookie-reset');
  if(cr) cr.addEventListener('click', function(){
    // Отзыв согласия: убираем выбор и перезагружаем страницу, чтобы счётчики не работали
    store.set('bnp_cookie', ''); location.reload();
  });

  /* Нижняя плашка «каждое утро в MAX» */
  var stick = document.getElementById('stick');
  if(stick){
    var hideUntil = +store.get('bnp_stick') || 0;
    if(Date.now() < hideUntil || store.get('bnp_sub')) stick.hidden = true;
    else if(cookie && !cookie.hidden){ stick.hidden = true; stick.dataset.wait = '1'; }
    var x = stick.querySelector('.x');
    if(x) x.addEventListener('click', function(){ stick.hidden = true; store.set('bnp_stick', String(Date.now()+3*864e5)); });
  }

  /* Всплывающее предложение на статьях: после 55% прочтения, не чаще раза в неделю */
  var modal = document.getElementById('modal');
  if(modal && document.body.classList.contains('is-article')){
    var shown = false, last = +store.get('bnp_modal') || 0;
    function maybe(){
      if(shown || Date.now()-last < 7*864e5 || store.get('bnp_sub')) return;
      var h = document.documentElement, p = (h.scrollTop+innerHeight)/h.scrollHeight;
      if(p > .55){ shown = true; modal.hidden = false; store.set('bnp_modal', String(Date.now())); }
    }
    addEventListener('scroll', maybe, {passive:true});
    function close(){ modal.hidden = true; }
    modal.addEventListener('click', function(e){ if(e.target===modal || e.target.classList.contains('close')) close(); });
    addEventListener('keydown', function(e){ if(e.key==='Escape') close(); });
  }

  /* Калькулятор УСН */
  var calc = document.getElementById('calc');
  if(calc){
    var fmt = function(n){ return Math.round(n).toLocaleString('ru-RU') + ' ₽'; };
    var num = function(id){ var v = String(document.getElementById(id).value).replace(/\s/g,'').replace(',','.'); return +v || 0; };
    function run(){
      var D = num('c-inc'), R = num('c-exp'), rd = num('c-rd')/100, rr = num('c-rr')/100;
      var staff = document.getElementById('c-staff').value === 'yes';
      var fixed = num('c-fix');
      var V = fixed + Math.min(Math.max(0, D-300000)*0.01, 321818);
      var taxD = D*rd, cut = staff ? Math.min(V, taxD*0.5) : Math.min(V, taxD);
      var outD = Math.max(0, taxD-cut);
      var base = Math.max(0, D-R-V), outR = Math.max(base*rr, D*0.01);
      var minApplied = D*0.01 > base*rr;
      document.getElementById('r-v').textContent = fmt(V);
      document.getElementById('r-d').textContent = fmt(outD);
      document.getElementById('r-r').textContent = fmt(outR);
      document.getElementById('l-d').classList.toggle('win', outD <= outR);
      document.getElementById('l-r').classList.toggle('win', outR < outD);
      var diff = Math.abs(outD-outR), share = D ? Math.round(R/D*100) : 0;
      document.getElementById('verdict').textContent =
        (outD <= outR ? '«Доходы» выгоднее на ' : '«Доходы минус расходы» выгоднее на ') + fmt(diff) +
        ' в год. Расходы — ' + share + '% от дохода.' + (minApplied ? ' На «доходах минус расходы» сработал минимальный налог 1% от дохода.' : '');
      document.getElementById('nds').hidden = D <= 20000000;
    }
    $$('#calc input, #calc select').forEach(function(i){ i.addEventListener('input', run); });
    run();
  }
  /* Калькулятор взносов ИП */
  var cv = document.getElementById('calc-v');
  if(cv){
    var Y = {2026:{fix:57390, cap:321818}, 2027:{fix:61154, cap:342923}};
    var fmtv = function(n){ return (Math.round(n*100)/100).toLocaleString('ru-RU', {maximumFractionDigits:2}) + ' ₽'; };
    var val = function(id){ var v = String(document.getElementById(id).value).replace(/\s/g,'').replace(',','.'); return +v || 0; };
    function runv(){
      var y = +document.getElementById('v-year').value, mode = document.getElementById('v-mode').value;
      var inc = val('v-inc'), exp = val('v-exp');
      document.getElementById('v-exp-f').hidden = !(mode === 'dr' || mode === 'osno');
      document.getElementById('v-exp-l').textContent = mode === 'osno' ? 'Профессиональные вычеты (расходы), ₽' : 'Расходы за год, ₽';
      document.getElementById('v-inc-l').textContent = mode === 'psn' ? 'Потенциальный доход по патенту за год, ₽' : 'Доход за год, ₽';
      var share = 1, reg = document.getElementById('v-reg').value;
      if(reg){
        var d = new Date(reg + 'T00:00:00');
        if(d.getFullYear() === y){
          var m = d.getMonth(), dim = new Date(y, m+1, 0).getDate();
          share = ((11 - m) + (dim - d.getDate() + 1)/dim) / 12;
        } else if(d.getFullYear() > y){ share = 0; }
      }
      var fix = 0, one = 0;
      if(mode !== 'ausn'){
        fix = Math.round(Y[y].fix * share * 100) / 100;
        var base = (mode === 'dr' || mode === 'osno') ? Math.max(0, inc - exp) : inc;
        one = Math.min(Math.max(0, base - 300000) * 0.01, Y[y].cap);
      }
      document.getElementById('v-fix').textContent = fmtv(fix);
      document.getElementById('v-one').textContent = fmtv(one);
      document.getElementById('v-all').textContent = fmtv(fix + one);
      document.getElementById('v-when').textContent = mode === 'ausn'
        ? 'На АУСН взносы за себя не платят.'
        : 'Фиксированные — до 28 декабря ' + y + ' года' + (one > 0 ? ', 1% — до 1 июля ' + (y+1) + ' года.' : '. 1% платить не нужно: доход не больше 300 000 ₽.') + (share < 1 ? ' Фиксированные уменьшены пропорционально дате регистрации.' : '');
    }
    $$('#calc-v input, #calc-v select').forEach(function(i){ i.addEventListener('input', runv); i.addEventListener('change', runv); });
    runv();
  }

  /* Кнопки «Скопировать» у инструкций ИИ-агентов */
  $$('[data-copy]').forEach(function(b){
    b.addEventListener('click', function(){
      var el = document.getElementById(b.getAttribute('data-copy')); if(!el) return;
      var t = el.innerText, label = b.textContent;
      function ok(){ b.textContent = 'Скопировано'; b.classList.add('ok'); setTimeout(function(){ b.textContent = label; b.classList.remove('ok'); }, 2000); }
      function sel(){ var r = document.createRange(); r.selectNodeContents(el); var s = getSelection(); s.removeAllRanges(); s.addRange(r);
        var done = false; try{ done = document.execCommand('copy'); }catch(e){} if(done) ok(); else b.textContent = 'Текст выделен — скопируйте'; }
      if(navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(ok, sel); else sel();
    });
  });

  /* Меню «Все рубрики»: закрыть по клику вне меню и по Esc */
  $$('details.more').forEach(function(d){
    document.addEventListener('click', function(e){ if(d.open && !d.contains(e.target)) d.open = false; });
    document.addEventListener('keydown', function(e){ if(e.key === 'Escape' && d.open){ d.open = false; d.querySelector('summary').focus(); } });
  });

  /* Сторис на главной: лента кружков и просмотр по одной карточке */
  (function(){
    var box = document.querySelector('.stories'), raw = document.getElementById('st-data');
    if(!box || !raw) return;
    var all; try{ all = JSON.parse(raw.textContent); }catch(e){ return; }
    var list = box.querySelector('.st-list');
    var seen = (store.get('bnp_st_seen')||'').split(',').filter(Boolean);
    function admark(o){ return 'Реклама' + (o.advertiser ? '. ' + o.advertiser : '') + (o.erid ? ', erid: ' + o.erid : ''); }
    // Рекламная сторис — только если в config.js есть ссылка и erid
    $$('.st-i[data-offer]', box).forEach(function(b){
      var o = (C.OFFERS||{})[b.getAttribute('data-offer')];
      if(o && o.url && o.erid) b.parentNode.hidden = false;
    });
    var btns = $$('.st-i', box).filter(function(b){ return !b.parentNode.hidden; });
    var order = btns.map(function(b){ return +b.getAttribute('data-i'); });
    btns.forEach(function(b){ if(seen.indexOf(b.getAttribute('data-id')) > -1) b.classList.add('seen'); });

    // Стрелки на десктопе
    var arrows = $$('.st-arr', box);
    function upd(){ if(arrows.length < 2) return; arrows[0].disabled = list.scrollLeft < 4; arrows[1].disabled = list.scrollLeft + list.clientWidth >= list.scrollWidth - 4; }
    arrows.forEach(function(a){ a.addEventListener('click', function(){ list.scrollBy({left: +a.getAttribute('data-dir') * list.clientWidth * 0.8, behavior:'smooth'}); }); });
    list.addEventListener('scroll', upd, {passive:true}); window.addEventListener('resize', upd); upd();

    var DUR = 6000, sv = null, pos = 0, t0 = 0, left = DUR, raf = 0, paused = false, opener = null;
    function esc(s){ var d = document.createElement('div'); d.textContent = s == null ? '' : s; return d.innerHTML; }
    function markSeen(id){
      if(seen.indexOf(id) < 0){ seen.push(id); store.set('bnp_st_seen', seen.slice(-60).join(',')); }
      btns.forEach(function(b){ if(b.getAttribute('data-id') === id) b.classList.add('seen'); });
    }
    function render(){
      var it = all[order[pos]], o = it.ad ? (C.OFFERS||{})[it.ad] : null;
      var card = sv.querySelector('.sv-card');
      card.className = 'sv-card st-' + it.c;
      sv.querySelector('.sv-bars').innerHTML = order.map(function(_, i){ return '<i class="' + (i < pos ? 'done' : '') + '"><b></b></i>'; }).join('');
      sv.querySelector('.sv-rub').textContent = it.rub;
      sv.querySelector('.sv-body').innerHTML = '<div class="sv-big">' + esc(it.big) + '</div><h3 class="sv-title" id="sv-t">' + esc(it.title) + '</h3>' +
        (it.text ? '<p class="sv-text">' + esc(it.text) + '</p>' : '') + (it.todo ? '<div class="sv-todo"><b>Сделать</b>' + esc(it.todo) + '</div>' : '');
      var a = sv.querySelector('.sv-btn'); a.href = o ? o.url : it.href; a.textContent = it.btn + ' →';
      if(o){ a.target = '_blank'; a.rel = 'sponsored noopener'; } else { a.removeAttribute('target'); a.removeAttribute('rel'); }
      var m = sv.querySelector('.sv-ad'); m.hidden = !o; m.textContent = o ? admark(o) : '';
      markSeen(it.id); left = DUR; start();
    }
    function bar(){ return sv && sv.querySelectorAll('.sv-bars i b')[pos]; }
    function tick(now){
      if(!sv || paused) return;
      var rest = left - (now - t0), b = bar();
      if(b) b.style.width = Math.min(100, (1 - rest / DUR) * 100) + '%';
      if(rest <= 0) return go(1);
      raf = requestAnimationFrame(tick);
    }
    function start(){ cancelAnimationFrame(raf); paused = false; t0 = performance.now(); raf = requestAnimationFrame(tick); }
    function pause(){ if(paused) return; paused = true; cancelAnimationFrame(raf); left -= performance.now() - t0; }
    function resume(){ if(!paused || !sv) return; paused = false; t0 = performance.now(); raf = requestAnimationFrame(tick); }
    function go(d){ var n = pos + d; if(n < 0) n = 0; if(n >= order.length) return close(); pos = n; render(); }
    function key(e){ if(e.key === 'Escape') close(); else if(e.key === 'ArrowRight') go(1); else if(e.key === 'ArrowLeft') go(-1); }
    function vis(){ if(sv){ if(document.hidden) pause(); else resume(); } }
    function close(){
      if(!sv) return; cancelAnimationFrame(raf); sv.parentNode.removeChild(sv); sv = null;
      document.documentElement.style.overflow = '';
      document.removeEventListener('keydown', key); document.removeEventListener('visibilitychange', vis);
      if(opener) opener.focus();
    }
    function open(i, from){
      opener = from; pos = Math.max(0, order.indexOf(i));
      sv = document.createElement('div'); sv.className = 'sv';
      sv.innerHTML = '<button type="button" class="sv-side p" aria-label="Предыдущая">‹</button>' +
        '<div class="sv-card" role="dialog" aria-modal="true" aria-labelledby="sv-t"><div class="sv-bars"></div>' +
        '<div class="sv-top"><span class="sv-rub"></span><button type="button" class="sv-x" aria-label="Закрыть">×</button></div>' +
        '<div class="sv-body"></div><button type="button" class="sv-tap p" aria-label="Предыдущая"></button><button type="button" class="sv-tap n" aria-label="Следующая"></button>' +
        '<div class="sv-foot"><a class="sv-btn" href="#"></a><small class="sv-ad" hidden></small></div></div>' +
        '<button type="button" class="sv-side n" aria-label="Следующая">›</button>';
      document.body.appendChild(sv); document.documentElement.style.overflow = 'hidden';
      var card = sv.querySelector('.sv-card'), sx = 0, sy = 0, moved = false;
      sv.addEventListener('click', function(e){
        if(moved){ moved = false; return; }
        if(e.target === sv) return close();
        var c = e.target.closest('button'); if(!c) return;
        if(c.classList.contains('sv-x')) close();
        else if(c.classList.contains('p')) go(-1);
        else if(c.classList.contains('n')) go(1);
      });
      // Удержание — пауза, свайп вниз — закрыть, свайп вбок — листать
      card.addEventListener('pointerdown', function(e){ sx = e.clientX; sy = e.clientY; moved = false; if(!e.target.closest('.sv-btn,.sv-x')) pause(); });
      card.addEventListener('pointerup', function(e){
        var dx = e.clientX - sx, dy = e.clientY - sy;
        if(dy > 80 && Math.abs(dy) > Math.abs(dx)){ moved = true; return close(); }
        if(Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy)){ moved = true; go(dx < 0 ? 1 : -1); return; }
        resume();
      });
      card.addEventListener('pointercancel', resume);
      document.addEventListener('keydown', key); document.addEventListener('visibilitychange', vis);
      render(); sv.querySelector('.sv-x').focus();
    }
    btns.forEach(function(b){ b.addEventListener('click', function(){ open(+b.getAttribute('data-i'), b); }); });
  })();

})();
