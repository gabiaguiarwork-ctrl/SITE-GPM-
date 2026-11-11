/*
  /academiadevirtudes/aluno/materiais/
  Todos os PDFs das aulas liberadas (o material principal das aulas em PDF e os PDFs de apoio),
  com filtro por trilha e busca. Abrir e Baixar geram, no clique, um link assinado de 60 s.
*/
(function () {
  'use strict';

  var AC = window.AC;
  var C = window.AcademiaConteudo;
  var CFG = window.ACADEMIA_CONFIG;
  var h = AC.h;
  var $ = AC.$;
  var itens = [];
  var SEM_TRILHA = 'sem-trilha';

  window.AcademiaAuth.proteger().then(function (ctx) {
    window.AcademiaLayout.montar(ctx);
    return Promise.all([C.trilhas(), C.aulas(), C.anexos()]);
  }).then(function (r) {
    var trilhas = C.porId(r[0]);
    var aulas = r[1].filter(C.visivelAluno);
    var porAula = C.porId(aulas);
    itens = [];
    aulas.forEach(function (a) {
      if (a.tipo === 'pdf' && a.arquivo_path) {
        itens.push({ aula: a, trilha: trilhas[a.modulo_id] || null, arq: { caminho: a.arquivo_path, nome: a.arquivo_nome || a.titulo, tamanho: a.arquivo_tamanho } });
      }
    });
    r[2].forEach(function (x) {
      var a = porAula[x.conteudo_id];
      if (a) itens.push({ aula: a, trilha: trilhas[a.modulo_id] || null, arq: { caminho: x.arquivo_path, nome: x.nome, tamanho: x.tamanho } });
    });

    var filtro = $('#filtro');
    r[0].forEach(function (t) {
      if (itens.some(function (i) { return i.trilha && i.trilha.id === t.id; })) filtro.appendChild(h('option', { value: t.id }, t.titulo));
    });
    if (itens.some(function (i) { return !i.trilha; })) filtro.appendChild(h('option', { value: SEM_TRILHA }, 'Sem trilha'));
    var inicial = AC.parametro('trilha');
    if (C.idValido(inicial) && trilhas[inicial]) filtro.value = inicial;
    filtro.addEventListener('change', listar);
    $('#busca').addEventListener('input', listar);
    listar();
  }).catch(function (err) { C.erro($('#materiais'), err); });

  function listar() {
    var sel = $('#filtro').value;
    var termo = C.normalizar($('#busca').value.trim());
    var alvo = AC.limpar($('#materiais'));
    var lista = itens.filter(function (i) {
      if (sel === SEM_TRILHA && i.trilha) return false;
      if (sel && sel !== SEM_TRILHA && (!i.trilha || i.trilha.id !== sel)) return false;
      return !termo || C.normalizar(i.arq.nome + ' ' + i.aula.titulo).indexOf(termo) >= 0;
    });
    if (!itens.length) { alvo.appendChild(C.vazio('Os materiais em PDF vão aparecer aqui assim que forem publicados.')); return; }
    if (!lista.length) { alvo.appendChild(C.vazio('Nenhum material encontrado.')); return; }
    var ul = h('ul', { class: 'ac-lista' });
    lista.forEach(function (i) {
      ul.appendChild(h('li', { class: 'ac-material' },
        C.botoesArquivo(i.arq),
        h('p', { class: 'ac-material__meta' }, i.trilha ? i.trilha.titulo + ' · ' : '',
          h('a', { href: CFG.rotas.aula + '?id=' + encodeURIComponent(i.aula.id) }, i.aula.titulo))));
    });
    alvo.appendChild(ul);
  }
})();
