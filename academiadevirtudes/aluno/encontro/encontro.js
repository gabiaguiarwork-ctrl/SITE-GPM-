/*
  /academiadevirtudes/aluno/encontro/?id=<uuid>
  Descrição do encontro e lista dos conteúdos, com o que já foi concluído.
  Admin vê também os rascunhos (marcados), para pré-visualizar como aluno.
*/
(function () {
  'use strict';

  var AC = window.AC;
  var C = window.AcademiaConteudo;
  var CFG = window.ACADEMIA_CONFIG;
  var h = AC.h;
  var alvo = AC.$('#encontro');
  var id = AC.parametro('id');

  window.AcademiaAuth.proteger().then(function (ctx) {
    window.AcademiaLayout.montar(ctx);
    if (!C.idValido(id)) return naoEncontrado();
    return Promise.all([C.modulo(id), C.conteudos(id), C.progresso(ctx.perfil.id)]).then(function (r) {
      if (!r[0]) return naoEncontrado();
      montar(r[0], r[1], r[2]);
    });
  }).catch(function (err) { C.erro(alvo, err); });

  function naoEncontrado() {
    AC.limpar(alvo);
    alvo.appendChild(h('h1', null, 'Encontro não encontrado'));
    alvo.appendChild(C.vazio('Este encontro não existe ou ainda não está disponível.'));
  }

  function montar(m, conteudos, progresso) {
    document.title = m.titulo + ' · Área do Aluno · Academia de Virtudes';
    AC.limpar(alvo);
    var liberado = C.liberado(m);
    var feitos = conteudos.filter(function (c) { return c.publicado && progresso[c.id] && progresso[c.id].concluido; }).length;
    var publicados = conteudos.filter(function (c) { return c.publicado; }).length;

    alvo.appendChild(h('div', { class: 'ac-encontro-topo' },
      C.capa(m, 'ac-capa'),
      h('div', null,
        m.publicado ? null : h('span', { class: 'ac-selo ac-selo--rascunho' }, 'Rascunho · só a equipe vê'),
        h('h1', null, m.titulo),
        m.subtitulo ? h('p', { class: 'ac-sub' }, m.subtitulo) : null,
        m.descricao ? C.markdown(m.descricao) : null,
        liberado && publicados ? C.barra(feitos, publicados) : null)));

    if (!liberado) {
      alvo.appendChild(C.vazio('Este encontro fica disponível a partir de ' + C.data(m.liberado_em, true) + '.'));
      return;
    }
    alvo.appendChild(h('h2', { class: 'ac-rotulo-secao' }, 'Conteúdos'));
    if (!conteudos.length) { alvo.appendChild(C.vazio('O conteúdo deste encontro será publicado em breve.')); return; }

    var lista = h('ul', { class: 'ac-lista' });
    conteudos.forEach(function (c) {
      var feito = progresso[c.id] && progresso[c.id].concluido;
      var meta = [C.rotuloTipo(c.tipo), C.duracao(c.duracao_min), c.publicado ? '' : 'Rascunho'].filter(Boolean).join(' · ');
      lista.appendChild(h('li', null,
        h('a', { class: 'ac-item' + (feito ? ' ac-item--feito' : ''), href: CFG.rotas.aula + '?id=' + encodeURIComponent(c.id) },
          h('span', { class: 'ac-item__icone', 'aria-hidden': 'true' }, feito ? '✓' : C.rotuloTipo(c.tipo).slice(0, 3).toUpperCase()),
          h('span', null, h('span', { class: 'ac-item__titulo' }, c.titulo), h('br'), h('span', { class: 'ac-item__meta' }, meta)),
          feito ? h('span', { class: 'ac-item__estado' }, 'Concluído') : h('span', { class: 'ac-sr-only' }, 'Não concluído'))));
    });
    alvo.appendChild(lista);
    C.ajustarBarras(alvo);
  }
})();
