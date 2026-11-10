/*
  Área do Aluno · Academia de Virtudes
  Player de vídeo com a mesma interface para Vimeo e Panda Video (sem SDK de terceiros:
  o iframe do provedor + mensagens postMessage, conferindo a origem de cada mensagem).

  Uso:
    var p = AcademiaPlayer.criar(caixa, {
      provedor: 'vimeo' | 'panda', videoId: '…', inicio: 120,
      aoTempo: function (seg, duracao) {}, aoFim: function () {}, aoErro: function (msg) {}
    });
    p.posicao()  → segundos atuais        p.duracao() → duração (0 se ainda não sabe)
    p.tocar()    p.irPara(seg)            p.destruir()

  ID do vídeo
  - Vimeo: número do vídeo; para vídeo "não listado", número:hash (ex.: 123456789:abc123def4).
  - Panda: ID do vídeo; o endereço do player da biblioteca fica em config.js (pandaHost).

  Restrição de domínio: o iframe envia só a origem do site (referrerpolicy="strict-origin"),
  que é o que o Vimeo e o Panda conferem. A página em si continua com Referrer-Policy: no-referrer.
*/
(function () {
  'use strict';

  var AC = window.AC;
  var CFG = window.ACADEMIA_CONFIG;

  var VIMEO_ORIGEM = 'https://player.vimeo.com';
  var PANDA_HOST = /^[a-z0-9-]+\.tv\.pandavideo\.com\.br$/;

  function lerMensagem(d) {
    if (typeof d === 'string') { try { return JSON.parse(d); } catch (e) { return null; } }
    return d && typeof d === 'object' ? d : null;
  }

  /* ---------- Vimeo ---------- */
  function vimeo(opc) {
    var m = String(opc.videoId).match(/^(\d{1,12})(?::([a-f0-9]{6,20}))?$/i);
    if (!m) return null;
    var q = new URLSearchParams({ dnt: '1', title: '0', byline: '0', portrait: '0', badge: '0', autopause: '1' });
    if (m[2]) q.set('h', m[2]);
    var inicio = Math.floor(opc.inicio || 0);
    return {
      origem: VIMEO_ORIGEM,
      src: VIMEO_ORIGEM + '/video/' + m[1] + '?' + q.toString() + (inicio > 5 ? '#t=' + inicio + 's' : ''),
      ehOrigem: function (o) { return o === VIMEO_ORIGEM; },
      comando: function (metodo, valor) { return JSON.stringify(valor === undefined ? { method: metodo } : { method: metodo, value: valor }); },
      aoPronto: function (enviar) {
        ['timeupdate', 'ended', 'play', 'pause'].forEach(function (ev) { enviar('addEventListener', ev); });
      },
      interpretar: function (d) {
        if (d.event === 'ready') return { tipo: 'pronto' };
        if (d.event === 'timeupdate' && d.data) return { tipo: 'tempo', seg: Number(d.data.seconds) || 0, duracao: Number(d.data.duration) || 0 };
        if (d.event === 'ended') return { tipo: 'fim' };
        if (d.event === 'error') return { tipo: 'erro' };
        return null;
      },
      tocar: ['play'], irPara: function (s) { return ['setCurrentTime', s]; }
    };
  }

  /* ---------- Panda Video ---------- */
  function panda(opc) {
    var host = String(CFG.pandaHost || '');
    if (!PANDA_HOST.test(host)) return { semConfig: true };
    if (!/^[A-Za-z0-9-]{8,64}$/.test(String(opc.videoId))) return null;
    var origem = 'https://' + host;
    return {
      origem: origem,
      src: origem + '/embed/?v=' + encodeURIComponent(opc.videoId),
      ehOrigem: function (o) { return o === origem; },
      comando: function (metodo, valor) { return valor === undefined ? { type: metodo } : { type: metodo, parameter: valor }; },
      aoPronto: function () {},
      interpretar: function (d) {
        var ev = d.message || d.event || '';
        if (ev === 'panda_ready') return { tipo: 'pronto' };
        if (ev === 'panda_timeupdate') return { tipo: 'tempo', seg: Number(d.currentTime) || 0, duracao: Number(d.duration) || 0 };
        if (ev === 'panda_ended') return { tipo: 'fim' };
        if (ev === 'panda_error') return { tipo: 'erro' };
        return null;
      },
      tocar: ['play'], irPara: function (s) { return ['currentTime', s]; }
    };
  }

  function criar(caixa, opc) {
    opc = opc || {};
    var prov = opc.provedor === 'vimeo' ? vimeo(opc) : opc.provedor === 'panda' ? panda(opc) : null;
    var falhar = function (msg) {
      AC.limpar(caixa);
      caixa.appendChild(AC.h('p', { class: 'ac-player__erro', role: 'alert' }, msg));
      if (opc.aoErro) opc.aoErro(msg);
      return { posicao: function () { return 0; }, duracao: function () { return 0; }, tocar: function () {}, irPara: function () {}, destruir: function () {} };
    };
    if (prov && prov.semConfig) return falhar('O player de vídeo ainda não foi configurado. Fale com a equipe GPM.');
    if (!prov) return falhar('Este vídeo não está disponível.');

    var pos = Math.floor(opc.inicio || 0), dur = 0, pronto = false, buscouInicio = false;
    var iframe = AC.h('iframe', {
      class: 'ac-player__iframe',
      src: prov.src,
      title: opc.titulo ? 'Vídeo: ' + opc.titulo : 'Vídeo da aula',
      allow: 'autoplay; fullscreen; picture-in-picture; encrypted-media',
      allowfullscreen: true,
      referrerpolicy: 'strict-origin',
      loading: 'eager'
    });
    AC.limpar(caixa);
    caixa.appendChild(iframe);

    function enviar(metodo, valor) {
      if (!iframe.contentWindow) return;
      iframe.contentWindow.postMessage(prov.comando(metodo, valor), prov.origem);
    }

    function aoMensagem(e) {
      if (e.source !== iframe.contentWindow || !prov.ehOrigem(e.origin)) return;
      var d = lerMensagem(e.data);
      if (!d) return;
      var r = prov.interpretar(d);
      if (!r) return;
      if (r.tipo === 'pronto') {
        pronto = true;
        prov.aoPronto(enviar);
        if (pos > 5 && !buscouInicio) { buscouInicio = true; var c = prov.irPara(pos); enviar(c[0], c[1]); }
      } else if (r.tipo === 'tempo') {
        // Antes de retomar, o player pode avisar 0 s: não sobrescreve a posição salva.
        if (r.seg > 0 || buscouInicio || pos <= 5) pos = r.seg;
        if (r.duracao) dur = r.duracao;
        if (opc.aoTempo) opc.aoTempo(pos, dur);
      } else if (r.tipo === 'fim') {
        if (dur) pos = dur;
        if (opc.aoFim) opc.aoFim();
      } else if (r.tipo === 'erro') {
        if (opc.aoErro) opc.aoErro('O vídeo não carregou.');
      }
    }
    window.addEventListener('message', aoMensagem);

    return {
      posicao: function () { return pos; },
      duracao: function () { return dur; },
      pronto: function () { return pronto; },
      tocar: function () { enviar(prov.tocar[0]); },
      irPara: function (s) { var c = prov.irPara(Math.max(0, s)); enviar(c[0], c[1]); },
      destruir: function () { window.removeEventListener('message', aoMensagem); AC.limpar(caixa); }
    };
  }

  window.AcademiaPlayer = Object.freeze({ criar: criar });
})();
