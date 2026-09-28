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
    if(u){ a.href = u; a.target = '_blank'; a.rel = 'noopener'; }
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
    if(o && o.url){
      a.href = o.url; a.target='_blank'; a.rel='sponsored noopener'; a.textContent = o.label || a.textContent;
      if(o.advertiser || o.erid){
        var m = document.createElement('small'); m.className='admark';
        m.textContent = 'Реклама. ' + (o.advertiser||'') + (o.erid ? ', erid: ' + o.erid : '');
        a.parentNode.insertBefore(m, a.nextSibling);
      }
    } else { a.className += ' pending'; a.textContent = 'ссылка появится скоро'; a.removeAttribute('href'); }
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
      var V = fixed + Math.max(0, D-300000)*0.01;
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
})();
