/*
  Área do Aluno · Academia de Virtudes
  Conteúdo: encontros, aulas, progresso, materiais (URL assinada) e markdown simples.

  Markdown: só cria elementos (h2, h3, p, ul, ol, li, blockquote, strong, em, a, br).
  Nenhum HTML do texto é interpretado: tudo vira textContent.
*/
(function () {
  'use strict';

  var AC = window.AC;
  var A = window.AcademiaAuth;
  var CFG = window.ACADEMIA_CONFIG;
  var h = AC.h;
  var C = {};

  var UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  C.idValido = function (v) { return UUID.test(String(v || '')); };

  /* ---------- Datas ---------- */
  var FUSO = 'America/Sao_Paulo';
  C.data = function (iso, comHora) {
    if (!iso) return '';
    var o = { timeZone: FUSO, day: '2-digit', month: '2-digit', year: 'numeric' };
    if (comHora) { o.hour = '2-digit'; o.minute = '2-digit'; }
    return new Intl.DateTimeFormat('pt-BR', o).format(new Date(iso));
  };
  C.liberado = function (m) { return !m.liberado_em || new Date(m.liberado_em).getTime() <= Date.now(); };
  C.duracao = function (min) {
    if (!min) return '';
    if (min < 60) return min + ' min';
    var hrs = Math.floor(min / 60), r = min % 60;
    return hrs + 'h' + (r ? String(r).padStart(2, '0') : '');
  };
  C.rotuloTipo = function (tipo) { return { video: 'Vídeo', pdf: 'PDF', texto: 'Texto', link: 'Link' }[tipo] || ''; };

  /* ---------- Capas (bucket público "capas") ---------- */
  C.capaUrl = function (caminho) {
    if (!caminho || !/^[a-z0-9][a-z0-9/_.-]*\.(jpg|jpeg|png|webp)$/.test(caminho) || caminho.indexOf('..') >= 0) return '';
    return CFG.supabaseUrl + '/storage/v1/object/public/capas/' + caminho.split('/').map(encodeURIComponent).join('/');
  };
  function capaVazia(classe) {
    return h('div', { class: classe + ' ' + classe + '--vazia', 'aria-hidden': 'true' },
      h('img', { src: '/assets/academia-de-virtudes-simbolo.webp', alt: '', width: '56', height: '56' }));
  }
  C.capa = function (m, classe) {
    var url = C.capaUrl(m.capa_path);
    if (!url) return capaVazia(classe);
    var img = h('img', { class: classe, src: url, alt: '', loading: 'lazy', decoding: 'async' });
    // Capa apagada ou fora do ar: mostra o símbolo da Academia no lugar do ícone de imagem quebrada.
    img.addEventListener('error', function () { if (img.parentNode) img.parentNode.replaceChild(capaVazia(classe), img); });
    return img;
  };

  /* ---------- Consultas ---------- */
  var CAMPOS_MODULO = 'id, titulo, subtitulo, descricao, capa_path, ordem, publicado, liberado_em';
  var CAMPOS_CONTEUDO = 'id, modulo_id, titulo, tipo, descricao, provedor, video_id, duracao_min, arquivo_path, arquivo_nome, url, texto, ordem, publicado';
  function dados(r) { if (r.error) throw r.error; return r.data; }

  C.modulos = function () {
    return A.cliente().from('modulos').select(CAMPOS_MODULO).order('ordem').order('titulo').then(dados);
  };
  C.modulo = function (id) {
    return A.cliente().from('modulos').select(CAMPOS_MODULO).eq('id', id).maybeSingle().then(dados);
  };
  C.conteudos = function (moduloId) {
    var q = A.cliente().from('conteudos').select(CAMPOS_CONTEUDO);
    if (moduloId) q = q.eq('modulo_id', moduloId);
    return q.order('ordem').order('titulo').then(dados);
  };
  C.conteudo = function (id) {
    return A.cliente().from('conteudos').select(CAMPOS_CONTEUDO).eq('id', id).maybeSingle().then(dados);
  };
  C.avisos = function () {
    return A.cliente().from('avisos').select('id, titulo, texto, criado_em').eq('publicado', true)
      .order('criado_em', { ascending: false }).limit(5).then(dados);
  };

  // Progresso do aluno logado: { [conteudo_id]: { concluido, posicao_seg, atualizado_em } }
  C.progresso = function (alunoId) {
    return A.cliente().from('progresso').select('conteudo_id, concluido, posicao_seg, atualizado_em')
      .eq('aluno_id', alunoId).then(dados).then(function (linhas) {
        var m = {};
        (linhas || []).forEach(function (l) { m[l.conteudo_id] = l; });
        return m;
      });
  };
  C.salvarProgresso = function (alunoId, conteudoId, campos) {
    var linha = { aluno_id: alunoId, conteudo_id: conteudoId };
    if ('concluido' in campos) linha.concluido = !!campos.concluido;
    if ('posicao_seg' in campos) linha.posicao_seg = Math.max(0, Math.min(86400, Math.floor(campos.posicao_seg || 0)));
    return A.cliente().from('progresso').upsert(linha, { onConflict: 'aluno_id,conteudo_id' }).then(function (r) {
      if (r.error) throw r.error;
    });
  };

  // Conteúdo visível só para quem pode ver o encontro liberado (a RLS já filtra; aqui é só para a tela).
  C.visivel = function (c, modulosPorId) {
    var m = modulosPorId[c.modulo_id];
    return !!m && C.liberado(m);
  };

  /* ---------- Materiais (bucket privado, URL assinada de 60 s no clique) ---------- */
  C.baixar = function (conteudo) {
    var nome = (conteudo.arquivo_nome || conteudo.titulo || 'material').replace(/[^\wÀ-ſ .()-]/g, '').trim() || 'material';
    if (!/\.pdf$/i.test(nome)) nome += '.pdf';
    return A.cliente().storage.from('materiais').createSignedUrl(conteudo.arquivo_path, 60, { download: nome })
      .then(function (r) {
        if (r.error || !r.data || !r.data.signedUrl) throw r.error || new Error('sem url');
        var url = r.data.signedUrl;
        if (url.indexOf(CFG.supabaseUrl + '/storage/v1/') !== 0) throw new Error('url inesperada');
        location.assign(url); // resposta com "attachment": baixa sem sair da página
      });
  };
  C.botaoBaixar = function (conteudo, rotulo) {
    var b = h('button', { type: 'button', class: 'ac-btn ac-btn--contorno ac-baixar' }, rotulo || 'Baixar PDF');
    var aviso = h('span', { class: 'ac-baixar__msg', role: 'status', 'aria-live': 'polite' });
    b.addEventListener('click', function () {
      AC.ocupado(b, true, 'Preparando…');
      aviso.textContent = '';
      C.baixar(conteudo).catch(function () {
        aviso.textContent = 'Não foi possível baixar agora. Tente de novo em instantes.';
      }).then(function () { setTimeout(function () { AC.ocupado(b, false); }, 800); });
    });
    return h('span', { class: 'ac-baixar__caixa' }, b, aviso);
  };

  /* ---------- Markdown simples → elementos ---------- */
  function linkSeguro(url) {
    return /^https:\/\/[^\s/\\]/i.test(url) || /^mailto:[^\s]+$/i.test(url);
  }
  // **negrito**, *itálico*, [texto](https://…)
  function inline(texto) {
    var frag = document.createDocumentFragment();
    var re = /\*\*([^*]+)\*\*|\*([^*]+)\*|\[([^\]]{1,200})\]\(([^)\s]{1,600})\)/g;
    var pos = 0, m;
    while ((m = re.exec(texto))) {
      if (m.index > pos) frag.appendChild(document.createTextNode(texto.slice(pos, m.index)));
      if (m[1] !== undefined) frag.appendChild(h('strong', null, m[1]));
      else if (m[2] !== undefined) frag.appendChild(h('em', null, m[2]));
      else if (linkSeguro(m[4])) frag.appendChild(h('a', { href: m[4], target: '_blank', rel: 'noopener noreferrer' }, m[3]));
      else frag.appendChild(document.createTextNode(m[3]));
      pos = re.lastIndex;
    }
    if (pos < texto.length) frag.appendChild(document.createTextNode(texto.slice(pos)));
    return frag;
  }
  C.markdown = function (texto) {
    var raiz = h('div', { class: 'ac-texto' });
    var linhas = String(texto || '').replace(/\r\n?/g, '\n').split('\n');
    var lista = null, tipoLista = '', paragrafo = [], citacao = null;
    function fecharParagrafo() {
      if (!paragrafo.length) return;
      var p = h('p');
      paragrafo.forEach(function (l, i) { if (i) p.appendChild(h('br')); p.appendChild(inline(l)); });
      raiz.appendChild(p);
      paragrafo = [];
    }
    function fecharTudo() { fecharParagrafo(); lista = null; tipoLista = ''; citacao = null; }
    linhas.forEach(function (bruta) {
      var l = bruta.replace(/\s+$/, '');
      var m;
      if (!l.trim()) { fecharTudo(); return; }
      if ((m = l.match(/^(#{2,3})\s+(.+)$/))) { fecharTudo(); raiz.appendChild(h(m[1].length === 2 ? 'h2' : 'h3', null, inline(m[2]))); return; }
      if ((m = l.match(/^\s*[-*]\s+(.+)$/)) || (m = l.match(/^\s*\d{1,3}[.)]\s+(.+)$/))) {
        var tipo = /^\s*\d/.test(l) ? 'ol' : 'ul';
        fecharParagrafo(); citacao = null;
        if (!lista || tipoLista !== tipo) { lista = h(tipo); tipoLista = tipo; raiz.appendChild(lista); }
        lista.appendChild(h('li', null, inline(m[1])));
        return;
      }
      if ((m = l.match(/^>\s?(.*)$/))) {
        fecharParagrafo(); lista = null;
        if (!citacao) { citacao = h('blockquote'); raiz.appendChild(citacao); }
        citacao.appendChild(h('p', null, inline(m[1])));
        return;
      }
      lista = null; citacao = null;
      paragrafo.push(l.trim());
    });
    fecharTudo();
    return raiz;
  };

  /* ---------- Estados de tela ---------- */
  C.vazio = function (texto) { return h('p', { class: 'ac-vazio' }, texto); };
  C.erro = function (alvo, err) {
    AC.limpar(alvo);
    alvo.appendChild(h('p', { class: 'ac-msg ac-msg--erro', role: 'alert' }, A.mensagemErro(err)));
  };
  C.barra = function (feitos, total) {
    var pct = total ? Math.round((feitos / total) * 100) : 0;
    return h('div', { class: 'ac-progresso' },
      h('div', { class: 'ac-progresso__trilho', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(pct), 'aria-label': 'Progresso' },
        h('div', { class: 'ac-progresso__barra', 'data-pct': String(pct) })),
      h('span', { class: 'ac-progresso__texto' }, total ? feitos + ' de ' + total + ' concluído' + (feitos === 1 ? '' : 's') : 'Sem conteúdos ainda'));
  };
  // Largura da barra sem atributo style: classe por faixa de 5%.
  C.ajustarBarras = function (raiz) {
    AC.$$('.ac-progresso__barra[data-pct]', raiz).forEach(function (b) {
      var p = Math.max(0, Math.min(100, Math.round(Number(b.getAttribute('data-pct')) / 5) * 5));
      b.classList.add('ac-pct-' + p);
    });
  };

  window.AcademiaConteudo = Object.freeze(C);
})();
