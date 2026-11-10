/*
  /academiadevirtudes/aluno/  · vitrine
  Avisos, "Continuar de onde parou" e os encontros em cards com progresso.
*/
(function () {
  'use strict';

  var AC = window.AC;
  var C = window.AcademiaConteudo;
  var CFG = window.ACADEMIA_CONFIG;
  var h = AC.h;
  var $ = AC.$;

  window.AcademiaAuth.proteger().then(function (ctx) {
    window.AcademiaLayout.montar(ctx);
    return Promise.all([C.avisos(), C.modulos(), C.conteudos(), C.progresso(ctx.perfil.id)]);
  }).then(function (r) {
    mostrarAvisos(r[0]);
    montar(r[1], r[2], r[3]);
  }).catch(function (err) { C.erro($('#encontros'), err); });

  function mostrarAvisos(avisos) {
    var caixa = $('#avisos');
    if (!avisos || !avisos.length) return;
    avisos.forEach(function (a) {
      caixa.appendChild(h('article', { class: 'ac-aviso' }, h('h2', null, a.titulo), a.texto ? h('p', null, a.texto) : null));
    });
    caixa.hidden = false;
  }

  function montar(modulos, conteudos, progresso) {
    var porId = {};
    modulos.forEach(function (m) { porId[m.id] = m; });
    // Só o que o aluno vê como aluno (o admin pré-visualiza rascunhos nas páginas do painel).
    modulos = modulos.filter(function (m) { return m.publicado; });
    conteudos = conteudos.filter(function (c) { return c.publicado && porId[c.modulo_id] && porId[c.modulo_id].publicado && C.liberado(porId[c.modulo_id]); });

    continuar(modulos, conteudos, progresso, porId);

    var alvo = AC.limpar($('#encontros'));
    if (!modulos.length) { alvo.appendChild(C.vazio('Os encontros vão aparecer aqui assim que forem publicados.')); return; }

    var lista = h('ul', { class: 'ac-cards' });
    modulos.forEach(function (m) {
      var doModulo = conteudos.filter(function (c) { return c.modulo_id === m.id; });
      var feitos = doModulo.filter(function (c) { return progresso[c.id] && progresso[c.id].concluido; }).length;
      var liberado = C.liberado(m);
      var corpo = h('div', { class: 'ac-card__corpo' },
        liberado ? null : h('span', { class: 'ac-selo ac-selo--breve' }, 'Em breve · ' + C.data(m.liberado_em)),
        h('h3', { class: 'ac-card__titulo' }, m.titulo),
        m.subtitulo ? h('p', { class: 'ac-card__sub' }, m.subtitulo) : null,
        liberado ? C.barra(feitos, doModulo.length) : null);
      var card = liberado
        ? h('a', { class: 'ac-card', href: CFG.rotas.encontro + '?id=' + encodeURIComponent(m.id) }, C.capa(m, 'ac-card__capa'), corpo)
        : h('div', { class: 'ac-card ac-card--embreve' }, C.capa(m, 'ac-card__capa'), corpo);
      lista.appendChild(h('li', null, card));
    });
    alvo.appendChild(lista);
    C.ajustarBarras(alvo);
  }

  // Último conteúdo começado e não concluído; senão, o primeiro ainda não concluído.
  function continuar(modulos, conteudos, progresso, porId) {
    if (!conteudos.length) return;
    var ordemModulo = {};
    modulos.forEach(function (m, i) { ordemModulo[m.id] = i; });
    var emOrdem = conteudos.slice().sort(function (a, b) {
      return (ordemModulo[a.modulo_id] - ordemModulo[b.modulo_id]) || (a.ordem - b.ordem);
    });
    var comecados = emOrdem.filter(function (c) { var p = progresso[c.id]; return p && !p.concluido; })
      .sort(function (a, b) { return progresso[b.id].atualizado_em > progresso[a.id].atualizado_em ? 1 : -1; });
    var alvo = comecados[0] || emOrdem.filter(function (c) { return !(progresso[c.id] && progresso[c.id].concluido); })[0];
    if (!alvo) return;
    var p = progresso[alvo.id];
    var meta = [porId[alvo.modulo_id].titulo, C.rotuloTipo(alvo.tipo), C.duracao(alvo.duracao_min)].filter(Boolean).join(' · ');
    if (p && p.posicao_seg > 5 && alvo.tipo === 'video') meta += ' · parou em ' + Math.floor(p.posicao_seg / 60) + ' min';
    $('#continuar').appendChild(h('a', { class: 'ac-continuar', href: CFG.rotas.aula + '?id=' + encodeURIComponent(alvo.id) },
      h('span', { class: 'ac-continuar__rotulo' }, comecados[0] ? 'Retomar' : 'Começar'),
      h('span', { class: 'ac-continuar__titulo' }, alvo.titulo),
      h('span', { class: 'ac-continuar__meta' }, meta)));
    $('#bloco-continuar').hidden = false;
  }
})();
