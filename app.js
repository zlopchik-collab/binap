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
        m.textContent = 'Реклама. ' + (o.advertiser||'') + (o.erid ? ', erid: ' + o.erid : '');
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
    var items = C.DEADLINES.filter(function(d){ return new Date(d.date+'T00:00:00') >= today; }).slice(0,4);
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

  /* Нижняя плашка «каждое утро в MAX» */
  var stick = document.getElementById('stick');
  if(stick){
    var hideUntil = +store.get('bnp_stick') || 0;
    if(Date.now() < hideUntil || store.get('bnp_sub')) stick.hidden = true;
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

})();
