/*
  Academia de Virtudes · confirmação de presença (?t=TOKEN)
  - Lê o token, tira da barra de endereços na hora e consulta a Edge Function "confirmar-presenca".
  - A resposta (sim / não vai) exige o CAPTCHA (Cloudflare Turnstile).
  - Nada de innerHTML: textos por textContent. Nada fica guardado no aparelho.
*/
(function () {
  'use strict';
  var APP = window.ACADEMIA_CONFIG || {};
  var $ = function (s) { return document.querySelector(s); };
  var $$ = function (s) { return Array.prototype.slice.call(document.querySelectorAll(s)); };
  var FUSO = 'America/Sao_Paulo';

  var busca = new URLSearchParams(location.search);
  var TESTE = busca.has('teste');
  var CENARIO = busca.get('teste') || '';
  var token = busca.get('t') || '';
  var linkAntigo = busca.has('c') || busca.has('n');
  // O token só aparece na URL: sai da barra de endereços (e do histórico) assim que é lido.
  if (token || linkAntigo) history.replaceState(null, '', location.pathname + (TESTE ? '?teste' + (CENARIO ? '=' + CENARIO : '') : ''));
  if (TESTE) { $('#aviso-teste').hidden = false; if (!token) token = 'TESTE_TOKEN_TESTE_TOKEN_TESTE_TOKEN_00'; }

  var evento = null, captchaId = null, captchaPronto = null;
  var telas = ['carregando', 'pergunta', 'sim', 'nao', 'inativo', 'sem-vaga'];
  function tela(nome) {
    telas.forEach(function (t) { $('#tela-' + t).hidden = t !== nome; });
    var alvo = $('#tela-' + nome);
    if (nome !== 'pergunta' && nome !== 'carregando') alvo.focus();
  }

  function api(corpo) {
    if (TESTE) {
      return new Promise(function (ok) {
        setTimeout(function () {
          if (CENARIO === 'invalido') return ok({ ok: false });
          var r = { ok: true, primeiro_nome: 'Gabriela', titulo: 'Encontro 3 · Potencial Artificial', data_inicio: '2026-12-11T12:00:00Z', data_fim: '2026-12-11T20:00:00Z',
                    local: 'Centro Empresarial Office Tower · Av. Evandro Lins e Silva, 840 · Rio de Janeiro', resposta: 'aguardando', doacao_marca: 'Pampers ou Huggies', tamanhos: ['M', 'G'] };
          if (corpo.resposta) r.resposta = corpo.resposta;
          ok(r);
        }, 400);
      });
    }
    return fetch(APP.supabaseUrl + '/functions/v1/confirmar-presenca', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(corpo)
    }).then(function (r) { return r.json().catch(function () { return { ok: false, erro: 'interno' }; }); },
            function () { return { ok: false, erro: 'rede' }; });
  }

  function fmt(iso, op) { return new Intl.DateTimeFormat('pt-BR', Object.assign({ timeZone: FUSO }, op)).format(new Date(iso)); }
  function dataLonga(iso) { var t = fmt(iso, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }); return t.charAt(0).toUpperCase() + t.slice(1); }
  function hora(iso) {
    var p = new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(iso));
    var h = Number(p.filter(function (x) { return x.type === 'hour'; })[0].value), m = p.filter(function (x) { return x.type === 'minute'; })[0].value;
    return h + 'h' + (m !== '00' ? m : '');
  }

  function preencher(e) {
    evento = e;
    $$('[data-nome]').forEach(function (x) { x.textContent = e.primeiro_nome || ''; });
    $$('[data-titulo]').forEach(function (x) { x.textContent = e.titulo || ''; });
    $$('[data-data]').forEach(function (x) { x.textContent = dataLonga(e.data_inicio); });
    // Com término: "das 9h às 17h"; sem término: "9h".
    var horario = e.data_fim ? 'das ' + hora(e.data_inicio) + ' às ' + hora(e.data_fim) : hora(e.data_inicio);
    $$('[data-hora]').forEach(function (x) { x.textContent = e.data_fim ? horario.charAt(0).toUpperCase() + horario.slice(1) : horario; });
    $$('[data-data-curta]').forEach(function (x) { x.textContent = fmt(e.data_inicio, { day: 'numeric', month: 'long' }) + ', ' + (e.data_fim ? horario : 'às ' + horario); });
    $$('[data-local]').forEach(function (x) { x.textContent = e.local || 'A confirmar'; });
    // Lembrete da doação: "Não esqueça: 2 pacotes de fraldas Pampers ou Huggies, tamanhos M e G."
    var t = Array.isArray(e.tamanhos) ? e.tamanhos : [], lembrete = $('#lembrete-doacao');
    while (lembrete.firstChild) lembrete.removeChild(lembrete.firstChild);
    if (t.length) {
      var qtd = t.length === 1 ? '1 pacote' : t.length + ' pacotes';
      var tam = t.length === 2 && t[0] !== t[1] ? 'tamanhos ' + t[0] + ' e ' + t[1] : 'tamanho ' + t[0];
      lembrete.appendChild(document.createTextNode('Não esqueça: ' + qtd + ' de fraldas '));
      var b1 = document.createElement('strong'); b1.textContent = e.doacao_marca || 'Pampers ou Huggies'; lembrete.appendChild(b1);
      lembrete.appendChild(document.createTextNode(', '));
      var b2 = document.createElement('strong'); b2.textContent = tam; lembrete.appendChild(b2);
      lembrete.appendChild(document.createTextNode(', para o Instituto Pró-Vida.'));
    }
    lembrete.hidden = !t.length;
    var atual = $('#resposta-atual');
    atual.hidden = e.resposta === 'aguardando' || !e.resposta;
    atual.textContent = e.resposta === 'sim' ? 'Você já confirmou presença. Se precisar, mude a resposta abaixo.'
      : e.resposta === 'nao_vai' ? 'Você avisou que não vai conseguir ir. Se mudou de ideia, confirme abaixo.' : '';
  }

  function carregarCaptcha() {
    if (TESTE || !APP.turnstileSiteKey) return Promise.resolve();
    if (captchaPronto) return captchaPronto;
    captchaPronto = new Promise(function (ok, nok) {
      var s = document.createElement('script');
      s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      s.async = true; s.onload = ok; s.onerror = nok;
      document.head.appendChild(s);
    }).then(function () {
      captchaId = window.turnstile.render('#captcha', { sitekey: APP.turnstileSiteKey, action: 'presenca', language: 'pt-br', size: 'flexible' });
    }).catch(function () { captchaPronto = null; });
    return captchaPronto;
  }

  function responder(resposta) {
    var erro = $('#erro');
    erro.textContent = '';
    var captchaToken = TESTE ? 'teste' : (captchaId !== null && window.turnstile ? window.turnstile.getResponse(captchaId) : '');
    if (!captchaToken) { erro.textContent = 'Aguarde a verificação de segurança terminar e toque de novo.'; return; }
    $$('.pr-acoes .pr-btn').forEach(function (b) { b.disabled = true; });
    api({ token: token, resposta: resposta, captchaToken: captchaToken }).then(function (r) {
      $$('.pr-acoes .pr-btn').forEach(function (b) { b.disabled = false; });
      if (captchaId !== null && window.turnstile) window.turnstile.reset(captchaId);
      if (r && r.ok) { preencher(r); tela(resposta === 'sim' ? 'sim' : 'nao'); return; }
      if (r && r.erro === 'sem_vaga') { tela('sem-vaga'); return; }
      if (r && (r.erro === 'rede' || r.erro === 'interno' || r.erro === 'limite' || r.erro === 'captcha')) {
        erro.textContent = r.erro === 'limite' ? 'Muitas tentativas em pouco tempo. Aguarde alguns minutos.'
          : r.erro === 'captcha' ? 'Não foi possível confirmar que você não é um robô. Tente de novo.'
          : 'Não conseguimos registrar agora. Verifique sua conexão e tente de novo.';
        return;
      }
      tela('inativo');
    });
  }

  // Arquivo de agenda (.ics) gerado no próprio aparelho.
  function baixarAgenda() {
    if (!evento) return;
    var ini = new Date(evento.data_inicio), fim = evento.data_fim ? new Date(evento.data_fim) : new Date(ini.getTime() + 4 * 3600 * 1000);
    var z = function (d) { return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, ''); };
    var e = function (s) { return String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n'); };
    var ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Grupo GPM//Academia de Virtudes//PT', 'BEGIN:VEVENT',
      'UID:' + z(ini) + '-academia@gpmintegracao.com.br', 'DTSTAMP:' + z(new Date()), 'DTSTART:' + z(ini), 'DTEND:' + z(fim),
      'SUMMARY:' + e('Academia de Virtudes · ' + evento.titulo), 'LOCATION:' + e(evento.local || ''), 'END:VEVENT', 'END:VCALENDAR'].join('\r\n') + '\r\n';
    var url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }));
    var a = document.createElement('a');
    a.href = url; a.download = 'academia-de-virtudes.ics';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
  }

  $('#btn-sim').addEventListener('click', function () { responder('sim'); });
  $('#btn-nao').addEventListener('click', function () { responder('nao_vai'); });
  $('#btn-agenda').addEventListener('click', baixarAgenda);
  $$('[data-mudar]').forEach(function (b) { b.addEventListener('click', function () { tela('pergunta'); carregarCaptcha(); }); });

  if (linkAntigo && !busca.has('t')) { tela('inativo'); return; }
  if (!/^[A-Za-z0-9_-]{32,64}$/.test(token)) { tela('inativo'); return; }
  api({ token: token }).then(function (r) {
    if (r && r.ok) {
      preencher(r);
      if (CENARIO === 'nao') { tela('nao'); return; }
      tela('pergunta'); carregarCaptcha(); return;
    }
    if (r && (r.erro === 'rede' || r.erro === 'interno' || r.erro === 'limite')) {
      $('#tela-carregando .pr-sub').textContent = 'Não conseguimos abrir o convite agora. Verifique sua conexão e recarregue a página.';
      return;
    }
    tela('inativo');
  });
})();
