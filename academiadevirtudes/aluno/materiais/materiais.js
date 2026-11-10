/*
  /academiadevirtudes/aluno/materiais/
  Biblioteca com todos os materiais (PDF) dos encontros liberados, com filtro por encontro.
  O download é por URL assinada de 60 s, gerada no clique.
*/
(function () {
  'use strict';

  var AC = window.AC;
  var C = window.AcademiaConteudo;
  var CFG = window.ACADEMIA_CONFIG;
  var h = AC.h;
  var $ = AC.$;
  var itens = [];

  window.AcademiaAuth.proteger().then(function (ctx) {
    window.AcademiaLayout.montar(ctx);
    return Promise.all([C.modulos(), C.conteudos()]);
  }).then(function (r) {
    var porId = {};
    var modulos = r[0].filter(function (m) { return m.publicado && C.liberado(m); });
    modulos.forEach(function (m) { porId[m.id] = m; });
    itens = r[1].filter(function (c) { return c.publicado && c.arquivo_path && porId[c.modulo_id]; })
      .map(function (c) { return { c: c, m: porId[c.modulo_id] }; });

    var filtro = $('#filtro');
    modulos.forEach(function (m) {
      if (itens.some(function (i) { return i.m.id === m.id; })) filtro.appendChild(h('option', { value: m.id }, m.titulo));
    });
    var inicial = AC.parametro('encontro');
    if (C.idValido(inicial) && porId[inicial]) filtro.value = inicial;
    filtro.addEventListener('change', listar);
    listar();
  }).catch(function (err) { C.erro($('#materiais'), err); });

  function listar() {
    var sel = $('#filtro').value;
    var alvo = AC.limpar($('#materiais'));
    var lista = itens.filter(function (i) { return !sel || i.m.id === sel; });
    if (!lista.length) { alvo.appendChild(C.vazio('Ainda não há materiais publicados.')); return; }
    var ul = h('ul', { class: 'ac-lista' });
    lista.forEach(function (i) {
      ul.appendChild(h('li', { class: 'ac-material' },
        h('div', null,
          h('p', { class: 'ac-material__titulo' }, i.c.arquivo_nome || i.c.titulo),
          h('p', { class: 'ac-material__meta' }, i.m.titulo + ' · ',
            h('a', { href: CFG.rotas.aula + '?id=' + encodeURIComponent(i.c.id) }, i.c.titulo))),
        C.botaoBaixar(i.c)));
    });
    alvo.appendChild(ul);
  }
})();
