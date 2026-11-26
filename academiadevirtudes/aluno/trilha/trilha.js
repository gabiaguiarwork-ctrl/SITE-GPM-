/*
  /academiadevirtudes/aluno/trilha/?id=<uuid>  · página de uma trilha (26/11/2026)
  Capa, nome, descrição, progresso, botão para a próxima aula não concluída
  e a lista completa das aulas em ordem (cartões), com o selo "Continuar" na próxima.
*/
(function () {
  'use strict';

  var AC = window.AC;
  var C = window.AcademiaConteudo;
  var CFG = window.ACADEMIA_CONFIG;
  var h = AC.h;
  var alvo = AC.$('#trilha');
  var id = AC.parametro('id');

  window.AcademiaAuth.proteger().then(function (ctx) {
    window.AcademiaLayout.montar(ctx);
    if (!C.idValido(id)) return naoEncontrada();
    return Promise.all([C.trilhas(), C.aulas(), C.progresso(ctx.perfil.id)]).then(function (r) {
      var org = C.organizar(r[0], r[1], r[2]);
      var x = org.trilhas.filter(function (y) { return y.trilha.id === id; })[0];
      if (!x) return naoEncontrada();
      montar(x, r[2]);
    });
  }).catch(function (err) { C.erro(alvo, err); });

  function naoEncontrada() {
    AC.limpar(alvo);
    alvo.appendChild(h('a', { class: 'ac-voltar', href: CFG.rotas.trilhas }, '← Todas as trilhas'));
    alvo.appendChild(h('h1', null, 'Trilha não encontrada'));
    alvo.appendChild(C.vazio('Esta trilha não existe ou ainda não tem aulas disponíveis.'));
  }

  function montar(x, progresso) {
    var t = x.trilha;
    var total = x.aulas.length;
    document.title = t.titulo + ' · Área do Aluno · Academia de Virtudes';
    AC.limpar(alvo);
    alvo.appendChild(h('a', { class: 'ac-voltar', href: CFG.rotas.trilhas }, '← Todas as trilhas'));

    var acao = null;
    if (x.proxima) {
      var p = progresso[x.proxima.id];
      var comecou = x.feitas > 0 || (p && p.posicao_seg > 0);
      acao = h('a', { class: 'ac-btn', href: CFG.rotas.aula + '?id=' + encodeURIComponent(x.proxima.id) },
        comecou ? '▶ Continuar: Aula ' + (x.indiceProxima + 1) : '▶ Começar a trilha');
    } else {
      acao = h('a', { class: 'ac-btn ac-btn--contorno', href: CFG.rotas.aula + '?id=' + encodeURIComponent(x.aulas[0].id) }, '✓ Trilha concluída · Rever do início');
    }
    alvo.appendChild(h('section', { class: 'ac-trilha-topo', 'aria-labelledby': 'trilha-titulo' },
      C.imagem(C.capaTrilhaUrl(x), 'ac-trilha-capa'),
      h('div', null,
        h('p', { class: 'ac-rotulo-trilha' }, C.rotuloTrilha(x) + ' · ' + total + (total === 1 ? ' aula' : ' aulas')),
        h('h1', { id: 'trilha-titulo' }, t.titulo),
        t.descricao ? h('p', { class: 'ac-trilha__descricao' }, t.descricao) : null,
        h('div', { class: 'ac-trilha-topo__prog' },
          h('span', null, x.feitas + ' de ' + total + (total === 1 ? ' aula concluída' : ' aulas concluídas') + ' · ' + x.pct + '%'),
          C.barrinha(x.pct, 'Progresso em ' + t.titulo)),
        acao)));

    var grade = h('ol', { class: 'ac-grade', 'aria-labelledby': 'aulas-titulo' });
    x.aulas.forEach(function (a, i) {
      grade.appendChild(h('li', null, C.cardAula(a, {
        trilha: t, progresso: progresso[a.id], rotulo: 'Aula ' + (i + 1),
        continuar: x.proxima && a.id === x.proxima.id && x.feitas > 0
      })));
    });
    alvo.appendChild(h('section', { 'aria-labelledby': 'aulas-titulo' },
      h('h2', { class: 'ac-secao-titulo', id: 'aulas-titulo' }, 'Aulas da trilha'), grade));
    C.ajustarBarras(alvo);
  }
})();
