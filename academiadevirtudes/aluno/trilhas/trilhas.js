/*
  /academiadevirtudes/aluno/trilhas/  · todas as trilhas (26/11/2026)
  Um cartão por trilha (capa, nome, quantidade de aulas e progresso), na ordem do painel.
  Só aparecem trilhas com pelo menos uma aula visível para o aluno.
*/
(function () {
  'use strict';

  var AC = window.AC;
  var C = window.AcademiaConteudo;
  var CFG = window.ACADEMIA_CONFIG;
  var h = AC.h;
  var alvo = AC.$('#lista-trilhas');

  window.AcademiaAuth.proteger().then(function (ctx) {
    window.AcademiaLayout.montar(ctx);
    return Promise.all([C.trilhas(), C.aulas(), C.progresso(ctx.perfil.id)]);
  }).then(function (r) {
    var org = C.organizar(r[0], r[1], r[2]);
    AC.limpar(alvo);
    if (!org.trilhas.length) {
      alvo.appendChild(C.vazio(org.aulas.length ? 'As aulas ainda não estão organizadas em trilhas. Veja todas na página inicial.' : 'As primeiras trilhas serão publicadas em breve.'));
      return;
    }
    var grade = h('ul', { class: 'ac-grade' });
    org.trilhas.forEach(function (x) {
      var t = x.trilha;
      var total = x.aulas.length;
      grade.appendChild(h('li', null, h('a', { class: 'ac-cartao-aula ac-cartao-trilha', href: C.linkTrilha(t) },
        h('span', { class: 'ac-cartao-aula__capa' }, C.imagem(C.capaTrilhaUrl(x), 'ac-cartao-aula__img')),
        h('span', { class: 'ac-cartao-aula__corpo' },
          h('span', { class: 'ac-cartao-aula__rotulo' }, C.rotuloTrilha(x) + ' · ' + total + (total === 1 ? ' aula' : ' aulas')),
          h('span', { class: 'ac-cartao-aula__titulo' }, t.titulo),
          t.descricao ? h('span', { class: 'ac-cartao-trilha__descricao' }, C.resumo(t.descricao, 160)) : null,
          h('span', { class: 'ac-cartao-aula__meta' + (x.pct === 100 ? ' ac-cartao-aula__meta--feito' : '') },
            x.pct === 100 ? '✓ Trilha concluída' : x.feitas + ' de ' + total + (total === 1 ? ' concluída' : ' concluídas') + ' · ' + x.pct + '%'),
          C.barrinha(x.pct, 'Progresso em ' + t.titulo)))));
    });
    alvo.appendChild(grade);
    if (org.soltas.length) {
      alvo.appendChild(h('p', { class: 'ac-sub ac-trilhas-soltas' }, 'Há também aulas avulsas, fora das trilhas: ',
        h('a', { href: CFG.rotas.aluno + '#trilha-outras' }, 'ver em Outras aulas'), '.'));
    }
    C.ajustarBarras(alvo);
  }).catch(function (err) { C.erro(alvo, err); });
})();
