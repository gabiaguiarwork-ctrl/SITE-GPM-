/*
  Academia de Virtudes · página pública v2 · comportamento
  Menu do celular, abas da Jornada, galeria em tiras, depoimentos (vídeo só no clique),
  animação de entrada e formulário em etapas (Formspree, sem redirecionar).
  Nada de innerHTML com dados: tudo por textContent / createElement.
*/
(function () {
  'use strict';
  var CFG = window.AV_CONFIG || {};
  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };
  var TESTE = /[?&]teste\b/.test(location.search);
  var MOVIMENTO = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function el(tag, attrs, filhos) {
    var e = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) { e.setAttribute(k, attrs[k]); });
    [].concat(filhos == null ? [] : filhos).forEach(function (f) { if (f != null) e.appendChild(typeof f === 'string' ? document.createTextNode(f) : f); });
    return e;
  }

  /* ---------- Textos do config ---------- */
  var P = CFG.PROXIMO || {};
  $$('[data-cfg]').forEach(function (d) { var v = P[d.getAttribute('data-cfg')]; if (v) d.textContent = v; });
  if (P.data) $$('[data-proximo-data]').forEach(function (d) { d.textContent = P.data; });
  if (Array.isArray(CFG.DOACOES) && CFG.DOACOES.length) {
    var ul = $('#doacao-itens');
    while (ul.firstChild) ul.removeChild(ul.firstChild);
    CFG.DOACOES.forEach(function (i) { ul.appendChild(el('li', null, String(i))); });
  }

  /* ---------- Menu do celular ---------- */
  var botaoMenu = $('#av-menu-botao'), menuCel = $('#av-menu-celular');
  botaoMenu.addEventListener('click', function () {
    var abrir = menuCel.hidden;
    menuCel.hidden = !abrir;
    botaoMenu.setAttribute('aria-expanded', String(abrir));
    botaoMenu.setAttribute('aria-label', abrir ? 'Fechar menu' : 'Abrir menu');
  });
  menuCel.addEventListener('click', function (e) { if (e.target.closest('a')) { menuCel.hidden = true; botaoMenu.setAttribute('aria-expanded', 'false'); } });

  /* ---------- Abas da Jornada ---------- */
  var abas = $$('.av-aba');
  function abrirAba(aba, focar) {
    abas.forEach(function (a) {
      var sim = a === aba;
      a.setAttribute('aria-selected', String(sim));
      a.tabIndex = sim ? 0 : -1;
      document.getElementById(a.getAttribute('aria-controls')).hidden = !sim;
    });
    if (focar) aba.focus();
  }
  abas.forEach(function (a, i) {
    a.addEventListener('click', function () { abrirAba(a); });
    a.addEventListener('keydown', function (e) {
      var n = null;
      if (e.key === 'ArrowDown' || e.key === 'ArrowRight') n = (i + 1) % abas.length;
      if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') n = (i - 1 + abas.length) % abas.length;
      if (e.key === 'Home') n = 0;
      if (e.key === 'End') n = abas.length - 1;
      if (n !== null) { e.preventDefault(); abrirAba(abas[n], true); }
    });
  });
  var atual = abas[Math.min(abas.length, Math.max(1, Number(CFG.ENCONTRO_ATUAL) || abas.length)) - 1];
  if (atual) abrirAba(atual);

  /* ---------- Galeria em tiras ---------- */
  var fotos = Array.isArray(CFG.GALERIA) ? CFG.GALERIA.filter(function (f) { return f && f.src; }) : [];
  var galeria = $('#galeria');
  if (!fotos.length) { $('#experiencia').hidden = true; }
  else {
    var tiras = fotos.length >= 4;
    if (!tiras) galeria.classList.add('av-galeria--simples');
    fotos.forEach(function (f, i) {
      var img = el('img', { src: f.src, alt: f.alt || '', loading: 'lazy', decoding: 'async', width: '800', height: '600' });
      if (f.grande) { img.setAttribute('srcset', f.src + ' 800w, ' + f.grande + ' 1600w'); img.setAttribute('sizes', '(max-width: 760px) 82vw, 60vw'); }
      var li = el('li', tiras ? { tabindex: '0' } : null, img);
      if (tiras && i === 0) li.classList.add('ativa');
      galeria.appendChild(li);
    });
    if (tiras) {
      var itens = $$('li', galeria);
      var ativar = function (li) { itens.forEach(function (x) { x.classList.toggle('ativa', x === li); }); };
      itens.forEach(function (li, i) {
        li.addEventListener('mouseenter', function () { ativar(li); });
        li.addEventListener('click', function () { ativar(li); });
        li.addEventListener('focus', function () { ativar(li); });
        li.addEventListener('keydown', function (e) {
          var n = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : null;
          if (n !== null && itens[n]) { e.preventDefault(); itens[n].focus(); }
        });
      });
    }
  }

  /* ---------- Depoimentos (só com itens no config; o YouTube só carrega no clique) ---------- */
  var depos = (Array.isArray(CFG.DEPOIMENTOS) ? CFG.DEPOIMENTOS : []).filter(function (d) { return d && /^[A-Za-z0-9_-]{11}$/.test(d.youtube || ''); });
  if (depos.length) {
    $('#depoimentos').hidden = false;
    var caixa = $('#depo-video'), quem = $('#depo-quem'), bolinhas = $('#depo-bolinhas');
    var mostrar = function (i) {
      var d = depos[i];
      while (caixa.firstChild) caixa.removeChild(caixa.firstChild);
      caixa.appendChild(el('img', { src: 'https://i.ytimg.com/vi/' + d.youtube + '/hqdefault.jpg', alt: '', loading: 'lazy' }));
      var play = el('button', { type: 'button', 'aria-label': 'Assistir ao depoimento de ' + (d.nome || 'participante') }, el('span', { 'aria-hidden': 'true' }, '▶'));
      play.addEventListener('click', function () {
        while (caixa.firstChild) caixa.removeChild(caixa.firstChild);
        caixa.appendChild(el('iframe', { src: 'https://www.youtube-nocookie.com/embed/' + d.youtube + '?autoplay=1&rel=0', title: 'Depoimento de ' + (d.nome || 'participante'), allow: 'autoplay; encrypted-media; picture-in-picture', allowfullscreen: '' }));
      });
      caixa.appendChild(play);
      quem.textContent = [d.nome, d.cargo].filter(Boolean).join(' · ');
      $$('button', bolinhas).forEach(function (b, j) { b.setAttribute('aria-current', String(j === i)); });
    };
    if (depos.length > 1) depos.forEach(function (d, i) {
      var b = el('button', { type: 'button', 'aria-label': 'Depoimento ' + (i + 1) });
      b.addEventListener('click', function () { mostrar(i); });
      bolinhas.appendChild(b);
    });
    mostrar(0);
  }

  /* ---------- Animação de entrada ---------- */
  if (MOVIMENTO && 'IntersectionObserver' in window) {
    document.documentElement.classList.add('av-fx');
    var io = new IntersectionObserver(function (ents) {
      ents.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('av-visivel'); io.unobserve(e.target); } });
    }, { rootMargin: '0px 0px -8% 0px' });
    $$('.av-entra').forEach(function (x) { io.observe(x); });
  }

  /* ================= Formulário em etapas ================= */
  var modal = $('#inscricao'), form = $('#form-insc');
  var etapas = $$('.av-etapa', form).filter(function (e) { return e.getAttribute('data-etapa') !== 'fim'; });
  var fim = $('[data-etapa="fim"]', form);
  var progresso = $('#form-progresso'), erro = $('#form-erro'), falha = $('#form-falha');
  var voltar = $('#form-voltar'), continuar = $('#form-continuar'), dica = $('#form-dica'), proximas = $('#form-proximas');
  var passo = 0, origemFoco = null, enviado = false;
  if (TESTE) $('#av-teste').hidden = false;
  etapas.forEach(function () { progresso.appendChild(el('span')); });

  function digitos(v) { return String(v || '').replace(/\D/g, '').slice(0, 11); }
  function mascara(v) {
    var d = digitos(v);
    if (!d) return '';
    if (d.length <= 2) return '(' + d;
    var r = d.slice(2);
    if (d.length <= 6) return '(' + d.slice(0, 2) + ') ' + r;
    if (d.length <= 10) return '(' + d.slice(0, 2) + ') ' + r.slice(0, 4) + '-' + r.slice(4);
    return '(' + d.slice(0, 2) + ') ' + r.slice(0, 5) + '-' + r.slice(5);
  }
  function telValido(d) { return /^[1-9][1-9]\d{8,9}$/.test(d) && (d.length === 10 || d.charAt(2) === '9'); }
  $$('input[type="tel"]', form).forEach(function (i) { i.addEventListener('input', function () { i.value = mascara(i.value); }); });
  // "Ainda não" desmarca os encontros (e vice-versa).
  $$('input[name="participou"]', form).forEach(function (c) {
    c.addEventListener('change', function () {
      if (!c.checked) return;
      $$('input[name="participou"]', form).forEach(function (o) { if (o !== c && (c.hasAttribute('data-exclusivo') || o.hasAttribute('data-exclusivo'))) o.checked = false; });
    });
  });
  $$('input[name="acompanhante"]', form).forEach(function (r) {
    r.addEventListener('change', function () { $('#f-acomp-dados').hidden = !(r.checked && r.value === 'Sim'); });
  });
  form.addEventListener('input', function () { erro.textContent = ''; });

  function valor(nome) { var x = $('input[name="' + nome + '"]:checked', form); return x ? x.value : ''; }
  function marcados(nome) { return $$('input[name="' + nome + '"]:checked', form).map(function (x) { return x.value; }); }
  function validar(nomeEtapa) {
    var v;
    switch (nomeEtapa) {
      case 'email': v = $('#f-email').value.trim(); return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v) ? '' : 'Escreva um e-mail válido, por exemplo nome@empresa.com.br.';
      case 'nome': v = $('#f-nome').value.trim().replace(/\s+/g, ' '); return v.split(' ').length >= 2 && v.length >= 5 ? '' : 'Escreva seu nome e sobrenome.';
      case 'whatsapp': return telValido(digitos($('#f-whatsapp').value)) ? '' : 'Escreva seu WhatsApp com DDD, por exemplo (21) 99999-9999.';
      case 'empresa': return $('#f-empresa').value.trim().length >= 2 ? '' : 'Escreva o nome da sua empresa.';
      case 'cargo': return valor('cargo') ? '' : 'Escolha uma opção.';
      case 'participou': return marcados('participou').length ? '' : 'Escolha ao menos uma opção.';
      case 'perfil': return '';
      case 'acompanhante':
        if (!valor('acompanhante')) return 'Escolha Sim ou Não.';
        if (valor('acompanhante') === 'Sim') {
          if ($('#f-acomp-nome').value.trim().length < 3) return 'Escreva o nome do acompanhante.';
          var d = digitos($('#f-acomp-whatsapp').value);
          if (!telValido(d)) return 'Escreva o WhatsApp do acompanhante com DDD.';
          if (d === digitos($('#f-whatsapp').value)) return 'O WhatsApp do acompanhante precisa ser diferente do seu.';
        }
        return '';
      case 'consentimento': return $('#f-consent').checked ? '' : 'Marque a concordância para enviar a inscrição.';
    }
    return '';
  }
  function primeiroCampo(etapa) { return $('input:not([type="hidden"]):not([tabindex="-1"])', etapa); }
  function mostrar(i, focar) {
    passo = i;
    etapas.forEach(function (e, j) { e.hidden = j !== i; });
    fim.hidden = true;
    $$('span', progresso).forEach(function (s, j) { s.className = j < i ? 'feito' : j === i ? 'atual' : ''; });
    voltar.hidden = i === 0;
    continuar.textContent = i === etapas.length - 1 ? 'Enviar inscrição' : 'Continuar';
    dica.hidden = i === etapas.length - 1;
    erro.textContent = '';
    // Próximas perguntas, apagadas, embaixo (como no G4).
    while (proximas.firstChild) proximas.removeChild(proximas.firstChild);
    etapas.slice(i + 1, i + 3).forEach(function (e) {
      var lg = $('legend', e);
      var t = lg ? lg.textContent.replace(/^\s*\d+\s*→\s*/, '').replace(/\(opcional\)/, '').trim() : '';
      if (t) proximas.appendChild(el('p', null, t));
    });
    if (focar !== false) { var c = primeiroCampo(etapas[i]); if (c) c.focus({ preventScroll: true }); }
    modal.scrollTop = 0;
  }
  function abrir(e) {
    if (e) e.preventDefault();
    origemFoco = document.activeElement;
    modal.hidden = false;
    document.body.classList.add('av-travado');
    if (location.hash !== '#inscricao') history.pushState(null, '', '#inscricao');
    if (enviado) { mostrarFim(); return; }
    mostrar(passo);
  }
  function fechar(semHistorico) {
    if (modal.hidden) return;
    modal.hidden = true;
    document.body.classList.remove('av-travado');
    if (!semHistorico && location.hash === '#inscricao') history.replaceState(null, '', location.pathname + location.search);
    if (origemFoco && origemFoco.focus) origemFoco.focus();
  }
  $$('[data-abrir-form]').forEach(function (b) { b.addEventListener('click', abrir); });
  $('#form-fechar').addEventListener('click', function () { fechar(); });
  $$('[data-fechar-form]').forEach(function (b) { b.addEventListener('click', function () { fechar(); }); });
  window.addEventListener('hashchange', function () { if (location.hash === '#inscricao') abrir(); else fechar(true); });
  if (location.hash === '#inscricao') abrir();
  // ESC fecha; Tab fica preso dentro do formulário.
  modal.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { e.preventDefault(); fechar(); return; }
    if (e.key !== 'Tab') return;
    var foco = $$('a[href], button:not([disabled]), input:not([tabindex="-1"]), [tabindex="0"]', modal).filter(function (x) { return x.offsetParent !== null; });
    if (!foco.length) return;
    var pri = foco[0], ult = foco[foco.length - 1];
    if (e.shiftKey && document.activeElement === pri) { e.preventDefault(); ult.focus(); }
    else if (!e.shiftKey && document.activeElement === ult) { e.preventDefault(); pri.focus(); }
  });
  voltar.addEventListener('click', function () { if (passo > 0) mostrar(passo - 1); });

  function dados() {
    var nome = $('#f-nome').value.trim().replace(/\s+/g, ' ');
    var d = {
      _subject: (CFG.ASSUNTO || 'Inscrição · Academia de Virtudes') + ' · ' + nome,
      origem: CFG.ORIGEM || 'site-academia-v2',
      encontro: P.titulo || '',
      email: $('#f-email').value.trim(),
      nome: nome,
      whatsapp: mascara($('#f-whatsapp').value),
      empresa: $('#f-empresa').value.trim(),
      cargo: valor('cargo'),
      ja_participou: marcados('participou').join(', '),
      perfil_ia: valor('perfil_ia') || '(não informado)',
      acompanhante: valor('acompanhante'),
      consentimento: 'Concordo com o uso dos meus dados para a organização do encontro e estou ciente de que ele poderá ser fotografado e gravado.',
      comunicacoes: $('#f-comunic').checked ? 'Sim' : 'Não'
    };
    if (d.acompanhante === 'Sim') { d.acompanhante_nome = $('#f-acomp-nome').value.trim(); d.acompanhante_whatsapp = mascara($('#f-acomp-whatsapp').value); }
    if ($('#form-hp').value) d._gotcha = $('#form-hp').value;
    return d;
  }
  function enviar(corpo) {
    if (TESTE) { console.info('[teste] envio simulado', corpo); return new Promise(function (r) { setTimeout(r, 600); }); }
    return fetch(CFG.FORMULARIO, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(corpo) })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json().catch(function () { return {}; }); });
  }
  function mostrarFim() {
    etapas.forEach(function (e) { e.hidden = true; });
    fim.hidden = false;
    $('#form-acoes').hidden = true;
    while (proximas.firstChild) proximas.removeChild(proximas.firstChild);
    $$('span', progresso).forEach(function (s) { s.className = 'feito'; });
    $('#fim-nome').textContent = ($('#f-nome').value.trim().split(/\s+/)[0]) || 'participante';
    fim.focus();
  }
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (continuar.disabled) return;
    var msg = validar(etapas[passo].getAttribute('data-etapa'));
    if (msg) { erro.textContent = msg; var c = primeiroCampo(etapas[passo]); if (c) c.focus(); return; }
    if (passo < etapas.length - 1) { mostrar(passo + 1); return; }
    falha.hidden = true;
    continuar.disabled = true; continuar.textContent = 'Enviando…';
    enviar(dados()).then(function () {
      enviado = true;
      mostrarFim();
    }).catch(function () {
      continuar.disabled = false; continuar.textContent = 'Tentar de novo';
      falha.hidden = false;
    });
  });
})();
