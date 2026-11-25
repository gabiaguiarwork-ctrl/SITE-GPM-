/*
  Academia de Virtudes · página pública v2 · comportamento
  Menu do celular, linha do tempo da Jornada, galeria em tiras, depoimentos (vídeo só no clique),
  animação de entrada e formulário em etapas (Supabase; Formspree como plano B).
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

  /* ---------- Menu do celular ---------- */
  var botaoMenu = $('#av-menu-botao'), menuCel = $('#av-menu-celular');
  botaoMenu.addEventListener('click', function () {
    var abrir = menuCel.hidden;
    menuCel.hidden = !abrir;
    botaoMenu.setAttribute('aria-expanded', String(abrir));
    botaoMenu.setAttribute('aria-label', abrir ? 'Fechar menu' : 'Abrir menu');
  });
  menuCel.addEventListener('click', function (e) { if (e.target.closest('a')) { menuCel.hidden = true; botaoMenu.setAttribute('aria-expanded', 'false'); } });

  /* ---------- Jornada: linha do tempo que desliza ---------- */
  var trilha = $('#linha-trilha');
  if (trilha) {
    var ant = $('#linha-ant'), prox = $('#linha-prox');
    var passoLinha = function () {
      var itens = $$('li', trilha);
      return itens.length > 1 ? itens[1].offsetLeft - itens[0].offsetLeft : trilha.clientWidth;
    };
    var setas = function () {
      ant.disabled = trilha.scrollLeft <= 4;
      prox.disabled = trilha.scrollLeft + trilha.clientWidth >= trilha.scrollWidth - 4;
    };
    ant.addEventListener('click', function () { trilha.scrollBy({ left: -passoLinha(), behavior: MOVIMENTO ? 'smooth' : 'auto' }); });
    prox.addEventListener('click', function () { trilha.scrollBy({ left: passoLinha(), behavior: MOVIMENTO ? 'smooth' : 'auto' }); });
    trilha.addEventListener('scroll', setas, { passive: true });
    window.addEventListener('resize', setas);
    setas();
    // Arrastar com o mouse (no celular e no trackpad a rolagem já é natural).
    var arraste = null;
    trilha.addEventListener('pointerdown', function (e) {
      if (e.pointerType !== 'mouse' || e.button !== 0 || e.target.closest('a, button')) return;
      arraste = { x: e.clientX, inicio: trilha.scrollLeft, moveu: false };
      trilha.classList.add('av-linha__trilha--arrastando');
    });
    window.addEventListener('pointermove', function (e) {
      if (!arraste) return;
      var dx = e.clientX - arraste.x;
      if (Math.abs(dx) > 4) arraste.moveu = true;
      trilha.scrollLeft = arraste.inicio - dx;
    });
    window.addEventListener('pointerup', function () {
      if (!arraste) return;
      arraste = null;
      trilha.classList.remove('av-linha__trilha--arrastando');
    });
    trilha.addEventListener('dragstart', function (e) { e.preventDefault(); });
  }

  /* ---------- Galeria em tiras ---------- */
  var fotos = Array.isArray(CFG.GALERIA) ? CFG.GALERIA.filter(function (f) { return f && /^[A-Za-z0-9_/.-]+$/.test(f.base || ''); }) : [];
  var galeria = $('#galeria');
  if (!fotos.length) { $('#experiencia').hidden = true; }
  else {
    var tiras = fotos.length >= 4;
    if (!tiras) galeria.classList.add('av-galeria--simples');
    fotos.forEach(function (f, i) {
      var base = f.base.charAt(0) === '/' ? f.base : '/assets/academia/galeria/' + f.base;
      var w = Number(f.w) || 1600, h = Number(f.h) || 900;
      var fonte = el('source', { type: 'image/webp', srcset: base + '-800.webp 800w, ' + base + '-1600.webp ' + w + 'w', sizes: '(max-width: 760px) 82vw, 60vw' });
      var img = el('img', { src: base + '.jpg', alt: f.alt || '', loading: 'lazy', decoding: 'async', width: String(w), height: String(h) });
      var li = el('li', tiras ? { tabindex: '0' } : null, el('picture', null, [fonte, img]));
      if (w > h) li.classList.add('av-galeria__deitada');
      if (f.legenda) li.appendChild(el('span', { 'class': 'av-galeria__legenda' }, f.legenda));
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
  // Envio: FORM_BACKEND = "supabase" (padrão: Edge Function "inscricao") ou "formspree" (plano B).
  // ?teste simula tudo sem enviar. Situações simuladas: ?teste=espera | encerradas | esgotado | umlugar
  var APP = window.ACADEMIA_CONFIG || {};
  var BACKEND = CFG.FORM_BACKEND === 'formspree' ? 'formspree' : 'supabase';
  var SLUG = CFG.EVENTO || 'encontro-3';
  // Só no computador (localhost): ?evento=slug testa num evento de teste criado no painel, sem tocar no encontro real.
  var LOCAL = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  var EVENTO_TESTE = (location.search.match(/[?&]evento=([a-z0-9-]{1,60})/) || [])[1];
  if (LOCAL && EVENTO_TESTE) SLUG = EVENTO_TESTE;
  var CENARIO = (location.search.match(/[?&]teste=(\w+)/) || [])[1] || '';
  var modal = $('#inscricao'), form = $('#form-insc');
  var etapas = $$('.av-etapa', form).filter(function (e) { return !e.classList.contains('av-fim'); });
  var fim = $('[data-etapa="fim"]', form), encerradas = $('[data-etapa="encerradas"]', form);
  var progresso = $('#form-progresso'), erro = $('#form-erro'), falha = $('#form-falha');
  var voltar = $('#form-voltar'), continuar = $('#form-continuar'), dica = $('#form-dica'), proximas = $('#form-proximas');
  var passo = 0, origemFoco = null, enviado = false, resultado = null;
  // Situação pública do evento (sem números). Sem resposta, o formulário funciona com os 3 tamanhos.
  var SIT = { situacao: 'abertas', tamanhos: ['P', 'M', 'G'], acompanhante: true, doacao_marca: 'Pampers ou Huggies' };
  if (TESTE) $('#av-teste').hidden = false;
  etapas.forEach(function () { progresso.appendChild(el('span')); });

  function aplicarSituacao(s) {
    if (!s) return;
    SIT = {
      situacao: s.situacao || 'abertas',
      tamanhos: Array.isArray(s.tamanhos) ? s.tamanhos : [],
      acompanhante: s.acompanhante !== false,
      doacao_marca: s.doacao_marca || SIT.doacao_marca,
      titulo: s.titulo
    };
    var espera = SIT.situacao === 'lista_espera';
    // Na lista de espera a cota não é reservada: mostra os 3 tamanhos, com o aviso.
    var tams = espera ? ['P', 'M', 'G'] : SIT.tamanhos;
    $$('[data-tamanho]', form).forEach(function (l) {
      var ok = tams.indexOf(l.getAttribute('data-tamanho')) >= 0;
      l.hidden = !ok;
      var i = $('input', l); if (!ok && i.checked) i.checked = false;
    });
    $('#f-aviso-espera').hidden = !espera;
    $('#f-doacao-espera').hidden = !espera;
    var umLugar = !espera && !SIT.acompanhante;
    $('#f-um-lugar').hidden = !umLugar;
    $('#f-acomp-sim').textContent = umLugar ? 'Sim, e entro com o acompanhante na lista de espera' : 'Sim';
    $('#f-acomp-nao').textContent = umLugar ? 'Não, vou sozinho(a)' : 'Não';
    $$('[data-doacao-marca]').forEach(function (m) { m.textContent = SIT.doacao_marca; });
    if (SIT.titulo) $$('[data-evento-titulo]').forEach(function (t) { t.textContent = SIT.titulo.split(' · ')[0]; });
    // "Últimas vagas": só o texto do botão muda, sem contagem (tom da marca).
    if (SIT.situacao === 'ultimas_vagas') $$('[data-abrir-form]').forEach(function (b) { b.textContent = 'Inscrever-se'; });
  }
  function buscarSituacao() {
    if (TESTE) {
      var simulado = {
        espera: { situacao: 'lista_espera', tamanhos: [], acompanhante: true },
        encerradas: { situacao: 'encerradas', tamanhos: [], acompanhante: false },
        esgotado: { situacao: 'abertas', tamanhos: ['M', 'G'], acompanhante: true },
        umlugar: { situacao: 'ultimas_vagas', tamanhos: ['P', 'M', 'G'], acompanhante: false }
      }[CENARIO];
      return Promise.resolve(simulado || { situacao: 'abertas', tamanhos: ['P', 'M', 'G'], acompanhante: true });
    }
    if (BACKEND !== 'supabase' || !APP.supabaseUrl) return Promise.resolve(null);
    return fetch(APP.supabaseUrl + '/rest/v1/rpc/evento_publico', {
      method: 'POST',
      headers: { apikey: APP.supabaseKey, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ evento: SLUG })
    }).then(function (r) { return r.ok ? r.json() : null; })
      .then(function (l) { return Array.isArray(l) && l[0] ? l[0] : null; })
      .catch(function () { return null; });
  }
  var situacaoPronta = buscarSituacao().then(function (s) { aplicarSituacao(s); return s; });

  /* ----- CAPTCHA (Cloudflare Turnstile), carregado só quando o formulário abre ----- */
  var captcha = { id: null, carregando: null };
  function carregarCaptcha() {
    if (TESTE || BACKEND !== 'supabase' || !APP.turnstileSiteKey) return Promise.resolve();
    if (captcha.carregando) return captcha.carregando;
    captcha.carregando = new Promise(function (ok, nok) {
      var s = document.createElement('script');
      s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      s.async = true; s.onload = ok; s.onerror = nok;
      document.head.appendChild(s);
    }).then(function () {
      captcha.id = window.turnstile.render('#f-captcha', { sitekey: APP.turnstileSiteKey, action: 'inscricao', language: 'pt-br', size: 'flexible' });
    }).catch(function () { captcha.carregando = null; });
    return captcha.carregando;
  }
  function tokenCaptcha() {
    if (TESTE || BACKEND !== 'supabase') return 'teste';
    return captcha.id !== null && window.turnstile ? window.turnstile.getResponse(captcha.id) : '';
  }
  function reiniciarCaptcha() { if (captcha.id !== null && window.turnstile) window.turnstile.reset(captcha.id); }

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
      case 'equipe': return valor('equipe_gpm') ? '' : 'Escolha Sim ou Não.';
      case 'convidado': return '';
      case 'participou': return marcados('participou').length ? '' : 'Escolha ao menos uma opção.';
      case 'perfil': return '';
      case 'doacao': return valor('doacao_tamanho') ? '' : 'Escolha o tamanho da fralda que você vai levar.';
      case 'acompanhante':
        if (!valor('acompanhante')) return 'Escolha uma das opções.';
        if (valor('acompanhante') === 'Sim') {
          if ($('#f-acomp-nome').value.trim().length < 3) return 'Escreva o nome do acompanhante.';
          var d = digitos($('#f-acomp-whatsapp').value);
          if (!telValido(d)) return 'Escreva o WhatsApp do acompanhante com DDD.';
          if (d === digitos($('#f-whatsapp').value)) return 'O WhatsApp do acompanhante precisa ser diferente do seu.';
          if (!valor('acompanhante_doacao_tamanho')) return 'Escolha o tamanho da fralda do acompanhante.';
        }
        return '';
      case 'consentimento':
        if (!$('#f-consent').checked) return 'Marque a concordância para enviar a inscrição.';
        if (!tokenCaptcha()) return 'Aguarde a verificação de segurança terminar (logo acima do botão) e tente de novo.';
        return '';
    }
    return '';
  }
  function primeiroCampo(etapa) { return $('input:not([type="hidden"]):not([tabindex="-1"])', etapa); }
  function esconderTudo() {
    etapas.forEach(function (e) { e.hidden = true; });
    fim.hidden = true; encerradas.hidden = true;
  }
  function mostrar(i, focar) {
    passo = i;
    esconderTudo();
    etapas[i].hidden = false;
    $('#form-acoes').hidden = false;
    $$('span', progresso).forEach(function (s, j) { s.className = j < i ? 'feito' : j === i ? 'atual' : ''; });
    voltar.hidden = i === 0;
    continuar.textContent = i === etapas.length - 1 ? 'Enviar inscrição' : 'Continuar';
    dica.hidden = i === etapas.length - 1;
    erro.textContent = '';
    if (etapas[i].getAttribute('data-etapa') === 'consentimento') carregarCaptcha();
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
  function mostrarEncerradas() {
    esconderTudo();
    encerradas.hidden = false;
    $('#form-acoes').hidden = true;
    while (proximas.firstChild) proximas.removeChild(proximas.firstChild);
    encerradas.focus();
  }
  function abrir(e) {
    if (e) e.preventDefault();
    origemFoco = document.activeElement;
    modal.hidden = false;
    document.body.classList.add('av-travado');
    if (location.hash !== '#inscricao') history.pushState(null, '', '#inscricao');
    if (enviado) { mostrarFim(); return; }
    if (SIT.situacao === 'encerradas') { mostrarEncerradas(); return; }
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
  if (location.hash === '#inscricao') situacaoPronta.then(function () { abrir(); });
  // ESC fecha; Tab fica preso dentro do formulário.
  modal.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { e.preventDefault(); fechar(); return; }
    if (e.key !== 'Tab') return;
    var foco = $$('a[href], button:not([disabled]), input:not([tabindex="-1"]), iframe, [tabindex="0"]', modal).filter(function (x) { return x.offsetParent !== null; });
    if (!foco.length) return;
    var pri = foco[0], ult = foco[foco.length - 1];
    if (e.shiftKey && document.activeElement === pri) { e.preventDefault(); ult.focus(); }
    else if (!e.shiftKey && document.activeElement === ult) { e.preventDefault(); pri.focus(); }
  });
  voltar.addEventListener('click', function () { if (passo > 0) mostrar(passo - 1); });

  function nomeLimpo() { return $('#f-nome').value.trim().replace(/\s+/g, ' '); }
  // Campos para a Edge Function (colunas da tabela inscricoes).
  function dadosSupabase() {
    var acomp = valor('acompanhante') === 'Sim';
    return {
      evento: SLUG,
      email: $('#f-email').value.trim(),
      nome: nomeLimpo(),
      whatsapp: digitos($('#f-whatsapp').value),
      empresa: $('#f-empresa').value.trim(),
      cargo: valor('cargo'),
      equipe_gpm: valor('equipe_gpm') === 'Sim',
      convidado_por: $('#f-convidado').value.trim(),
      participou: marcados('participou').filter(function (p) { return p !== 'ainda-nao'; }),
      perfil_ia: valor('perfil_ia'),
      doacao_tamanho: valor('doacao_tamanho'),
      acompanhante: acomp,
      acompanhante_nome: acomp ? $('#f-acomp-nome').value.trim() : '',
      acompanhante_whatsapp: acomp ? digitos($('#f-acomp-whatsapp').value) : '',
      acompanhante_doacao_tamanho: acomp ? valor('acompanhante_doacao_tamanho') : '',
      consentimento: $('#f-consent').checked,
      aceite_comunicacoes: $('#f-comunic').checked,
      captchaToken: tokenCaptcha(),
      website: $('#form-hp').value
    };
  }
  // Plano B: o mesmo conteúdo, em texto, para o Formspree.
  function dadosFormspree() {
    var s = dadosSupabase();
    var d = {
      _subject: (CFG.ASSUNTO || 'Inscrição · Academia de Virtudes') + ' · ' + s.nome,
      origem: CFG.ORIGEM || 'site-academia-v2',
      encontro: P.titulo || '',
      email: s.email, nome: s.nome, whatsapp: mascara(s.whatsapp), empresa: s.empresa, cargo: s.cargo,
      equipe_gpm: s.equipe_gpm ? 'Sim' : 'Não',
      convidado_por: s.convidado_por || '(não informado)',
      ja_participou: marcados('participou').join(', ').replace(/encontro-(\d+)/g, 'Encontro $1').replace('ainda-nao', 'Ainda não'),
      perfil_ia: s.perfil_ia || '(não informado)',
      fralda: s.doacao_tamanho,
      acompanhante: s.acompanhante ? 'Sim' : 'Não',
      consentimento: 'Concordo com o uso dos meus dados para a organização do encontro e estou ciente de que ele poderá ser fotografado e gravado.',
      comunicacoes: s.aceite_comunicacoes ? 'Sim' : 'Não'
    };
    if (s.acompanhante) { d.acompanhante_nome = s.acompanhante_nome; d.acompanhante_whatsapp = mascara(s.acompanhante_whatsapp); d.acompanhante_fralda = s.acompanhante_doacao_tamanho; }
    if (s.website) d._gotcha = s.website;
    return d;
  }
  // Resolve com { situacao } ou rejeita com { erro, mensagem, tamanhos, rede }.
  function enviar() {
    if (TESTE) {
      console.info('[teste] envio simulado', dadosSupabase());
      return new Promise(function (ok, nok) {
        setTimeout(function () {
          if (CENARIO === 'esgotado' && valor('doacao_tamanho') === 'M') nok({ erro: 'tamanho_esgotado', tamanhos: ['G'] });
          else ok({ situacao: SIT.situacao === 'lista_espera' || (valor('acompanhante') === 'Sim' && !SIT.acompanhante) ? 'lista_espera' : 'inscrito' });
        }, 600);
      });
    }
    if (BACKEND === 'formspree') {
      return fetch(CFG.FORMULARIO, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(dadosFormspree()) })
        .then(function (r) { if (!r.ok) throw { rede: true }; return { situacao: 'inscrito' }; }, function () { throw { rede: true }; });
    }
    return fetch(APP.supabaseUrl + '/functions/v1/inscricao', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(dadosSupabase())
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (r.ok && j.ok) return { situacao: j.situacao };
        if (r.status >= 500 || !j.erro) throw { rede: true };
        throw j;
      });
    }, function () { throw { rede: true }; });
  }
  function tamanhosTexto() {
    var t = [valor('doacao_tamanho')];
    if (valor('acompanhante') === 'Sim') t.push(valor('acompanhante_doacao_tamanho'));
    var marca = SIT.doacao_marca;
    if (t.length === 1) return 'Não esqueça: 1 pacote de fraldas ' + marca + ', tamanho ' + t[0] + '.';
    return 'Não esqueça: 2 pacotes de fraldas ' + marca + ', ' + (t[0] === t[1] ? 'tamanho ' + t[0] : 'tamanhos ' + t[0] + ' e ' + t[1]) + '.';
  }
  function mostrarFim() {
    esconderTudo();
    fim.hidden = false;
    $('#form-acoes').hidden = true;
    while (proximas.firstChild) proximas.removeChild(proximas.firstChild);
    $$('span', progresso).forEach(function (s) { s.className = 'feito'; });
    var nome = (nomeLimpo().split(' ')[0]) || 'participante';
    var espera = resultado && resultado.situacao === 'lista_espera';
    $('#fim-titulo').textContent = espera ? 'Você está na lista de espera.' : 'Inscrição recebida.';
    var texto = $('#fim-texto');
    while (texto.firstChild) texto.removeChild(texto.firstChild);
    if (espera) {
      texto.appendChild(document.createTextNode('Obrigado, ' + nome + '. Recebemos sua inscrição na '));
      texto.appendChild(el('strong', null, 'lista de espera'));
      texto.appendChild(document.createTextNode('. Se abrir uma vaga, avisamos pelo WhatsApp.'));
    } else {
      texto.appendChild(document.createTextNode('Obrigado, ' + nome + '. Assim que a data do Encontro 3 for confirmada, você recebe o convite pelo WhatsApp.'));
    }
    $('#fim-doacao').hidden = !!espera;
    $('#fim-doacao').textContent = tamanhosTexto();
    fim.focus();
  }
  function irPara(nomeEtapa) {
    for (var i = 0; i < etapas.length; i++) if (etapas[i].getAttribute('data-etapa') === nomeEtapa) return mostrar(i);
  }
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (continuar.disabled) return;
    var msg = validar(etapas[passo].getAttribute('data-etapa'));
    if (msg) { erro.textContent = msg; var c = primeiroCampo(etapas[passo]); if (c) c.focus(); return; }
    if (passo < etapas.length - 1) { mostrar(passo + 1); return; }
    falha.hidden = true;
    continuar.disabled = true; continuar.textContent = 'Enviando…';
    enviar().then(function (r) {
      resultado = r; enviado = true;
      continuar.disabled = false;
      mostrarFim();
    }).catch(function (x) {
      continuar.disabled = false;
      reiniciarCaptcha();
      x = x || {};
      if (x.erro === 'tamanho_esgotado') {
        aplicarSituacao({ situacao: SIT.situacao, tamanhos: x.tamanhos || [], acompanhante: SIT.acompanhante, doacao_marca: SIT.doacao_marca });
        irPara('doacao');
        erro.textContent = (x.tamanhos && x.tamanhos.length)
          ? 'O tamanho escolhido acabou de esgotar. Ainda temos: ' + x.tamanhos.join(', ') + '. Escolha outro e envie de novo.'
          : 'Os tamanhos de fralda esgotaram. Atualize a página para ver a situação do encontro.';
        return;
      }
      if (x.erro === 'encerradas') { SIT.situacao = 'encerradas'; mostrarEncerradas(); return; }
      continuar.textContent = 'Tentar de novo';
      if (x.rede) { falha.hidden = false; return; }
      erro.textContent = x.mensagem || 'Não conseguimos enviar agora. Confira os dados e tente de novo.';
    });
  });
})();
