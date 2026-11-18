/*
  /academiadevirtudes/aluno/  · vitrine no estilo COR Academia (18/11/2026)
  1. Aula em destaque no topo (a marcada como "Destaque" no painel; senão a que o aluno está assistindo;
     senão a primeira que ele ainda não concluiu). Sem aula, fica o banner de boas-vindas do HTML.
  2. Avisos e busca por título.
  3. Onde você está crescendo: um cartão por trilha com o progresso.
  4. Continuar assistindo, uma fileira por trilha e "Outras aulas" (as que não têm trilha).
  5. Mais assistidas pelos alunos (função aulas_mais_vistas, migration 0008).
  6. Seu aproveitamento: aulas concluídas, minutos de estudo e trilhas concluídas.
*/
(function () {
  'use strict';

  var AC = window.AC;
  var C = window.AcademiaConteudo;
  var h = AC.h;
  var $ = AC.$;
  var estado = { aulas: [], trilhas: {}, listaTrilhas: [], progresso: {}, maisVistas: [], nome: '' };
  var BANNER_RESERVA = '/assets/aluno-banner-1600.webp';

  window.AcademiaAuth.proteger().then(function (ctx) {
    window.AcademiaLayout.montar(ctx);
    estado.nome = AC.primeiroNome(ctx.perfil && ctx.perfil.nome);
    return Promise.all([C.avisos(), C.trilhas(), C.aulas(), C.progresso(ctx.perfil.id), C.maisVistas(10)]);
  }).then(function (r) {
    mostrarAvisos(r[0]);
    estado.trilhas = C.porId(r[1]);
    estado.listaTrilhas = r[1] || [];
    // Só o que o aluno vê como aluno (o admin pré-visualiza rascunhos pela página da aula).
    estado.aulas = r[2].filter(C.visivelAluno);
    estado.progresso = r[3];
    estado.maisVistas = r[4];
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
  function prog(a) { return estado.progresso[a.id]; }
  function feita(a) { var p = prog(a); return !!(p && p.concluido); }
  function card(a, extra) {
    return h('li', { class: 'ac-fileira__item' }, C.cardAula(a, Object.assign({ trilha: trilhaDe(a), progresso: prog(a) }, extra || {})));
  }
  function aulasDaTrilha(t) { return estado.aulas.filter(function (a) { return a.modulo_id === t.id; }); }
  function trilhasVisiveis() { return estado.listaTrilhas.filter(function (t) { return aulasDaTrilha(t).length > 0; }); }

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
    var p = estado.progresso;
    var comecadas = aulas.filter(function (a) { return p[a.id] && !p[a.id].concluido; })
      .sort(function (a, b) { return String(p[b.id].atualizado_em).localeCompare(String(p[a.id].atualizado_em)); });

    heroi(aulas.filter(function (a) { return a.destaque; })[0] || comecadas[0] ||
      aulas.filter(function (a) { return !feita(a); })[0] || aulas[0]);

    crescendo(alvo);
    fileira(alvo, 'continuar', 'Continue assistindo', comecadas, { mostrarBarra: true });
    trilhasVisiveis().forEach(function (t) {
      fileira(alvo, 'trilha-' + t.id, t.titulo, aulasDaTrilha(t), {}, t.descricao);
    });
    // Aulas sem trilha (ou de trilha que não aparece) não podem sumir da vitrine.
    fileira(alvo, 'outras', 'Outras aulas', aulas.filter(function (a) { return !trilhaDe(a); }), {});
    maisAssistidas(alvo);
    aproveitamento(alvo);
    C.ajustarBarras(alvo);
  }

  /* ---------- 1. Aula em destaque ---------- */
  // Texto curto a partir da descrição (que pode ter markdown simples).
  function resumo(texto, max) {
    var t = String(texto || '').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[*_#>`]/g, '').replace(/\s+/g, ' ').trim();
    if (t.length <= max) return t;
    return t.slice(0, max).replace(/\s+\S*$/, '') + '…';
  }
  function capaGrande(a, t) {
    var propria = C.capaUrl(a.capa_path);
    if (propria) return propria;
    if (a.provedor === 'youtube' && C.youtubeIdValido(a.video_id)) return 'https://i.ytimg.com/vi/' + a.video_id + '/maxresdefault.jpg';
    return (t && C.capaUrl(t.capa_path)) || BANNER_RESERVA;
  }
  // Imagem grande com recuo: maxresdefault → hq720 → hqdefault → foto do auditório.
  // O YouTube às vezes responde com uma miniatura cinza de 120 px em vez de erro: também conta como falha.
  function imagemHeroi(url) {
    var img = h('img', { src: url, alt: '', decoding: 'async', fetchpriority: 'high' });
    function proxima() {
      var s = img.src;
      if (/\/maxresdefault\.jpg$/.test(s)) img.src = s.replace(/maxresdefault\.jpg$/, 'hq720.jpg');
      else if (/\/hq720\.jpg$/.test(s)) img.src = s.replace(/hq720\.jpg$/, 'hqdefault.jpg');
      else if (s.indexOf(BANNER_RESERVA) < 0) img.src = BANNER_RESERVA;
    }
    img.addEventListener('error', proxima);
    img.addEventListener('load', function () { if (img.naturalWidth && img.naturalWidth <= 120) proxima(); });
    return img;
  }
  function heroi(a) {
    var antigo = $('.ac-banner');
    if (!a || !antigo) return;
    var t = trilhaDe(a);
    var p = prog(a);
    var feito = feita(a);
    var pdf = a.tipo === 'pdf';
    var rotulo = pdf ? (feito ? 'Abrir de novo' : 'Abrir material')
      : feito ? 'Assistir de novo' : (p && p.posicao_seg ? 'Continuar' : 'Começar agora');
    var minutos = p && !feito && p.posicao_seg && a.duracao_min && !pdf
      ? 'Você parou em ' + Math.max(1, Math.round(p.posicao_seg / 60)) + ' de ' + a.duracao_min + ' min' : '';
    var meta = [t ? t.titulo : '', C.metaAula(a)].filter(Boolean).join(' · ');
    var texto = resumo(a.descricao, 190);
    var href = window.ACADEMIA_CONFIG.rotas.aula + '?id=' + encodeURIComponent(a.id);

    var novo = h('section', { class: 'ac-banner ac-banner--aula', 'aria-labelledby': 'destaque-titulo' },
      h('div', { class: 'ac-banner__fundo' }, imagemHeroi(capaGrande(a, t))),
      h('div', { class: 'ac-banner__texto' },
        h('p', { class: 'ac-banner__ola' }, 'Olá, ' + (estado.nome || 'aluno') + '! Boas-vindas à Academia de Virtudes.'),
        meta ? h('p', { class: 'ac-banner__marca' }, meta) : null,
        h('h1', { class: 'ac-banner__titulo', id: 'destaque-titulo' }, a.titulo),
        texto ? h('p', { class: 'ac-banner__sub' }, texto) : null,
        minutos ? h('p', { class: 'ac-banner__parou' }, minutos) : null,
        h('div', { class: 'ac-banner__acoes' },
          h('a', { class: 'ac-btn', href: href }, h('span', { 'aria-hidden': 'true' }, pdf ? '↗' : '▶'), rotulo),
          t ? h('a', { class: 'ac-btn ac-btn--vidro', href: '#trilha-' + t.id }, 'Ver trilha completa') : null)));
    antigo.parentNode.replaceChild(novo, antigo);
  }

  /* ---------- 3. Onde você está crescendo ---------- */
  function crescendo(alvo) {
    var trilhas = trilhasVisiveis();
    if (!trilhas.length) return;
    var lista = h('ul', { class: 'ac-crescendo__lista' });
    trilhas.forEach(function (t) {
      var aulas = aulasDaTrilha(t);
      var feitas = aulas.filter(feita).length;
      var pct = Math.round(feitas / aulas.length * 100);
      lista.appendChild(h('li', null,
        h('a', { class: 'ac-crescendo__cartao' + (pct === 100 ? ' ac-crescendo__cartao--completa' : ''), href: '#trilha-' + t.id },
          h('span', { class: 'ac-crescendo__icone', 'aria-hidden': 'true' },
            h('img', { src: '/assets/academia-de-virtudes-simbolo.webp', alt: '', width: '26', height: '26' })),
          h('span', { class: 'ac-crescendo__texto' },
            h('span', { class: 'ac-crescendo__nome' }, t.titulo),
            h('span', { class: 'ac-crescendo__conta' }, feitas + ' de ' + aulas.length + ' aula' + (aulas.length === 1 ? '' : 's'))),
          h('span', { class: 'ac-crescendo__pct' }, pct + '%'),
          h('span', { class: 'ac-crescendo__trilho', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(pct), 'aria-label': 'Progresso em ' + t.titulo },
            h('span', { class: 'ac-crescendo__barra', 'data-pct': String(pct) })))));
    });
    alvo.appendChild(h('section', { class: 'ac-crescendo', 'aria-labelledby': 'crescendo-titulo' },
      h('h2', { class: 'ac-fileira__titulo', id: 'crescendo-titulo' }, 'Onde você está crescendo'),
      lista));
  }

  /* ---------- 5. Mais assistidas pelos alunos ---------- */
  function maisAssistidas(alvo) {
    var porId = C.porId(estado.aulas);
    var aulas = estado.maisVistas.map(function (id) { return porId[id]; }).filter(Boolean);
    if (aulas.length < 2) return;
    fileira(alvo, 'mais-assistidas', 'Mais assistidas pelos alunos', aulas, { numerar: true });
  }

  /* ---------- 6. Seu aproveitamento ---------- */
  function aproveitamento(alvo) {
    var aulas = estado.aulas;
    var feitas = aulas.filter(feita).length;
    var seg = 0;
    aulas.forEach(function (a) {
      var p = prog(a);
      if (!p || a.tipo !== 'video') return;
      var total = (a.duracao_min || 0) * 60;
      seg += p.concluido && total ? total : (total ? Math.min(p.posicao_seg || 0, total) : (p.posicao_seg || 0));
    });
    var minutos = Math.round(seg / 60);
    var trilhas = trilhasVisiveis();
    var trilhasFeitas = trilhas.filter(function (t) { return aulasDaTrilha(t).every(feita); }).length;
    function numero(valor, rotulo) { return h('li', { class: 'ac-numero' }, h('strong', null, valor), h('span', null, rotulo)); }
    alvo.appendChild(h('section', { class: 'ac-aproveitamento', 'aria-labelledby': 'aproveitamento-titulo' },
      h('h2', { class: 'ac-fileira__titulo', id: 'aproveitamento-titulo' }, 'Seu aproveitamento'),
      h('ul', { class: 'ac-numeros ac-aproveitamento__numeros' },
        numero(feitas + '/' + aulas.length, aulas.length === 1 ? 'aula concluída' : 'aulas concluídas'),
        numero(C.duracao(minutos) || '0 min', 'de estudo'),
        trilhas.length ? numero(trilhasFeitas + '/' + trilhas.length, trilhas.length === 1 ? 'trilha concluída' : 'trilhas concluídas') : null)));
  }

  /* ---------- Fileira com rolagem horizontal ---------- */
  function fileira(alvo, id, titulo, aulas, opcoes, descricao) {
    if (!aulas.length) return;
    var idTitulo = 'f-' + id;
    var trilho = h('ul', { class: 'ac-fileira__trilho', 'aria-labelledby': idTitulo });
    aulas.forEach(function (a, i) {
      var extra = Object.assign({}, opcoes);
      if (opcoes.numerar) extra.posicao = i + 1;
      trilho.appendChild(card(a, extra));
    });
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
