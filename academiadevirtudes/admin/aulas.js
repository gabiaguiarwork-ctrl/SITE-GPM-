/*
  Painel · abas Aulas e Trilhas (substituem Encontros e Conteúdos)

  Aulas: lista com capa, tipo, trilha, situação (Rascunho / Publicada / Agendada) e busca;
  "Nova aula" num formulário único (tipo, título, link do YouTube com prévia ou PDF por arrastar
  e soltar, PDFs de apoio, trilha existente ou nova, capa, publicar/rascunho/agendar, destaque);
  editar, duplicar, publicar/despublicar, pré-visualizar como aluno, excluir; ordem por arrastar
  (e setas, para teclado e celular). Mostra o espaço usado no Storage.
  Trilhas: nome, descrição, capa e ordem.

  Tudo passa pela RLS (só admin com MFA grava) e entra na auditoria pelo banco.
  Banco: conteudos = aulas; modulos = trilhas; anexos = PDFs de apoio.
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
  var PDF = ['application/pdf'];
  var MAX_PDF = 20 * 1048576;
  var MAX_CAPA = 2 * 1048576;
  var NOVA = '__nova';

  // Estado do formulário da aula
  var form = { pdf: null, anexos: [] };
  var arrastando = null;

  function sb() { return ADM.sb(); }
  function ok(r) { if (r.error) throw r.error; return r.data; }
  function botao(texto, fn, classe, rotulo) {
    var b = h('button', { type: 'button', class: 'ac-btn ac-btn--mini ' + (classe || 'ac-btn--contorno'), 'aria-label': rotulo || null }, texto);
    b.addEventListener('click', function () { fn(b); });
    return b;
  }
  function novoId() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    var b = crypto.getRandomValues(new Uint8Array(16));
    b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
    var x = Array.prototype.map.call(b, function (n) { return ('0' + n.toString(16)).slice(-2); }).join('');
    return x.slice(0, 8) + '-' + x.slice(8, 12) + '-' + x.slice(12, 16) + '-' + x.slice(16, 20) + '-' + x.slice(20);
  }
  function basePdf(nome) { return String(nome || '').replace(/\.pdf$/i, '').trim().slice(0, 160); }
  function recarregar() {
    return ADM.carregarConteudo().then(function () { listarAulas(); listarTrilhas(); preencherTrilhas(); });
  }

  /* ===================== Armazenamento ===================== */
  function mostrarArmazenamento() {
    sb().rpc('admin_uso_storage').then(function (r) {
      var caixa = $('#armazenamento');
      if (r.error) { caixa.hidden = true; return; }
      var bytes = (r.data || []).reduce(function (t, x) { return t + Number(x.bytes || 0); }, 0);
      var limite = CFG.storageLimiteBytes;
      var pct = Math.min(100, Math.round(bytes / limite * 100));
      AC.limpar(caixa);
      caixa.classList.toggle('ac-armazenamento--alerta', pct >= 80);
      caixa.appendChild(h('p', { class: 'ac-armazenamento__texto' }, 'Armazenamento de arquivos: ' + (C.tamanho(bytes) || '0 KB') + ' de ' + C.tamanho(limite) + ' (' + pct + '%)'));
      caixa.appendChild(h('div', { class: 'ac-progresso__trilho', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(pct), 'aria-label': 'Espaço usado no Storage' },
        h('div', { class: 'ac-progresso__barra', 'data-pct': String(pct) })));
      if (pct >= 80) caixa.appendChild(h('p', { class: 'ac-armazenamento__aviso' }, 'Passou de 80% do espaço do plano. Apague PDFs que não são mais usados ou avalie mudar o plano do Supabase.'));
      C.ajustarBarras(caixa);
      caixa.hidden = false;
    });
  }

  /* ===================== Lista de aulas ===================== */
  function listarAulas() {
    var ul = AC.limpar($('#lista-aulas'));
    var termo = C.normalizar($('#busca-aulas').value.trim());
    var todas = ADM.estado.conteudos;
    var lista = termo ? todas.filter(function (a) { return C.normalizar(a.titulo).indexOf(termo) >= 0; }) : todas;
    $('#ajuda-ordem').hidden = !!termo || todas.length < 2;
    if (!todas.length) { ul.appendChild(h('li', null, C.vazio('Nenhuma aula ainda. Clique em "Nova aula".'))); return; }
    if (!lista.length) { ul.appendChild(h('li', null, C.vazio('Nenhuma aula encontrada.'))); return; }
    lista.forEach(function (a) {
      var i = todas.indexOf(a);
      var t = ADM.trilhaDe(a);
      var st = C.situacaoAdmin(a);
      var nAnexos = ADM.estado.anexos.filter(function (x) { return x.conteudo_id === a.id; }).length;
      var provedor = a.tipo === 'video' && a.provedor && a.provedor !== 'youtube' ? (a.provedor === 'vimeo' ? 'Vimeo' : 'Panda') : '';
      var quando = st.id === 'publicada' ? 'publicada em ' + C.data(a.publicado_em || a.criado_em) : st.id === 'rascunho' ? 'criada em ' + C.data(a.criado_em) : '';
      var meta = [C.metaAula(a) + (provedor ? ' (' + provedor + ')' : ''), t ? 'Trilha: ' + t.titulo : 'Sem trilha', quando,
        nAnexos ? nAnexos + ' PDF' + (nAnexos === 1 ? '' : 's') + ' de apoio' : ''].filter(Boolean).join(' · ');
      var li = h('li', { class: 'ac-linha-admin ac-linha-aula', draggable: termo ? null : 'true', 'data-id': a.id },
        termo ? null : h('span', { class: 'ac-alca', 'aria-hidden': 'true', title: 'Arraste para mudar a ordem' }, '⠿'),
        C.imagem(C.capaAulaUrl(a, t), 'ac-miniatura', a.tipo),
        h('div', { class: 'ac-linha-admin__texto' },
          h('strong', null, a.titulo),
          a.destaque ? h('span', { class: 'ac-selo ac-selo--mini' }, 'Destaque') : null, h('br'),
          h('span', { class: 'ac-selo ac-selo--mini ac-situacao--' + st.id }, st.texto), ' ',
          h('span', { class: 'ac-meta' }, meta)),
        h('div', { class: 'ac-acoes-linha' },
          termo ? null : botao('↑', function () { trocar(i, i - 1).catch(ADM.falha); }, '', 'Subir ' + a.titulo),
          termo ? null : botao('↓', function () { trocar(i, i + 1).catch(ADM.falha); }, '', 'Descer ' + a.titulo),
          botao('Editar', function () { editar(a); }),
          botao('Duplicar', function (b) { duplicar(a, b); }),
          botao(a.publicado ? 'Despublicar' : 'Publicar', function (b) { publicar(a, b); }),
          h('a', { class: 'ac-btn ac-btn--mini ac-btn--contorno', href: CFG.rotas.aula + '?id=' + encodeURIComponent(a.id), target: '_blank', rel: 'noopener noreferrer' }, 'Pré-visualizar'),
          botao('Excluir', function (b) { excluir(a, b); }, 'ac-btn--perigo')));
      if (!termo) ligarArrastar(li, i);
      ul.appendChild(li);
    });
  }

  /* ---------- Ordem: arrastar e soltar, ou setas ---------- */
  function renumerar(tabela, lista) {
    return Promise.all(lista.map(function (item, k) {
      var ordem = (k + 1) * 10;
      if (item.ordem === ordem) return null;
      return sb().from(tabela).update({ ordem: ordem }).eq('id', item.id).then(ok);
    })).then(recarregar);
  }
  function mover(tabela, lista, de, para) {
    if (para < 0 || para >= lista.length || de === para) return Promise.resolve();
    var copia = lista.slice();
    var x = copia.splice(de, 1)[0];
    copia.splice(para, 0, x);
    return renumerar(tabela, copia);
  }
  function trocar(i, j) { return mover('conteudos', ADM.estado.conteudos, i, j); }
  function ligarArrastar(li, i) {
    li.addEventListener('dragstart', function (e) {
      arrastando = i;
      li.classList.add('ac-arrastando');
      e.dataTransfer.effectAllowed = 'move';
      try { e.dataTransfer.setData('text/plain', String(i)); } catch (x) { /* ok */ }
    });
    li.addEventListener('dragend', function () {
      arrastando = null;
      AC.$$('.ac-arrastando, .ac-alvo-soltar').forEach(function (el) { el.classList.remove('ac-arrastando', 'ac-alvo-soltar'); });
    });
    li.addEventListener('dragover', function (e) {
      if (arrastando === null) return;
      e.preventDefault();
      li.classList.add('ac-alvo-soltar');
    });
    li.addEventListener('dragleave', function () { li.classList.remove('ac-alvo-soltar'); });
    li.addEventListener('drop', function (e) {
      if (arrastando === null) return;
      e.preventDefault();
      var de = arrastando;
      arrastando = null;
      li.classList.remove('ac-alvo-soltar');
      if (de === i) return;
      mover('conteudos', ADM.estado.conteudos, de, i).then(function () { ADM.msg('Ordem salva.', 'ok'); }).catch(ADM.falha);
    });
  }

  /* ---------- Publicar, duplicar, excluir ---------- */
  function publicar(a, b) {
    AC.ocupado(b, true, 'Salvando…');
    sb().from('conteudos').update({ publicado: !a.publicado }).eq('id', a.id).then(ok)
      .then(function () {
        ADM.msg(a.publicado ? 'Agora é rascunho (os alunos não veem).' : (C.liberado(a) ? 'Aula publicada.' : 'Aula agendada para ' + C.data(a.liberado_em, true) + '.'), 'ok');
        return recarregar();
      })
      .catch(function (e) { AC.ocupado(b, false); ADM.falha(e); });
  }

  function duplicar(a, b) {
    AC.ocupado(b, true, 'Duplicando…');
    var id = novoId();
    var copiados = [];
    function copiar(bucket, caminho) {
      if (!caminho) return Promise.resolve(null);
      var destino = id + '/' + caminho.split('/').pop();
      return ADM.copiarArquivo(bucket, caminho, destino).then(function (c) { copiados.push([bucket, c]); return c; });
    }
    var anexos = ADM.estado.anexos.filter(function (x) { return x.conteudo_id === a.id; });
    var novosAnexos = [];
    Promise.all([copiar('materiais', a.arquivo_path), copiar('capas', a.capa_path)]).then(function (r) {
      return anexos.reduce(function (p, x) {
        return p.then(function () { return copiar('materiais', x.arquivo_path).then(function (c) { novosAnexos.push({ conteudo_id: id, nome: x.nome, arquivo_path: c, tamanho: x.tamanho, ordem: x.ordem }); }); });
      }, Promise.resolve()).then(function () { return r; });
    }).then(function (r) {
      var ultima = ADM.estado.conteudos.reduce(function (m, x) { return Math.max(m, x.ordem || 0); }, 0);
      return sb().from('conteudos').insert({
        id: id, modulo_id: a.modulo_id, titulo: (a.titulo + ' (cópia)').slice(0, 160), tipo: a.tipo, descricao: a.descricao,
        provedor: a.provedor, video_id: a.video_id, duracao_min: a.duracao_min, arquivo_path: r[0], arquivo_nome: a.arquivo_nome,
        arquivo_tamanho: a.arquivo_tamanho, url: a.url, texto: a.texto, capa_path: r[1], ordem: ultima + 10,
        publicado: false, liberado_em: null, destaque: false
      }).then(ok);
    }).then(function () {
      if (novosAnexos.length) return sb().from('anexos').insert(novosAnexos).then(ok);
    }).then(function () {
      ADM.msg('Aula duplicada como rascunho, no fim da lista.', 'ok');
      return recarregar();
    }).catch(function (e) {
      copiados.forEach(function (c) { ADM.removerArquivo(c[0], c[1]); });
      AC.ocupado(b, false);
      ADM.falha(e);
    });
  }

  function excluir(a, b) {
    var anexos = ADM.estado.anexos.filter(function (x) { return x.conteudo_id === a.id; });
    var extra = [a.arquivo_path ? 'o PDF dela' : '', anexos.length ? anexos.length + ' PDF(s) de apoio' : ''].filter(Boolean).join(' e ');
    if (!ADM.confirmar('Excluir a aula "' + a.titulo + '"' + (extra ? ', ' + extra : '') + '? O progresso dos alunos nesta aula também é apagado. Isso não pode ser desfeito.')) return;
    AC.ocupado(b, true, 'Excluindo…');
    sb().from('conteudos').delete().eq('id', a.id).then(ok).then(function () {
      return Promise.all([
        ADM.removerArquivo('materiais', [a.arquivo_path].concat(anexos.map(function (x) { return x.arquivo_path; }))),
        ADM.removerArquivo('capas', a.capa_path)
      ]);
    }).then(function () { ADM.msg('Aula excluída.', 'ok'); mostrarArmazenamento(); return recarregar(); })
      .catch(function (e) { AC.ocupado(b, false); ADM.falha(e); });
  }

  /* ===================== Formulário da aula ===================== */
  function tipoAtual() { var r = $('input[name="au-tipo"]:checked'); return r ? r.value : 'video'; }
  function pubAtual() { var r = $('input[name="au-pub"]:checked'); return r ? r.value : 'agora'; }
  function marcar(nome, valor) { AC.$$('input[name="' + nome + '"]').forEach(function (r) { r.checked = r.value === valor; }); }
  function mostrarTipo() {
    var t = tipoAtual();
    AC.$$('#form-aula [data-so-tipo]').forEach(function (el) { el.hidden = el.getAttribute('data-so-tipo') !== t; });
    $('#ajuda-au-capa').textContent = t === 'video' ? 'Videoaula sem capa usa a imagem do YouTube.' : 'Sem capa, o card mostra o símbolo da Academia (ou a capa da trilha).';
  }
  function mostrarPub() {
    var p = pubAtual();
    $('#campo-agendar').hidden = p !== 'agendar';
    $('#btn-aula').textContent = { agora: 'Publicar aula', rascunho: 'Salvar rascunho', agendar: 'Agendar aula' }[p];
  }
  function preencherTrilhas() {
    var s = $('#au-trilha');
    var atual = s.value;
    AC.limpar(s);
    s.appendChild(h('option', { value: '' }, 'Sem trilha'));
    ADM.estado.modulos.forEach(function (m) { s.appendChild(h('option', { value: m.id }, m.titulo)); });
    s.appendChild(h('option', { value: NOVA }, '+ Nova trilha…'));
    if (atual && AC.$$('option', s).some(function (o) { return o.value === atual; })) s.value = atual;
  }

  /* ---------- YouTube: extrai o ID do link e mostra a prévia ---------- */
  var esperaPrevia = null;
  function previaYoutube() {
    var campo = $('#au-youtube'), caixa = $('#au-previa');
    var v = campo.value.trim();
    var id = C.youtubeId(v);
    AC.erroCampo(campo, v && !id ? 'Link do YouTube não reconhecido. Copie o endereço do vídeo (youtube.com/watch?v=… ou youtu.be/…).' : '');
    if ((caixa.getAttribute('data-id') || '') === id) return;
    caixa.setAttribute('data-id', id);
    AC.limpar(caixa);
    caixa.hidden = !id;
    if (!id) return;
    caixa.appendChild(h('div', { class: 'ac-previa-video__player' },
      h('iframe', {
        src: 'https://www.youtube-nocookie.com/embed/' + id + '?rel=0&modestbranding=1&playsinline=1',
        title: 'Prévia do vídeo', allow: 'encrypted-media; picture-in-picture; fullscreen', allowfullscreen: true,
        referrerpolicy: 'strict-origin', loading: 'lazy'
      })));
    caixa.appendChild(h('figure', { class: 'ac-previa-video__capa' },
      h('img', { src: C.youtubeCapa(id), alt: 'Capa automática do vídeo', loading: 'lazy' }),
      h('figcaption', { class: 'ac-ajuda' }, 'Capa automática · ID ' + id)));
  }

  /* ---------- Arrastar e soltar arquivos ---------- */
  function temArquivos(e) { return !!(e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types || [], 'Files') >= 0); }
  function ligarSoltar(zona, input, aoArquivos) {
    ['dragenter', 'dragover'].forEach(function (ev) {
      zona.addEventListener(ev, function (e) { if (!temArquivos(e)) return; e.preventDefault(); zona.classList.add('ac-soltar--ativo'); });
    });
    ['dragleave', 'dragend'].forEach(function (ev) { zona.addEventListener(ev, function () { zona.classList.remove('ac-soltar--ativo'); }); });
    zona.addEventListener('drop', function (e) {
      zona.classList.remove('ac-soltar--ativo');
      if (!temArquivos(e)) return;
      e.preventDefault();
      aoArquivos(Array.prototype.slice.call(e.dataTransfer.files || []));
    });
    input.addEventListener('change', function () {
      var lista = Array.prototype.slice.call(input.files || []);
      input.value = '';
      if (lista.length) aoArquivos(lista);
    });
  }
  function erroArquivo(id, texto) {
    var el = $('#' + id);
    el.textContent = texto || '';
    el.hidden = !texto;
  }

  function escolherPdf(lista) {
    var f = lista[0];
    erroArquivo('erro-au-pdf', '');
    if (lista.length > 1) erroArquivo('erro-au-pdf', 'Use um arquivo por aula. Os outros podem entrar como PDFs de apoio.');
    ADM.conferirArquivo(f, PDF, MAX_PDF).then(function () {
      form.pdf = f;
      $('#au-pdf-info').textContent = 'Selecionado: ' + f.name + ' (' + C.tamanho(f.size) + '). Será enviado ao salvar.';
      if (!$('#au-pdf-nome').value.trim()) $('#au-pdf-nome').value = basePdf(f.name);
    }).catch(function (err) { erroArquivo('erro-au-pdf', f.name + ': ' + (err.mensagemPainel || 'arquivo não aceito.')); });
  }

  function escolherAnexos(lista) {
    erroArquivo('erro-au-anexos', '');
    var erros = [];
    Promise.all(lista.map(function (f) {
      return ADM.conferirArquivo(f, PDF, MAX_PDF).then(function () {
        form.anexos.push({ arquivo: f, nome: basePdf(f.name) || 'Material de apoio', tamanho: f.size });
      }).catch(function (err) { erros.push(f.name + ': ' + (err.mensagemPainel || 'arquivo não aceito.')); });
    })).then(function () {
      if (erros.length) erroArquivo('erro-au-anexos', erros.join(' '));
      mostrarAnexos();
    });
  }

  function mostrarAnexos() {
    var ul = AC.limpar($('#au-anexos-lista'));
    form.anexos.forEach(function (x, k) {
      if (x.removido) return;
      var idCampo = 'au-anexo-nome-' + k;
      var campo = h('input', { class: 'ac-input', id: idCampo, maxlength: '160', value: x.nome });
      campo.addEventListener('input', function () { x.nome = campo.value; });
      var remover = h('button', { type: 'button', class: 'ac-btn ac-btn--mini ac-btn--perigo', 'aria-label': 'Remover ' + (x.nome || 'PDF de apoio') }, 'Remover');
      remover.addEventListener('click', function () {
        if (x.id) x.removido = true; else form.anexos.splice(k, 1);
        mostrarAnexos();
      });
      ul.appendChild(h('li', { class: 'ac-anexo-admin' },
        h('label', { class: 'ac-sr-only', for: idCampo }, 'Nome do PDF de apoio ' + (k + 1)),
        campo,
        h('span', { class: 'ac-meta' }, [x.arquivo ? 'novo' : '', C.tamanho(x.tamanho)].filter(Boolean).join(' · ')),
        remover));
    });
  }

  /* ---------- Abrir o formulário ---------- */
  function limparFormulario() {
    var f = $('#form-aula');
    f.reset();
    form = { pdf: null, anexos: [] };
    $('#au-id').value = '';
    $('#au-previa').setAttribute('data-id', '');
    AC.limpar($('#au-previa'));
    $('#au-previa').hidden = true;
    $('#au-provedor-antigo').hidden = true;
    $('#au-pdf-info').textContent = '';
    AC.limpar($('#au-capa-previa'));
    $('#campo-capa-remover').hidden = true;
    $('#campo-nova-trilha').hidden = true;
    $('#au-envio').hidden = true;
    ['erro-au-pdf', 'erro-au-anexos'].forEach(function (id) { erroArquivo(id, ''); });
    AC.$$('#form-aula [aria-invalid]').forEach(function (el) { AC.erroCampo(el, ''); });
    AC.$$('#form-aula details').forEach(function (d) { d.open = false; });
    preencherTrilhas();
    mostrarAnexos();
  }
  function abrirFormulario(titulo) {
    $('#t-form-aula').textContent = titulo;
    mostrarTipo();
    mostrarPub();
    var f = $('#form-aula');
    f.hidden = false;
    f.scrollIntoView({ block: 'start', behavior: 'smooth' });
    $('#t-form-aula').focus({ preventScroll: true });
  }
  function nova() {
    limparFormulario();
    marcar('au-tipo', 'video');
    marcar('au-pub', 'agora');
    abrirFormulario('Nova aula');
  }
  function editar(a) {
    limparFormulario();
    $('#au-id').value = a.id;
    marcar('au-tipo', a.tipo === 'pdf' ? 'pdf' : 'video');
    $('#au-titulo').value = a.titulo || '';
    $('#au-descricao').value = a.descricao || '';
    if (a.tipo === 'video') {
      if (a.provedor === 'youtube') { $('#au-youtube').value = 'https://www.youtube.com/watch?v=' + a.video_id; previaYoutube(); }
      else if (a.provedor) {
        var aviso = $('#au-provedor-antigo');
        aviso.textContent = 'Vídeo atual: ' + (a.provedor === 'vimeo' ? 'Vimeo' : 'Panda Video') + ' (ID ' + a.video_id + '). Para trocar, cole um link do YouTube; em branco, mantém o atual.';
        aviso.hidden = false;
      }
    }
    $('#au-duracao').value = a.duracao_min === null || a.duracao_min === undefined ? '' : a.duracao_min;
    if (a.tipo === 'pdf' && a.arquivo_path) {
      $('#au-pdf-info').textContent = 'Arquivo atual: ' + (a.arquivo_nome || a.arquivo_path.split('/').pop()) + (a.arquivo_tamanho ? ' (' + C.tamanho(a.arquivo_tamanho) + ')' : '') + '. Arraste outro só para substituir.';
    }
    $('#au-pdf-nome').value = a.arquivo_nome || '';
    form.anexos = ADM.estado.anexos.filter(function (x) { return x.conteudo_id === a.id; })
      .map(function (x) { return { id: x.id, nome: x.nome, nomeOriginal: x.nome, arquivo_path: x.arquivo_path, tamanho: x.tamanho }; });
    mostrarAnexos();
    $('#au-trilha').value = a.modulo_id || '';
    if (a.capa_path) {
      $('#au-capa-previa').appendChild(C.imagem(C.capaUrl(a.capa_path), 'ac-capa-previa__img'));
      $('#campo-capa-remover').hidden = false;
    }
    marcar('au-pub', !a.publicado ? 'rascunho' : C.liberado(a) ? 'agora' : 'agendar');
    $('#au-quando').value = ADM.paraInputData(a.liberado_em);
    $('#au-destaque').checked = !!a.destaque;
    $('#au-texto').value = a.texto || '';
    if (a.texto) $('#form-aula details').open = true;
    abrirFormulario('Editar aula');
  }

  /* ---------- Barra de envio ---------- */
  function progresso(fracao, texto) {
    var pct = Math.max(0, Math.min(100, Math.round(fracao * 100)));
    $('#au-envio').hidden = false;
    $('#au-envio-texto').textContent = texto + ' ' + pct + '%';
    $('#au-envio-trilho').setAttribute('aria-valuenow', String(pct));
    $('#au-envio-barra').className = 'ac-progresso__barra ac-pct-' + Math.round(pct / 5) * 5;
  }

  /* ---------- Salvar ---------- */
  function salvar(e) {
    e.preventDefault();
    var id = $('#au-id').value;
    var atual = id ? ADM.estado.conteudos.filter(function (x) { return x.id === id; })[0] : null;
    var tipo = tipoAtual(), pub = pubAtual();
    var titulo = $('#au-titulo'), yt = $('#au-youtube'), quando = $('#au-quando'), novaTrilha = $('#au-trilha-nova');
    var primeiro = null;
    function erro(campo, texto) { AC.erroCampo(campo, texto); if (texto && !primeiro) primeiro = campo; }

    var t = titulo.value.trim();
    erro(titulo, t ? '' : 'Informe o título da aula.');

    var videoId = null, provedor = null;
    if (tipo === 'video') {
      var link = yt.value.trim();
      videoId = C.youtubeId(link);
      provedor = 'youtube';
      if (!link && atual && atual.tipo === 'video' && atual.provedor && atual.video_id) { videoId = atual.video_id; provedor = atual.provedor; }
      erro(yt, videoId ? '' : link ? 'Link do YouTube não reconhecido. Copie o endereço do vídeo (youtube.com/watch?v=… ou youtu.be/…).' : 'Cole o link do vídeo no YouTube.');
    }
    var temPdf = !!form.pdf || !!(atual && atual.tipo === 'pdf' && atual.arquivo_path);
    if (tipo === 'pdf' && !temPdf) { erroArquivo('erro-au-pdf', 'Arraste ou escolha o arquivo PDF.'); if (!primeiro) primeiro = $('#au-pdf'); }
    var trilhaSel = $('#au-trilha').value;
    erro(novaTrilha, trilhaSel === NOVA && !novaTrilha.value.trim() ? 'Informe o nome da nova trilha.' : '');
    var liberado = null;
    if (pub === 'agendar') {
      liberado = ADM.deInputData(quando.value);
      erro(quando, liberado ? '' : 'Escolha a data e a hora da publicação.');
    }
    if (primeiro) { primeiro.focus(); return; }

    var aulaId = id || novoId();
    var capa = $('#au-capa').files[0];
    var removerCapa = $('#au-capa-remover').checked;
    var enviados = [];      // [bucket, caminho] enviados nesta gravação (apagados se der erro)
    var apagarDepois = [];  // [bucket, caminho] substituídos (apagados se der certo)
    var novosAnexos = form.anexos.filter(function (x) { return x.arquivo && !x.removido; });
    var arquivos = (form.pdf && tipo === 'pdf' ? [form.pdf] : []).concat(novosAnexos.map(function (x) { return x.arquivo; }));
    var total = arquivos.reduce(function (s, f) { return s + f.size; }, 0) || 1;
    var feito = 0;
    function enviarPdf(arquivo, nome) {
      var caminho = aulaId + '/' + ADM.slug(nome || arquivo.name) + '-' + Date.now() + '.pdf';
      var base = feito;
      return ADM.enviarComProgresso('materiais', caminho, arquivo, PDF, MAX_PDF, function (fr) {
        progresso((base + fr * arquivo.size) / total, 'Enviando ' + arquivo.name + '…');
      }).then(function (c) { feito += arquivo.size; enviados.push(['materiais', c]); return c; });
    }

    var dados = {
      titulo: t.slice(0, 160), tipo: tipo,
      descricao: $('#au-descricao').value.trim().slice(0, 4000) || null,
      provedor: tipo === 'video' ? provedor : null,
      video_id: tipo === 'video' ? videoId : null,
      duracao_min: null,
      texto: $('#au-texto').value.trim().slice(0, 20000) || null,
      publicado: pub !== 'rascunho',
      liberado_em: pub === 'agendar' ? liberado : null,
      destaque: $('#au-destaque').checked
    };
    var dur = parseInt($('#au-duracao').value, 10);
    if (tipo === 'video' && !isNaN(dur)) dados.duracao_min = Math.max(0, Math.min(1440, dur));
    if (tipo === 'pdf') dados.arquivo_nome = ($('#au-pdf-nome').value.trim() || (form.pdf ? basePdf(form.pdf.name) : (atual && atual.arquivo_nome)) || t).slice(0, 160);
    else { dados.arquivo_path = null; dados.arquivo_nome = null; dados.arquivo_tamanho = null; }
    if (atual && atual.arquivo_path && (tipo !== 'pdf' || form.pdf)) apagarDepois.push(['materiais', atual.arquivo_path]);

    var btn = $('#btn-aula');
    AC.ocupado(btn, true, 'Salvando…');
    if (arquivos.length) progresso(0, 'Enviando…');

    var passo = Promise.resolve();
    // Trilha nova
    if (trilhaSel === NOVA) {
      passo = passo.then(function () {
        var ultima = ADM.estado.modulos.reduce(function (m, x) { return Math.max(m, x.ordem || 0); }, 0);
        return sb().from('modulos').insert({ titulo: novaTrilha.value.trim().slice(0, 160), ordem: ultima + 10, publicado: true }).select('id').then(ok)
          .then(function (l) { dados.modulo_id = l[0].id; });
      });
    } else {
      dados.modulo_id = trilhaSel || null;
    }
    // PDF principal
    if (tipo === 'pdf' && form.pdf) {
      passo = passo.then(function () { return enviarPdf(form.pdf, dados.arquivo_nome); })
        .then(function (c) { dados.arquivo_path = c; dados.arquivo_tamanho = form.pdf.size; });
    }
    // Capa
    if (capa) {
      passo = passo.then(function () {
        var caminho = aulaId + '/capa-' + Date.now() + '.' + EXT[capa.type];
        return ADM.enviarArquivo('capas', caminho, capa, IMAGENS, MAX_CAPA).then(function (c) {
          enviados.push(['capas', c]);
          dados.capa_path = c;
          if (atual && atual.capa_path) apagarDepois.push(['capas', atual.capa_path]);
        });
      });
    } else if (removerCapa && atual && atual.capa_path) {
      dados.capa_path = null;
      apagarDepois.push(['capas', atual.capa_path]);
    }
    // PDFs de apoio novos (um de cada vez, com a barra)
    novosAnexos.forEach(function (x) {
      passo = passo.then(function () { return enviarPdf(x.arquivo, x.nome).then(function (c) { x.arquivo_path = c; }); });
    });
    // A aula
    passo = passo.then(function () {
      if (id) return sb().from('conteudos').update(dados).eq('id', id).select('id').then(ok);
      var ultima = ADM.estado.conteudos.reduce(function (m, x) { return Math.max(m, x.ordem || 0); }, 0);
      return sb().from('conteudos').insert(Object.assign({ id: aulaId, ordem: ultima + 10 }, dados)).select('id').then(ok);
    });
    // PDFs de apoio: novos, renomeados e removidos
    passo = passo.then(function () {
      var ordem = 0;
      var ops = [];
      var inserir = [];
      form.anexos.forEach(function (x) {
        if (x.removido) {
          ops.push(sb().from('anexos').delete().eq('id', x.id).then(ok));
          apagarDepois.push(['materiais', x.arquivo_path]);
          return;
        }
        ordem += 10;
        var nome = (x.nome || '').trim().slice(0, 160) || 'Material de apoio';
        if (x.arquivo) inserir.push({ conteudo_id: aulaId, nome: nome, arquivo_path: x.arquivo_path, tamanho: x.tamanho, ordem: ordem });
        else ops.push(sb().from('anexos').update({ nome: nome, ordem: ordem }).eq('id', x.id).then(ok));
      });
      if (inserir.length) ops.push(sb().from('anexos').insert(inserir).then(ok));
      return Promise.all(ops);
    });
    passo.then(function () {
      apagarDepois.forEach(function (x) { ADM.removerArquivo(x[0], x[1]); });
      $('#form-aula').hidden = true;
      ADM.msg(pub === 'rascunho' ? 'Rascunho salvo.' : pub === 'agendar' ? 'Aula agendada para ' + C.data(liberado, true) + '.' : 'Aula publicada.', 'ok');
      mostrarArmazenamento();
      return recarregar();
    }).catch(function (err) {
      enviados.forEach(function (x) { ADM.removerArquivo(x[0], x[1]); }); // não deixa arquivo órfão
      $('#au-envio').hidden = true;
      ADM.falha(err);
    }).then(function () { AC.ocupado(btn, false); });
  }

  /* ===================== Trilhas ===================== */
  function listarTrilhas() {
    var ul = AC.limpar($('#lista-trilhas'));
    var mods = ADM.estado.modulos;
    if (!mods.length) { ul.appendChild(h('li', null, C.vazio('Nenhuma trilha ainda. Crie aqui ou direto no formulário da aula.'))); return; }
    mods.forEach(function (m, i) {
      var aulas = ADM.estado.conteudos.filter(function (c) { return c.modulo_id === m.id; });
      var visiveis = aulas.filter(C.visivelAluno).length;
      ul.appendChild(h('li', { class: 'ac-linha-admin' },
        C.capa(m, 'ac-miniatura'),
        h('div', { class: 'ac-linha-admin__texto' },
          h('strong', null, m.titulo), h('br'),
          h('span', { class: 'ac-meta' }, aulas.length + ' aula' + (aulas.length === 1 ? '' : 's') + ' · ' + visiveis + ' visíve' + (visiveis === 1 ? 'l' : 'is') + ' para os alunos' + (visiveis ? '' : ' (a trilha não aparece na vitrine)'))),
        h('div', { class: 'ac-acoes-linha' },
          botao('↑', function () { mover('modulos', mods, i, i - 1).catch(ADM.falha); }, '', 'Subir ' + m.titulo),
          botao('↓', function () { mover('modulos', mods, i, i + 1).catch(ADM.falha); }, '', 'Descer ' + m.titulo),
          botao('Editar', function () { editarTrilha(m); }),
          botao('Excluir', function (b) { excluirTrilha(m, b, aulas.length); }, 'ac-btn--perigo'))));
    });
  }
  function novaTrilha() {
    var f = $('#form-trilha');
    f.reset();
    $('#tr-id').value = '';
    $('#t-form-trilha').textContent = 'Nova trilha';
    f.hidden = false;
    $('#tr-titulo').focus();
  }
  function editarTrilha(m) {
    var f = $('#form-trilha');
    f.reset();
    $('#tr-id').value = m.id;
    $('#t-form-trilha').textContent = 'Editar trilha';
    $('#tr-titulo').value = m.titulo || '';
    $('#tr-descricao').value = m.descricao || '';
    f.hidden = false;
    f.scrollIntoView({ block: 'start', behavior: 'smooth' });
    $('#tr-titulo').focus({ preventScroll: true });
  }
  function salvarTrilha(e) {
    e.preventDefault();
    var titulo = $('#tr-titulo'), btn = $('#btn-trilha');
    AC.erroCampo(titulo, titulo.value.trim() ? '' : 'Informe o nome da trilha.');
    if (!titulo.value.trim()) { titulo.focus(); return; }
    var id = $('#tr-id').value;
    var atual = ADM.estado.modulos.filter(function (m) { return m.id === id; })[0];
    var dados = { titulo: titulo.value.trim().slice(0, 160), descricao: $('#tr-descricao').value.trim().slice(0, 4000) || null };
    var capa = $('#tr-capa').files[0];
    AC.ocupado(btn, true, 'Salvando…');
    var ultima = ADM.estado.modulos.reduce(function (m, x) { return Math.max(m, x.ordem || 0); }, 0);
    var passo = id
      ? sb().from('modulos').update(dados).eq('id', id).select('id').then(ok)
      : sb().from('modulos').insert(Object.assign({ ordem: ultima + 10, publicado: true }, dados)).select('id').then(ok);
    passo.then(function (linhas) {
      var mid = id || linhas[0].id;
      if (!capa) return;
      var caminho = 'trilhas/' + mid + '/' + ADM.slug(dados.titulo) + '-' + Date.now() + '.' + EXT[capa.type];
      return ADM.enviarArquivo('capas', caminho, capa, IMAGENS, MAX_CAPA).then(function () {
        return sb().from('modulos').update({ capa_path: caminho }).eq('id', mid).then(ok);
      }).then(function () { if (atual && atual.capa_path) return ADM.removerArquivo('capas', atual.capa_path); });
    }).then(function () {
      $('#form-trilha').hidden = true;
      ADM.msg('Trilha salva.', 'ok');
      return recarregar();
    }).catch(ADM.falha).then(function () { AC.ocupado(btn, false); });
  }
  function excluirTrilha(m, b, n) {
    if (!ADM.confirmar('Excluir a trilha "' + m.titulo + '"?' + (n ? ' As ' + n + ' aula(s) dela continuam existindo, sem trilha.' : ''))) return;
    AC.ocupado(b, true, 'Excluindo…');
    sb().from('modulos').delete().eq('id', m.id).then(ok)
      .then(function () { return ADM.removerArquivo('capas', m.capa_path); })
      .then(function () { ADM.msg('Trilha excluída.', 'ok'); return recarregar(); })
      .catch(function (e) { AC.ocupado(b, false); ADM.falha(e); });
  }

  /* ===================== Registro das abas ===================== */
  ADM.registrar('aulas', {
    iniciar: function () {
      $('#nova-aula').addEventListener('click', nova);
      $('#form-aula').addEventListener('submit', salvar);
      $('#busca-aulas').addEventListener('input', listarAulas);
      AC.$$('input[name="au-tipo"]').forEach(function (r) { r.addEventListener('change', mostrarTipo); });
      AC.$$('input[name="au-pub"]').forEach(function (r) { r.addEventListener('change', function () { mostrarPub(); if (pubAtual() === 'agendar') $('#au-quando').focus(); }); });
      $('#au-youtube').addEventListener('input', function () { clearTimeout(esperaPrevia); esperaPrevia = setTimeout(previaYoutube, 300); });
      $('#au-youtube').addEventListener('change', previaYoutube);
      $('#au-trilha').addEventListener('change', function () {
        var nova = this.value === NOVA;
        $('#campo-nova-trilha').hidden = !nova;
        if (nova) $('#au-trilha-nova').focus();
      });
      ligarSoltar($('#au-soltar-pdf'), $('#au-pdf'), escolherPdf);
      ligarSoltar($('#au-soltar-anexos'), $('#au-anexos'), escolherAnexos);
      preencherTrilhas();
    },
    mostrar: function () { listarAulas(); mostrarArmazenamento(); },
    recarregar: recarregar
  });
  ADM.registrar('trilhas', {
    iniciar: function () {
      $('#nova-trilha').addEventListener('click', novaTrilha);
      $('#form-trilha').addEventListener('submit', salvarTrilha);
    },
    mostrar: listarTrilhas,
    recarregar: recarregar
  });
})();
