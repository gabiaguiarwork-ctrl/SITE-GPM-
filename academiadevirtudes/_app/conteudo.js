/*
  Área do Aluno · Academia de Virtudes
  Conteúdo: aulas (videoaula ou PDF), trilhas opcionais, PDFs de apoio, progresso,
  arquivos (URL assinada de 60 s no clique), cards da vitrine e markdown simples.

  Banco: public.conteudos = aulas; public.modulos = trilhas; public.anexos = PDFs de apoio.

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

  /* ---------- Datas e números ---------- */
  var FUSO = 'America/Sao_Paulo';
  var DIA = 864e5;
  C.data = function (iso, comHora) {
    if (!iso) return '';
    var o = { timeZone: FUSO, day: '2-digit', month: '2-digit', year: 'numeric' };
    if (comHora) { o.hour = '2-digit'; o.minute = '2-digit'; }
    return new Intl.DateTimeFormat('pt-BR', o).format(new Date(iso));
  };
  // Liberada: sem data ou com a data já passada (vale para aula; trilha não tem mais data).
  C.liberado = function (x) { return !x.liberado_em || new Date(x.liberado_em).getTime() <= Date.now(); };
  C.duracao = function (min) {
    if (!min) return '';
    if (min < 60) return min + ' min';
    var hrs = Math.floor(min / 60), r = min % 60;
    return hrs + 'h' + (r ? String(r).padStart(2, '0') : '');
  };
  C.tamanho = function (bytes) {
    var b = Number(bytes);
    if (!b || b < 0) return '';
    if (b < 1024 * 1024) return Math.max(1, Math.round(b / 1024)) + ' KB';
    if (b >= 1024 * 1024 * 1024) { var gb = b / (1024 * 1024 * 1024); return (gb < 10 ? gb.toFixed(1) : String(Math.round(gb))).replace(/.0$/, '').replace('.', ',') + ' GB'; }
    var mb = b / (1024 * 1024);
    return (mb < 10 ? mb.toFixed(1) : String(Math.round(mb))).replace('.', ',') + ' MB';
  };
  C.rotuloTipo = function (tipo) { return { video: 'Videoaula', pdf: 'PDF', texto: 'Texto', link: 'Link' }[tipo] || ''; };
  C.normalizar = function (t) { return String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); };

  /* ---------- Aula: visibilidade, datas e textos curtos ---------- */
  // O que o aluno vê (a RLS já filtra; aqui é para o admin ver a vitrine como aluno).
  C.visivelAluno = function (a) { return !!a.publicado && C.liberado(a); };
  // Quando a aula ficou disponível (para "Novidades" e o selo "Novo").
  C.disponivelEm = function (a) {
    var p = a.publicado_em ? new Date(a.publicado_em).getTime() : 0;
    var l = a.liberado_em ? new Date(a.liberado_em).getTime() : 0;
    var c = a.criado_em ? new Date(a.criado_em).getTime() : 0;
    return Math.max(p, l) || c;
  };
  C.novo = function (a) { var t = C.disponivelEm(a); return !!t && Date.now() - t < 7 * DIA; };
  C.metaAula = function (a) {
    if (a.tipo === 'pdf') return ['PDF', C.tamanho(a.arquivo_tamanho)].filter(Boolean).join(' · ');
    if (a.tipo === 'video') return ['Videoaula', C.duracao(a.duracao_min)].filter(Boolean).join(' · ');
    return C.rotuloTipo(a.tipo);
  };
  C.situacaoAdmin = function (a) {
    if (!a.publicado) return { id: 'rascunho', texto: 'Rascunho' };
    if (!C.liberado(a)) return { id: 'agendada', texto: 'Agendada · ' + C.data(a.liberado_em, true) };
    return { id: 'publicada', texto: 'Publicada' };
  };

  /* ---------- YouTube ---------- */
  var YT_ID = /^[A-Za-z0-9_-]{11}$/;
  C.youtubeIdValido = function (v) { return YT_ID.test(String(v || '')); };
  // Aceita youtube.com/watch?v=, youtu.be/, youtube.com/shorts/, youtube.com/live/, /embed/ e o ID puro.
  C.youtubeId = function (texto) {
    var t = String(texto || '').trim();
    if (YT_ID.test(t)) return t;
    var u;
    try { u = new URL(/^https?:\/\//i.test(t) ? t : 'https://' + t); } catch (e) { return ''; }
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return '';
    var host = u.hostname.toLowerCase().replace(/^(www|m|music)\./, '');
    var partes = u.pathname.split('/').filter(Boolean);
    var id = '';
    if (host === 'youtu.be') id = partes[0] || '';
    else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
      if (partes[0] === 'watch') id = u.searchParams.get('v') || '';
      else if (['shorts', 'live', 'embed', 'v'].indexOf(partes[0]) >= 0) id = partes[1] || '';
    }
    return YT_ID.test(id) ? id : '';
  };
  // hq720: 16:9 sem as faixas pretas da hqdefault (que apareciam no pôster em pé). Se o vídeo não tiver, C.imagem tenta a hqdefault.
  C.youtubeCapa = function (id) { return C.youtubeIdValido(id) ? 'https://i.ytimg.com/vi/' + id + '/hq720.jpg' : ''; };

  /* ---------- Capas ---------- */
  // Bucket público "capas" (só caminhos no formato aceito pelo banco).
  C.capaUrl = function (caminho) {
    if (!caminho || !/^[a-z0-9][a-z0-9/_.-]*\.(jpg|jpeg|png|webp)$/.test(caminho) || caminho.indexOf('..') >= 0) return '';
    return CFG.supabaseUrl + '/storage/v1/object/public/capas/' + caminho.split('/').map(encodeURIComponent).join('/');
  };
  // Capa da aula: a própria; senão a do YouTube; senão a da trilha.
  C.capaAulaUrl = function (a, trilha) {
    return C.capaUrl(a.capa_path) || (a.provedor === 'youtube' ? C.youtubeCapa(a.video_id) : '') || (trilha ? C.capaUrl(trilha.capa_path) : '');
  };
  function capaVazia(classe, tipo) {
    return h('div', { class: classe + ' ' + classe + '--vazia', 'aria-hidden': 'true' },
      h('img', { src: '/assets/academia-de-virtudes-simbolo.webp', alt: '', width: '56', height: '56' }),
      tipo === 'pdf' ? h('span', { class: 'ac-capa-pdf' }, 'PDF') : null);
  }
  C.imagem = function (url, classe, tipo) {
    if (!url) return capaVazia(classe, tipo);
    var img = h('img', { class: classe, src: url, alt: '', loading: 'lazy', decoding: 'async' });
    // Capa apagada ou fora do ar: mostra o símbolo da Academia no lugar do ícone de imagem quebrada.
    img.addEventListener('error', function () {
      if (/\/hq720\.jpg$/.test(img.src)) { img.src = img.src.replace(/hq720\.jpg$/, 'hqdefault.jpg'); return; }
      if (img.parentNode) img.parentNode.replaceChild(capaVazia(classe, tipo), img);
    });
    return img;
  };
  C.capa = function (m, classe) { return C.imagem(C.capaUrl(m.capa_path), classe); };

  /* ---------- Consultas ---------- */
  var CAMPOS_TRILHA = 'id, titulo, descricao, capa_path, ordem';
  var CAMPOS_AULA = 'id, modulo_id, titulo, tipo, descricao, provedor, video_id, duracao_min, arquivo_path, arquivo_nome, arquivo_tamanho, url, texto, capa_path, ordem, publicado, liberado_em, publicado_em, destaque, criado_em';
  var CAMPOS_ANEXO = 'id, conteudo_id, nome, arquivo_path, tamanho, ordem';
  function dados(r) { if (r.error) throw r.error; return r.data; }

  C.trilhas = function () {
    return A.cliente().from('modulos').select(CAMPOS_TRILHA).order('ordem').order('titulo').then(dados);
  };
  C.aulas = function () {
    return A.cliente().from('conteudos').select(CAMPOS_AULA).order('ordem').order('titulo').then(dados);
  };
  C.aula = function (id) {
    return A.cliente().from('conteudos').select(CAMPOS_AULA).eq('id', id).maybeSingle().then(dados);
  };
  C.anexos = function (aulaId) {
    var q = A.cliente().from('anexos').select(CAMPOS_ANEXO);
    if (aulaId) q = q.eq('conteudo_id', aulaId);
    return q.order('ordem').order('nome').then(dados);
  };
  C.avisos = function () {
    return A.cliente().from('avisos').select('id, titulo, texto, criado_em').eq('publicado', true)
      .order('criado_em', { ascending: false }).limit(5).then(dados);
  };
  C.porId = function (lista) { var m = {}; (lista || []).forEach(function (x) { m[x.id] = x; }); return m; };

  // Progresso do aluno logado: { [aula_id]: { concluido, posicao_seg, atualizado_em } }
  C.progresso = function (alunoId) {
    return A.cliente().from('progresso').select('conteudo_id, concluido, posicao_seg, atualizado_em')
      .eq('aluno_id', alunoId).then(dados).then(function (linhas) {
        var m = {};
        (linhas || []).forEach(function (l) { m[l.conteudo_id] = l; });
        return m;
      });
  };
  C.salvarProgresso = function (alunoId, aulaId, campos) {
    var linha = { aluno_id: alunoId, conteudo_id: aulaId };
    if ('concluido' in campos) linha.concluido = !!campos.concluido;
    if ('posicao_seg' in campos) linha.posicao_seg = Math.max(0, Math.min(86400, Math.floor(campos.posicao_seg || 0)));
    return A.cliente().from('progresso').upsert(linha, { onConflict: 'aluno_id,conteudo_id' }).then(function (r) {
      if (r.error) throw r.error;
    });
  };
  // Porcentagem assistida (só quando a duração é conhecida).
  C.pctAssistido = function (aula, p) {
    if (!p || !aula.duracao_min || !p.posicao_seg) return null;
    return Math.max(2, Math.min(98, Math.round(p.posicao_seg / (aula.duracao_min * 60) * 100)));
  };

  /* ---------- Arquivos (bucket privado, URL assinada de 60 s gerada no clique) ---------- */
  function nomeArquivo(nome) {
    var n = String(nome || 'material').replace(/[^\wÀ-ſ .()-]/g, '').trim() || 'material';
    return /\.pdf$/i.test(n) ? n : n + '.pdf';
  }
  C.urlArquivo = function (caminho, nome, baixar) {
    return A.cliente().storage.from('materiais').createSignedUrl(caminho, 60, baixar ? { download: nomeArquivo(nome) } : undefined)
      .then(function (r) {
        if (r.error || !r.data || !r.data.signedUrl) throw r.error || new Error('sem url');
        var url = r.data.signedUrl;
        if (url.indexOf(CFG.supabaseUrl + '/storage/v1/') !== 0) throw new Error('url inesperada');
        return url;
      });
  };
  // Baixar: a resposta vem com "attachment", então baixa sem sair da página.
  C.baixar = function (caminho, nome) {
    return C.urlArquivo(caminho, nome, true).then(function (url) { location.assign(url); });
  };
  // Abrir: a aba é aberta já no clique (senão o navegador bloqueia) e recebe o endereço depois.
  C.abrir = function (caminho, nome) {
    var janela = null;
    try { janela = window.open('', '_blank'); } catch (e) { janela = null; }
    if (janela) { try { janela.opener = null; } catch (e) { /* ok */ } }
    return C.urlArquivo(caminho, nome, false).then(function (url) {
      if (janela && !janela.closed) janela.location.replace(url);
      else location.assign(url);
    }, function (err) {
      if (janela && !janela.closed) janela.close();
      throw err;
    });
  };
  // arq = { caminho, nome, tamanho }
  C.botoesArquivo = function (arq, opcoes) {
    opcoes = opcoes || {};
    var aviso = h('span', { class: 'ac-arquivo__msg', role: 'status', 'aria-live': 'polite' });
    function botao(rotulo, acao, classe, rotuloAcessivel) {
      var b = h('button', { type: 'button', class: 'ac-btn ' + classe, 'aria-label': rotuloAcessivel }, rotulo);
      b.addEventListener('click', function () {
        AC.ocupado(b, true, 'Preparando…');
        aviso.textContent = '';
        acao(arq.caminho, arq.nome).catch(function () {
          aviso.textContent = 'Não foi possível abrir o arquivo agora. Tente de novo em instantes.';
        }).then(function () { setTimeout(function () { AC.ocupado(b, false); }, 800); });
      });
      return b;
    }
    var nome = arq.nome || 'PDF';
    return h('div', { class: 'ac-arquivo' + (opcoes.compacto ? ' ac-arquivo--compacto' : '') },
      h('div', { class: 'ac-arquivo__info' },
        h('span', { class: 'ac-arquivo__icone', 'aria-hidden': 'true' }, 'PDF'),
        h('span', null, h('span', { class: 'ac-arquivo__nome' }, nome),
          arq.tamanho ? h('span', { class: 'ac-arquivo__tamanho' }, ' · ' + C.tamanho(arq.tamanho)) : null)),
      h('div', { class: 'ac-arquivo__acoes' },
        botao('Abrir', C.abrir, 'ac-btn--mini ac-btn--contorno ac-abrir', 'Abrir ' + nome),
        botao('Baixar', C.baixar, 'ac-btn--mini ac-baixar', 'Baixar ' + nome)),
      aviso);
  };

  /* ---------- Card de aula (vitrine) ---------- */
  // opcoes = { trilha, progresso (linha do aluno), mostrarBarra }
  C.cardAula = function (a, opcoes) {
    opcoes = opcoes || {};
    var p = opcoes.progresso;
    var feito = !!(p && p.concluido);
    var pct = opcoes.mostrarBarra && !feito ? C.pctAssistido(a, p) : null;
    // Pôster em pé (vitrine): imagem, sombra embaixo e o título escrito por cima da imagem.
    var capa = h('div', { class: 'ac-tile__capa' + (pct !== null ? ' ac-tile__capa--barra' : '') },
      C.imagem(C.capaAulaUrl(a, opcoes.trilha), 'ac-tile__img', a.tipo),
      h('span', { class: 'ac-tile__sombra', 'aria-hidden': 'true' }),
      C.novo(a) && !feito ? h('span', { class: 'ac-tile__selo' }, 'Novo') : null,
      feito ? h('span', { class: 'ac-tile__feito' }, h('span', { 'aria-hidden': 'true' }, '✓'), h('span', { class: 'ac-sr-only' }, 'Concluída')) : null,
      h('span', { class: 'ac-tile__sobre' },
        opcoes.trilha && opcoes.mostrarTrilha ? h('span', { class: 'ac-tile__trilha' }, opcoes.trilha.titulo) : null,
        h('span', { class: 'ac-tile__titulo' }, a.titulo)),
      pct !== null ? h('span', { class: 'ac-tile__trilho', 'aria-hidden': 'true' }, h('span', { class: 'ac-tile__barra', 'data-pct': String(pct) })) : null);
    var meta = C.metaAula(a);
    return h('a', { class: 'ac-tile', href: CFG.rotas.aula + '?id=' + encodeURIComponent(a.id) },
      capa,
      meta ? h('span', { class: 'ac-tile__corpo' }, h('span', { class: 'ac-tile__meta' }, meta)) : null);
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
      h('span', { class: 'ac-progresso__texto' }, total ? feitos + ' de ' + total + ' concluída' + (feitos === 1 ? '' : 's') : 'Sem aulas ainda'));
  };
  // Largura das barras sem atributo style: classe por faixa de 5%.
  C.ajustarBarras = function (raiz) {
    AC.$$('[data-pct]', raiz).forEach(function (b) {
      var p = Math.max(0, Math.min(100, Math.round(Number(b.getAttribute('data-pct')) / 5) * 5));
      b.classList.add('ac-pct-' + p);
    });
  };

  window.AcademiaConteudo = Object.freeze(C);
})();
