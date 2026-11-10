/*
  Painel · abas Encontros e Conteúdos
  Criar, editar, ordenar, publicar/despublicar, data de liberação, capa (bucket público "capas"),
  material em PDF (bucket privado "materiais"), pré-visualizar como aluno e excluir (com confirmação).
*/
(function () {
  'use strict';

  var AC = window.AC;
  var ADM = window.AcademiaAdmin;
  var C = window.AcademiaConteudo;
  var CFG = window.ACADEMIA_CONFIG;
  var h = AC.h;
  var $ = AC.$;
  var IMAGENS = ['image/jpeg', 'image/png', 'image/webp'];
  var EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

  function sb() { return ADM.sb(); }
  function ok(r) { if (r.error) throw r.error; return r.data; }
  function botao(texto, fn, classe, rotulo) {
    var b = h('button', { type: 'button', class: 'ac-btn ac-btn--mini ' + (classe || 'ac-btn--contorno'), 'aria-label': rotulo || null }, texto);
    b.addEventListener('click', function () { fn(b); });
    return b;
  }
  function recarregar() { return ADM.carregarConteudo().then(function () { listarEncontros(); preencherFiltro(); listarConteudos(); }); }

  // Troca a posição de dois itens vizinhos (renumera de 10 em 10).
  function mover(tabela, lista, i, j) {
    if (j < 0 || j >= lista.length) return Promise.resolve();
    var copia = lista.slice();
    var x = copia[i]; copia[i] = copia[j]; copia[j] = x;
    return Promise.all(copia.map(function (item, k) {
      var ordem = (k + 1) * 10;
      if (item.ordem === ordem) return null;
      return sb().from(tabela).update({ ordem: ordem }).eq('id', item.id).then(ok);
    })).then(recarregar);
  }

  /* ===================== Encontros ===================== */
  function listarEncontros() {
    var ul = AC.limpar($('#lista-encontros'));
    var mods = ADM.estado.modulos;
    if (!mods.length) { ul.appendChild(h('li', null, C.vazio('Nenhum encontro ainda. Clique em "Novo encontro".'))); return; }
    mods.forEach(function (m, i) {
      var n = ADM.estado.conteudos.filter(function (c) { return c.modulo_id === m.id; }).length;
      var estado = !m.publicado ? 'Rascunho' : C.liberado(m) ? 'Publicado' : 'Publicado · libera em ' + C.data(m.liberado_em, true);
      ul.appendChild(h('li', { class: 'ac-linha-admin' },
        C.capa(m, 'ac-miniatura'),
        h('div', { class: 'ac-linha-admin__texto' },
          h('strong', null, m.titulo), h('br'),
          h('span', { class: 'ac-meta' }, estado + ' · ' + n + ' conteúdo' + (n === 1 ? '' : 's'))),
        h('div', { class: 'ac-acoes-linha' },
          botao('↑', function () { mover('modulos', mods, i, i - 1).catch(ADM.falha); }, '', 'Subir ' + m.titulo),
          botao('↓', function () { mover('modulos', mods, i, i + 1).catch(ADM.falha); }, '', 'Descer ' + m.titulo),
          botao(m.publicado ? 'Despublicar' : 'Publicar', function (b) { publicar('modulos', m, b); }),
          botao('Editar', function () { editarEncontro(m); }),
          botao('Conteúdos', function () { $('#co-filtro').value = m.id; ADM.mostrarAba('conteudos'); }),
          h('a', { class: 'ac-btn ac-btn--mini ac-btn--contorno', href: CFG.rotas.encontro + '?id=' + encodeURIComponent(m.id), target: '_blank', rel: 'noopener noreferrer' }, 'Pré-visualizar'),
          botao('Excluir', function (b) { excluirEncontro(m, b); }, 'ac-btn--perigo'))));
    });
  }

  function publicar(tabela, item, b) {
    AC.ocupado(b, true, 'Salvando…');
    sb().from(tabela).update({ publicado: !item.publicado }).eq('id', item.id).then(ok)
      .then(function () { ADM.msg(item.publicado ? 'Agora é rascunho (alunos não veem).' : 'Publicado.', 'ok'); return recarregar(); })
      .catch(function (e) { AC.ocupado(b, false); ADM.falha(e); });
  }

  function novoEncontro() {
    var f = $('#form-encontro');
    f.reset();
    $('#en-id').value = '';
    $('#t-form-encontro').textContent = 'Novo encontro';
    f.hidden = false;
    $('#en-titulo').focus();
  }
  function editarEncontro(m) {
    var f = $('#form-encontro');
    f.reset();
    $('#en-id').value = m.id;
    $('#t-form-encontro').textContent = 'Editar encontro';
    $('#en-titulo').value = m.titulo || '';
    $('#en-subtitulo').value = m.subtitulo || '';
    $('#en-descricao').value = m.descricao || '';
    $('#en-liberado').value = ADM.paraInputData(m.liberado_em);
    $('#en-publicado').checked = !!m.publicado;
    f.hidden = false;
    f.scrollIntoView({ block: 'start', behavior: 'smooth' });
    $('#en-titulo').focus({ preventScroll: true });
  }
  function salvarEncontro(e) {
    e.preventDefault();
    var titulo = $('#en-titulo'), btn = $('#btn-encontro');
    AC.erroCampo(titulo, titulo.value.trim() ? '' : 'Informe o título.');
    if (!titulo.value.trim()) { titulo.focus(); return; }
    var id = $('#en-id').value;
    var atual = ADM.estado.modulos.filter(function (m) { return m.id === id; })[0];
    var dados = {
      titulo: titulo.value.trim().slice(0, 160),
      subtitulo: $('#en-subtitulo').value.trim().slice(0, 240) || null,
      descricao: $('#en-descricao').value.trim().slice(0, 4000) || null,
      liberado_em: ADM.deInputData($('#en-liberado').value),
      publicado: $('#en-publicado').checked
    };
    var capa = $('#en-capa').files[0];
    AC.ocupado(btn, true, 'Salvando…');
    var passo = id
      ? sb().from('modulos').update(dados).eq('id', id).select('id').then(ok)
      : sb().from('modulos').insert(Object.assign({ ordem: (ADM.estado.modulos.length + 1) * 10 }, dados)).select('id').then(ok);
    passo.then(function (linhas) {
      var mid = id || linhas[0].id;
      if (!capa) return;
      var caminho = mid + '/' + ADM.slug(dados.titulo) + '-' + Date.now() + '.' + EXT[capa.type];
      return ADM.enviarArquivo('capas', caminho, capa, IMAGENS, 2 * 1048576).then(function () {
        return sb().from('modulos').update({ capa_path: caminho }).eq('id', mid).then(ok);
      }).then(function () {
        if (atual && atual.capa_path) return ADM.removerArquivo('capas', atual.capa_path);
      });
    }).then(function () {
      $('#form-encontro').hidden = true;
      ADM.msg('Encontro salvo.', 'ok');
      return recarregar();
    }).catch(ADM.falha).then(function () { AC.ocupado(btn, false); });
  }
  function excluirEncontro(m, b) {
    var conts = ADM.estado.conteudos.filter(function (c) { return c.modulo_id === m.id; });
    if (!ADM.confirmar('Excluir o encontro "' + m.titulo + '"' + (conts.length ? ' e os ' + conts.length + ' conteúdo(s) dele (com o progresso dos alunos)' : '') + '? Isso não pode ser desfeito.')) return;
    AC.ocupado(b, true, 'Excluindo…');
    sb().from('modulos').delete().eq('id', m.id).then(ok).then(function () {
      var arquivos = conts.map(function (c) { return c.arquivo_path; }).filter(Boolean);
      return Promise.all([
        arquivos.length ? sb().storage.from('materiais').remove(arquivos) : null,
        ADM.removerArquivo('capas', m.capa_path)
      ]);
    }).then(function () { ADM.msg('Encontro excluído.', 'ok'); return recarregar(); })
      .catch(function (e) { AC.ocupado(b, false); ADM.falha(e); });
  }

  /* ===================== Conteúdos ===================== */
  function preencherFiltro() {
    var sel = $('#co-filtro');
    var atual = sel.value;
    AC.limpar(sel);
    ADM.estado.modulos.forEach(function (m) { sel.appendChild(h('option', { value: m.id }, m.titulo + (m.publicado ? '' : ' (rascunho)'))); });
    if (atual && ADM.estado.modulos.some(function (m) { return m.id === atual; })) sel.value = atual;
    $('#novo-conteudo').disabled = !ADM.estado.modulos.length;
  }
  function listarConteudos() {
    var ul = AC.limpar($('#lista-conteudos'));
    var mid = $('#co-filtro').value;
    if (!mid) { ul.appendChild(h('li', null, C.vazio('Crie um encontro primeiro, na aba Encontros.'))); return; }
    var conts = ADM.estado.conteudos.filter(function (c) { return c.modulo_id === mid; });
    if (!conts.length) { ul.appendChild(h('li', null, C.vazio('Este encontro ainda não tem conteúdos.'))); return; }
    conts.forEach(function (c, i) {
      var meta = [C.rotuloTipo(c.tipo), c.tipo === 'video' ? (c.provedor === 'panda' ? 'Panda' : 'Vimeo') + ' ' + c.video_id : '', c.arquivo_path ? 'com PDF' : '', C.duracao(c.duracao_min), c.publicado ? 'Publicado' : 'Rascunho'].filter(Boolean).join(' · ');
      ul.appendChild(h('li', { class: 'ac-linha-admin' },
        h('span', { class: 'ac-item__icone', 'aria-hidden': 'true' }, C.rotuloTipo(c.tipo).slice(0, 3).toUpperCase()),
        h('div', { class: 'ac-linha-admin__texto' }, h('strong', null, c.titulo), h('br'), h('span', { class: 'ac-meta' }, meta)),
        h('div', { class: 'ac-acoes-linha' },
          botao('↑', function () { mover('conteudos', conts, i, i - 1).catch(ADM.falha); }, '', 'Subir ' + c.titulo),
          botao('↓', function () { mover('conteudos', conts, i, i + 1).catch(ADM.falha); }, '', 'Descer ' + c.titulo),
          botao(c.publicado ? 'Despublicar' : 'Publicar', function (b) { publicar('conteudos', c, b); }),
          botao('Editar', function () { editarConteudo(c); }),
          h('a', { class: 'ac-btn ac-btn--mini ac-btn--contorno', href: CFG.rotas.aula + '?id=' + encodeURIComponent(c.id), target: '_blank', rel: 'noopener noreferrer' }, 'Pré-visualizar'),
          botao('Excluir', function (b) { excluirConteudo(c, b); }, 'ac-btn--perigo'))));
    });
  }

  function mostrarCamposTipo() {
    var tipo = $('#co-tipo').value;
    AC.$$('[data-so-tipo]').forEach(function (el) { el.hidden = el.getAttribute('data-so-tipo') !== tipo; });
  }
  function novoConteudo() {
    var f = $('#form-conteudo');
    f.reset();
    $('#co-id').value = '';
    $('#t-form-conteudo').textContent = 'Novo conteúdo';
    mostrarCamposTipo();
    f.hidden = false;
    $('#co-titulo').focus();
  }
  function editarConteudo(c) {
    var f = $('#form-conteudo');
    f.reset();
    $('#co-id').value = c.id;
    $('#t-form-conteudo').textContent = 'Editar conteúdo';
    $('#co-titulo').value = c.titulo || '';
    $('#co-tipo').value = c.tipo;
    $('#co-descricao').value = c.descricao || '';
    $('#co-provedor').value = c.provedor || 'vimeo';
    $('#co-video').value = c.video_id || '';
    $('#co-duracao').value = c.duracao_min === null || c.duracao_min === undefined ? '' : c.duracao_min;
    $('#co-url').value = c.url || '';
    $('#co-arquivo-nome').value = c.arquivo_nome || '';
    $('#co-texto').value = c.texto || '';
    $('#co-publicado').checked = !!c.publicado;
    $('#ajuda-co-arquivo').textContent = c.arquivo_path ? 'Atual: ' + c.arquivo_path.split('/').pop() + '. Envie outro só para substituir.' : 'Opcional em vídeo e texto; obrigatório em PDF.';
    mostrarCamposTipo();
    f.hidden = false;
    f.scrollIntoView({ block: 'start', behavior: 'smooth' });
    $('#co-titulo').focus({ preventScroll: true });
  }
  function salvarConteudo(e) {
    e.preventDefault();
    var id = $('#co-id').value;
    var mid = $('#co-filtro').value;
    var atual = ADM.estado.conteudos.filter(function (c) { return c.id === id; })[0];
    var tipo = $('#co-tipo').value;
    var titulo = $('#co-titulo'), video = $('#co-video'), url = $('#co-url'), arquivoEl = $('#co-arquivo');
    var arquivo = arquivoEl.files[0];
    var provedor = $('#co-provedor').value;
    var erros = 0;
    var t = titulo.value.trim();
    AC.erroCampo(titulo, t ? '' : 'Informe o título.'); if (!t) erros++;
    var vid = video.value.trim();
    var vidOk = provedor === 'vimeo' ? /^\d{1,12}(:[a-f0-9]{6,20})?$/i.test(vid) : /^[A-Za-z0-9-]{8,64}$/.test(vid);
    AC.erroCampo(video, tipo !== 'video' || vidOk ? '' : (provedor === 'vimeo' ? 'Use só o número do vídeo (ou número:hash).' : 'Use o ID do vídeo do Panda.')); if (tipo === 'video' && !vidOk) erros++;
    var u = url.value.trim();
    var urlOk = /^https:\/\/[^\s/\\]+/i.test(u);
    AC.erroCampo(url, tipo !== 'link' || urlOk ? '' : 'Use um endereço que comece com https://'); if (tipo === 'link' && !urlOk) erros++;
    var precisaPdf = tipo === 'pdf' && !arquivo && !(atual && atual.arquivo_path);
    AC.erroCampo(arquivoEl, precisaPdf ? 'Envie o arquivo PDF.' : ''); if (precisaPdf) erros++;
    if (erros) { var primeiro = $('#form-conteudo [aria-invalid="true"]'); if (primeiro) primeiro.focus(); return; }

    var dur = parseInt($('#co-duracao').value, 10);
    var dados = {
      titulo: t.slice(0, 160), tipo: tipo,
      descricao: $('#co-descricao').value.trim().slice(0, 4000) || null,
      provedor: tipo === 'video' ? provedor : null,
      video_id: tipo === 'video' ? vid : null,
      duracao_min: isNaN(dur) ? null : Math.max(0, Math.min(1440, dur)),
      url: tipo === 'link' ? u.slice(0, 600) : null,
      arquivo_nome: $('#co-arquivo-nome').value.trim().slice(0, 160) || null,
      texto: $('#co-texto').value.trim().slice(0, 20000) || null,
      publicado: $('#co-publicado').checked
    };
    var btn = $('#btn-conteudo');
    AC.ocupado(btn, true, 'Salvando…');
    var caminhoNovo = null;
    var enviar = arquivo
      ? ADM.enviarArquivo('materiais', mid + '/' + ADM.slug(dados.arquivo_nome || t) + '-' + Date.now() + '.pdf', arquivo, ['application/pdf'], 20 * 1048576)
          .then(function (c) { caminhoNovo = c; dados.arquivo_path = c; })
      : Promise.resolve();
    enviar.then(function () {
      if (id) return sb().from('conteudos').update(dados).eq('id', id).select('id').then(ok);
      var irmaos = ADM.estado.conteudos.filter(function (c) { return c.modulo_id === mid; }).length;
      return sb().from('conteudos').insert(Object.assign({ modulo_id: mid, ordem: (irmaos + 1) * 10 }, dados)).select('id').then(ok);
    }).then(function () {
      if (caminhoNovo && atual && atual.arquivo_path) return ADM.removerArquivo('materiais', atual.arquivo_path);
    }).then(function () {
      $('#form-conteudo').hidden = true;
      ADM.msg('Conteúdo salvo.', 'ok');
      return recarregar();
    }).catch(function (err) {
      if (caminhoNovo) ADM.removerArquivo('materiais', caminhoNovo); // não deixa arquivo órfão
      ADM.falha(err);
    }).then(function () { AC.ocupado(btn, false); });
  }
  function excluirConteudo(c, b) {
    if (!ADM.confirmar('Excluir o conteúdo "' + c.titulo + '"' + (c.arquivo_path ? ' e o PDF dele' : '') + '? O progresso dos alunos neste conteúdo também é apagado.')) return;
    AC.ocupado(b, true, 'Excluindo…');
    sb().from('conteudos').delete().eq('id', c.id).then(ok)
      .then(function () { return ADM.removerArquivo('materiais', c.arquivo_path); })
      .then(function () { ADM.msg('Conteúdo excluído.', 'ok'); return recarregar(); })
      .catch(function (e) { AC.ocupado(b, false); ADM.falha(e); });
  }

  ADM.registrar('encontros', {
    iniciar: function () {
      $('#novo-encontro').addEventListener('click', novoEncontro);
      $('#form-encontro').addEventListener('submit', salvarEncontro);
    },
    mostrar: listarEncontros,
    recarregar: recarregar
  });
  ADM.registrar('conteudos', {
    iniciar: function () {
      $('#novo-conteudo').addEventListener('click', novoConteudo);
      $('#form-conteudo').addEventListener('submit', salvarConteudo);
      $('#co-tipo').addEventListener('change', mostrarCamposTipo);
      $('#co-filtro').addEventListener('change', function () { $('#form-conteudo').hidden = true; listarConteudos(); });
    },
    mostrar: function () { preencherFiltro(); listarConteudos(); },
    recarregar: recarregar
  });
})();
