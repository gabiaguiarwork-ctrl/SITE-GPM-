/*
  /academiadevirtudes/aluno/  · vitrine organizada por trilhas (tema claro, 26/11/2026)
  1. Banner fixo da Academia (A Escola de Atenas) com uma linha pessoal:
     aula em andamento → "Você parou na aula X" + "Continuar de onde parei";
     senão → boas-vindas + "Começar pela primeira aula" (primeira aula da primeira trilha).
  2. Avisos.
  3. Chips de trilha (filtram a página) e busca por título (aulas e PDFs).
  4. Uma seção por trilha, na ordem do painel: rótulo, nome, descrição, progresso,
     "Ver trilha completa →" e a fileira de cartões (começando na próxima aula não concluída).
  5. "Outras aulas" (sem trilha), só se existir alguma.
  6. "Onde você está crescendo" e "Seu aproveitamento".
  O campo "Destaque" do painel não controla mais o banner: vira o selo "Em destaque" no cartão.
*/
(function () {
  'use strict';

  var AC = window.AC;
  var C = window.AcademiaConteudo;
  var CFG = window.ACADEMIA_CONFIG;
  var h = AC.h;
  var $ = AC.$;
  var estado = { org: null, trilhas: {}, progresso: {}, nome: '', filtro: 'todas' };

  window.AcademiaAuth.proteger().then(function (ctx) {
    window.AcademiaLayout.montar(ctx);
    estado.nome = AC.primeiroNome(ctx.perfil && ctx.perfil.nome) || '';
    return Promise.all([C.avisos(), C.trilhas(), C.aulas(), C.progresso(ctx.perfil.id)]);
  }).then(function (r) {
    mostrarAvisos(r[0]);
    estado.trilhas = C.porId(r[1]);
    estado.progresso = r[3];
    // Só o que o aluno vê como aluno (o admin pré-visualiza rascunhos pela página da aula).
    estado.org = C.organizar(r[1], r[2], r[3]);
    montar();
    $('#busca').addEventListener('input', buscar);
  }).catch(function (err) { C.erro($('#trilhas'), err); });

  function mostrarAvisos(avisos) {
    var caixa = $('#avisos');
    if (!avisos || !avisos.length) return;
    avisos.forEach(function (a) {
      caixa.appendChild(h('article', { class: 'ac-aviso' }, h('h2', null, a.titulo), a.texto ? h('p', null, a.texto) : null));
    });
    caixa.hidden = false;
  }

  function prog(a) { return estado.progresso[a.id]; }
  function feita(a) { var p = prog(a); return !!(p && p.concluido); }
  function trilhaDe(a) { return a.modulo_id ? estado.trilhas[a.modulo_id] : null; }
  function linkAula(a) { return CFG.rotas.aula + '?id=' + encodeURIComponent(a.id); }

  function montar() {
    var org = estado.org;
    var alvo = AC.limpar($('#trilhas'));
    banner();
    if (!org.aulas.length) {
      alvo.appendChild(h('div', { class: 'ac-vazio-grande' },
        h('img', { src: '/assets/academia-de-virtudes-simbolo.webp', alt: '', width: '72', height: '72' }),
        h('p', null, 'As primeiras aulas serão publicadas em breve.')));
      $('#barra').hidden = true;
      return;
    }
    chips();
    org.trilhas.forEach(function (x) { alvo.appendChild(secaoTrilha(x)); });
    if (org.soltas.length) alvo.appendChild(secaoOutras(org.soltas));
    alvo.appendChild(lado());
    C.ajustarBarras(alvo);
  }

  /* ---------- 1. Banner ---------- */
  function banner() {
    var org = estado.org;
    var p = estado.progresso;
    var ola = AC.limpar($('#banner-ola'));
    var botao = $('#banner-principal');
    var nome = estado.nome ? ', ' + estado.nome : '';
    // Aula em andamento: a última que o aluno abriu e não concluiu
    var andamento = org.aulas.filter(function (a) { return p[a.id] && !p[a.id].concluido && (p[a.id].posicao_seg > 0 || a.tipo !== 'video'); })
      .sort(function (a, b) { return String(p[b.id].atualizado_em).localeCompare(String(p[a.id].atualizado_em)); })[0];
    if (andamento) {
      ola.appendChild(document.createTextNode('Olá' + nome + '. Você parou na aula '));
      ola.appendChild(h('strong', null, andamento.titulo));
      ola.appendChild(document.createTextNode('.'));
      botao.textContent = '▶ Continuar de onde parei';
      botao.href = linkAula(andamento);
      botao.hidden = false;
      return;
    }
    ola.appendChild(document.createTextNode('Olá' + nome + '. Boas-vindas à Academia de Virtudes.'));
    var primeira = org.trilhas.length ? org.trilhas[0].aulas[0] : org.aulas[0];
    if (primeira) {
      botao.textContent = '▶ Começar pela primeira aula';
      botao.href = linkAula(primeira);
      botao.hidden = false;
    }
    if (!org.aulas.length) $('#banner-trilhas').hidden = true;
  }

  /* ---------- 3. Chips de trilha ---------- */
  function chips() {
    var caixa = AC.limpar($('#chips'));
    var opcoes = [{ id: 'todas', nome: 'Todas' }].concat(estado.org.trilhas.map(function (x) { return { id: x.trilha.id, nome: x.trilha.titulo }; }));
    if (estado.org.soltas.length && estado.org.trilhas.length) opcoes.push({ id: 'outras', nome: 'Outras aulas' });
    if (opcoes.length < 3) { caixa.hidden = true; return; } // só uma trilha: o chip não ajuda
    opcoes.forEach(function (o) {
      var b = h('button', { type: 'button', class: 'ac-chip', 'aria-pressed': o.id === estado.filtro ? 'true' : 'false', 'data-filtro': o.id }, o.nome);
      b.addEventListener('click', function () { filtrar(o.id); });
      caixa.appendChild(b);
    });
  }
  function filtrar(id) {
    estado.filtro = id;
    AC.$$('#chips .ac-chip').forEach(function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-filtro') === id ? 'true' : 'false'); });
    var busca = $('#busca');
    if (busca.value) { busca.value = ''; mostrarBusca(false); }
    AC.$$('#trilhas [data-trilha]').forEach(function (s) { s.hidden = id !== 'todas' && s.getAttribute('data-trilha') !== id; });
    var lado = $('#trilhas .ac-lado');
    if (lado) lado.hidden = id !== 'todas';
  }

  /* ---------- 4. Seção de uma trilha ---------- */
  function rotuloAula(i) { return 'Aula ' + (i + 1); }
  function secaoTrilha(x) {
    var t = x.trilha;
    var idTitulo = 'trilha-titulo-' + t.id;
    // A fileira começa na próxima aula não concluída (as anteriores ficam na página da trilha).
    var total = x.aulas.length;
    // (mostra também a anterior, já concluída, para dar contexto)
    var inicio = x.indiceProxima > 1 ? Math.min(x.indiceProxima - 1, Math.max(0, total - 4)) : 0;
    var fila = h('ul', { class: 'ac-fila ac-fila--resumo', 'aria-labelledby': idTitulo });
    x.aulas.slice(inicio).forEach(function (a, k) {
      var i = inicio + k;
      fila.appendChild(h('li', null, C.cardAula(a, { trilha: t, progresso: prog(a), rotulo: rotuloAula(i) })));
    });
    var conta = x.feitas + ' de ' + total + (total === 1 ? ' aula' : ' aulas') + (x.feitas ? (total === 1 ? ' concluída' : ' concluídas') : '');
    return h('section', { class: 'ac-trilha', id: 'trilha-' + t.id, 'data-trilha': t.id, 'aria-labelledby': idTitulo },
      h('div', { class: 'ac-trilha__topo' },
        h('div', null,
          h('p', { class: 'ac-rotulo-trilha' }, C.rotuloTrilha(x)),
          h('h2', { class: 'ac-trilha__titulo', id: idTitulo }, h('a', { href: C.linkTrilha(t) }, t.titulo)),
          t.descricao ? h('p', { class: 'ac-trilha__descricao' }, C.resumo(t.descricao, 200)) : null),
        h('div', { class: 'ac-trilha__prog' },
          h('span', null, conta),
          C.barrinha(x.pct, 'Progresso em ' + t.titulo),
          h('a', { class: 'ac-link-seta', href: C.linkTrilha(t) }, 'Ver trilha completa →'))),
      fila);
  }
  function secaoOutras(aulas) {
    var fila = h('ul', { class: 'ac-fila', 'aria-labelledby': 'trilha-titulo-outras' });
    aulas.forEach(function (a) { fila.appendChild(h('li', null, C.cardAula(a, { progresso: prog(a), rotulo: a.tipo === 'pdf' ? 'Material' : 'Aula' }))); });
    return h('section', { class: 'ac-trilha', id: 'trilha-outras', 'data-trilha': 'outras', 'aria-labelledby': 'trilha-titulo-outras' },
      h('div', { class: 'ac-trilha__topo' },
        h('div', null, h('h2', { class: 'ac-trilha__titulo', id: 'trilha-titulo-outras' }, 'Outras aulas'),
          h('p', { class: 'ac-trilha__descricao' }, 'Aulas e materiais avulsos, fora das trilhas.'))),
      fila);
  }

  /* ---------- 6. Crescimento e aproveitamento ---------- */
  function lado() {
    var org = estado.org;
    var caixas = [];
    if (org.trilhas.length) {
      var lista = h('ul', { class: 'ac-crescendo' });
      org.trilhas.forEach(function (x) {
        lista.appendChild(h('li', null, h('a', { href: C.linkTrilha(x.trilha) },
          h('b', null, x.trilha.titulo),
          h('small', null, x.feitas + ' de ' + x.aulas.length + ' · ' + x.pct + '%'),
          C.barrinha(x.pct, 'Progresso em ' + x.trilha.titulo))));
      });
      caixas.push(h('section', { class: 'ac-caixa', 'aria-labelledby': 'crescendo-titulo' },
        h('h2', { class: 'ac-caixa__titulo', id: 'crescendo-titulo' }, 'Onde você está crescendo'), lista));
    }
    var feitas = org.aulas.filter(feita).length;
    var seg = 0;
    org.aulas.forEach(function (a) {
      var p = prog(a);
      if (!p || a.tipo !== 'video') return;
      var total = (a.duracao_min || 0) * 60;
      seg += p.concluido && total ? total : (total ? Math.min(p.posicao_seg || 0, total) : (p.posicao_seg || 0));
    });
    var horas = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(seg / 3600);
    var materiais = org.aulas.filter(function (a) { return a.tipo === 'pdf' && feita(a); }).length;
    function stat(rotulo, valor) { return h('li', null, h('span', null, rotulo), h('b', null, String(valor))); }
    caixas.push(h('section', { class: 'ac-caixa', 'aria-labelledby': 'aproveitamento-titulo' },
      h('h2', { class: 'ac-caixa__titulo', id: 'aproveitamento-titulo' }, 'Seu aproveitamento'),
      h('ul', { class: 'ac-stats' },
        stat('Aulas concluídas', feitas + ' de ' + org.aulas.length),
        stat('Horas assistidas', horas),
        stat('Materiais concluídos', materiais))));
    return h('div', { class: 'ac-lado' }, caixas);
  }

  /* ---------- Busca por título (aulas e PDFs) ---------- */
  function mostrarBusca(buscando) {
    $('#trilhas').hidden = buscando;
    $('#resultados').hidden = !buscando;
  }
  function buscar() {
    var termo = C.normalizar(this.value.trim());
    var res = $('#resultados');
    if (!termo) { mostrarBusca(false); return; }
    if (estado.filtro !== 'todas') filtrar('todas');
    mostrarBusca(true);
    AC.limpar(res);
    var achadas = estado.org.aulas.filter(function (a) {
      var t = trilhaDe(a);
      return C.normalizar(a.titulo).indexOf(termo) >= 0 || (t && C.normalizar(t.titulo).indexOf(termo) >= 0);
    });
    var n = achadas.length;
    res.appendChild(h('h2', { class: 'ac-resultados__titulo' }, n ? n + (n === 1 ? ' aula encontrada' : ' aulas encontradas') : 'Nenhuma aula encontrada'));
    if (!n) { res.appendChild(C.vazio('Tente outra palavra do título.')); return; }
    var grade = h('ul', { class: 'ac-grade' });
    achadas.forEach(function (a) {
      var t = trilhaDe(a);
      grade.appendChild(h('li', null, C.cardAula(a, { trilha: t, progresso: prog(a), rotulo: t ? t.titulo : (a.tipo === 'pdf' ? 'Material' : 'Aula') })));
    });
    res.appendChild(grade);
    C.ajustarBarras(res);
  }
})();
