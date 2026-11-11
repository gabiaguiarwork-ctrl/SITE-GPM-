/*
  /academiadevirtudes/aluno/  · vitrine no estilo plataforma de streaming
  Avisos, destaque no topo, busca por título e fileiras com rolagem horizontal:
  Continuar assistindo, Novidades, uma por trilha, Videoaulas e Materiais em PDF.
*/
(function () {
  'use strict';

  var AC = window.AC;
  var C = window.AcademiaConteudo;
  var CFG = window.ACADEMIA_CONFIG;
  var h = AC.h;
  var $ = AC.$;
  var estado = { aulas: [], trilhas: {}, progresso: {} };

  window.AcademiaAuth.proteger().then(function (ctx) {
    window.AcademiaLayout.montar(ctx);
    return Promise.all([C.avisos(), C.trilhas(), C.aulas(), C.progresso(ctx.perfil.id)]);
  }).then(function (r) {
    mostrarAvisos(r[0]);
    estado.trilhas = C.porId(r[1]);
    estado.listaTrilhas = r[1];
    // Só o que o aluno vê como aluno (o admin pré-visualiza rascunhos pela página da aula).
    estado.aulas = r[2].filter(C.visivelAluno);
    estado.progresso = r[3];
    montar();
    $('#busca').addEventListener('input', buscar);
  }).catch(function (err) { C.erro($('#fileiras'), err); });

  function mostrarAvisos(avisos) {
    var caixa = $('#avisos');
    if (!avisos || !avisos.length) return;
    avisos.forEach(function (a) {
      caixa.appendChild(h('article', { class: 'ac-aviso' }, h('h2', null, a.titulo), a.texto ? h('p', null, a.texto) : null));
    });
    caixa.hidden = false;
  }

  function trilhaDe(a) { return a.modulo_id ? estado.trilhas[a.modulo_id] : null; }
  function card(a, extra) {
    return h('li', { class: 'ac-fileira__item' }, C.cardAula(a, Object.assign({ trilha: trilhaDe(a), progresso: estado.progresso[a.id] }, extra || {})));
  }

  function montar() {
    var alvo = AC.limpar($('#fileiras'));
    var aulas = estado.aulas;
    if (!aulas.length) {
      alvo.appendChild(h('div', { class: 'ac-vazio-grande' },
        h('img', { src: '/assets/academia-de-virtudes-simbolo.webp', alt: '', width: '72', height: '72' }),
        h('p', null, 'As primeiras aulas serão publicadas em breve.')));
      $('#busca-caixa').hidden = true;
      return;
    }
    destaque(aulas);

    var prog = estado.progresso;
    var comecadas = aulas.filter(function (a) { var p = prog[a.id]; return p && !p.concluido; })
      .sort(function (a, b) { return String(prog[b.id].atualizado_em).localeCompare(String(prog[a.id].atualizado_em)); });
    var novidades = aulas.slice().sort(function (a, b) { return C.disponivelEm(b) - C.disponivelEm(a); }).slice(0, 12);

    fileira(alvo, 'continuar', 'Continuar assistindo', comecadas, { mostrarBarra: true });
    fileira(alvo, 'novidades', 'Novidades', novidades, { mostrarTrilha: true });
    (estado.listaTrilhas || []).forEach(function (t) {
      fileira(alvo, 'trilha-' + t.id, t.titulo, aulas.filter(function (a) { return a.modulo_id === t.id; }), {}, t.descricao);
    });
    fileira(alvo, 'videoaulas', 'Videoaulas', aulas.filter(function (a) { return a.tipo === 'video'; }), { mostrarTrilha: true });
    fileira(alvo, 'pdfs', 'Materiais em PDF', aulas.filter(function (a) { return a.tipo === 'pdf'; }), { mostrarTrilha: true });
    C.ajustarBarras(alvo);
  }

  /* ---------- Destaque no topo ---------- */
  function destaque(aulas) {
    var escolhidas = aulas.filter(function (a) { return a.destaque; });
    var lista = (escolhidas.length ? escolhidas : aulas).slice().sort(function (a, b) { return C.disponivelEm(b) - C.disponivelEm(a); });
    var a = lista[0];
    if (!a) return;
    var p = estado.progresso[a.id];
    var t = trilhaDe(a);
    var comecou = p && !p.concluido && (p.posicao_seg > 5 || a.tipo !== 'video');
    var rotulo = a.tipo === 'pdf' ? 'Abrir material' : comecou ? 'Continuar' : 'Assistir';
    var caixa = AC.limpar($('#destaque'));
    caixa.appendChild(h('div', { class: 'ac-destaque__fundo', 'aria-hidden': 'true' }, C.imagem(C.capaAulaUrl(a, t), 'ac-destaque__img', a.tipo)));
    caixa.appendChild(h('div', { class: 'ac-destaque__texto' },
      h('p', { class: 'ac-destaque__rotulo' }, [t ? t.titulo : '', C.metaAula(a)].filter(Boolean).join(' · ')),
      h('h2', { class: 'ac-destaque__titulo' }, a.titulo),
      a.descricao ? h('p', { class: 'ac-destaque__descricao' }, a.descricao) : null,
      h('div', { class: 'ac-destaque__acoes' },
        h('a', { class: 'ac-btn', href: CFG.rotas.aula + '?id=' + encodeURIComponent(a.id) }, (a.tipo === 'video' ? '▶ ' : '') + rotulo))));
    caixa.hidden = false;
  }

  /* ---------- Fileira com rolagem horizontal ---------- */
  function fileira(alvo, id, titulo, aulas, opcoes, descricao) {
    if (!aulas.length) return;
    var idTitulo = 'f-' + id;
    var trilho = h('ul', { class: 'ac-fileira__trilho', 'aria-labelledby': idTitulo });
    aulas.forEach(function (a) { trilho.appendChild(card(a, opcoes)); });
    var ant = h('button', { type: 'button', class: 'ac-fileira__seta', 'aria-label': 'Ver anteriores em ' + titulo, disabled: true }, '‹');
    var prox = h('button', { type: 'button', class: 'ac-fileira__seta', 'aria-label': 'Ver próximas em ' + titulo }, '›');
    function andar(dir) { trilho.scrollBy({ left: dir * Math.max(240, trilho.clientWidth * 0.85), behavior: 'smooth' }); }
    function atualizar() {
      ant.disabled = trilho.scrollLeft <= 4;
      prox.disabled = trilho.scrollLeft + trilho.clientWidth >= trilho.scrollWidth - 4;
    }
    ant.addEventListener('click', function () { andar(-1); });
    prox.addEventListener('click', function () { andar(1); });
    trilho.addEventListener('scroll', atualizar, { passive: true });
    window.addEventListener('resize', atualizar);
    alvo.appendChild(h('section', { class: 'ac-fileira', id: id, 'aria-labelledby': idTitulo },
      h('div', { class: 'ac-fileira__topo' },
        h('div', null, h('h2', { class: 'ac-fileira__titulo', id: idTitulo }, titulo),
          descricao ? h('p', { class: 'ac-fileira__descricao' }, descricao) : null),
        h('div', { class: 'ac-fileira__setas' }, ant, prox)),
      trilho));
    requestAnimationFrame(atualizar);
  }

  /* ---------- Busca por título ---------- */
  function buscar() {
    var termo = C.normalizar(this.value.trim());
    var res = $('#resultados');
    var buscando = termo.length > 0;
    $('#fileiras').hidden = buscando;
    $('#destaque').hidden = buscando || !$('#destaque').firstChild;
    res.hidden = !buscando;
    if (!buscando) return;
    AC.limpar(res);
    var achadas = estado.aulas.filter(function (a) {
      var t = trilhaDe(a);
      return C.normalizar(a.titulo).indexOf(termo) >= 0 || (t && C.normalizar(t.titulo).indexOf(termo) >= 0);
    });
    res.appendChild(h('h2', { class: 'ac-fileira__titulo' }, achadas.length ? achadas.length + ' aula' + (achadas.length === 1 ? '' : 's') + ' encontrada' + (achadas.length === 1 ? '' : 's') : 'Nenhuma aula encontrada'));
    if (!achadas.length) { res.appendChild(C.vazio('Tente outra palavra do título.')); return; }
    var grade = h('ul', { class: 'ac-grade-aulas' });
    achadas.forEach(function (a) { grade.appendChild(card(a, { mostrarTrilha: true })); });
    res.appendChild(grade);
  }
})();
