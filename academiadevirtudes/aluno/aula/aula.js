/*
  /academiadevirtudes/aluno/aula/?id=<uuid>
  Videoaula (YouTube; Vimeo/Panda continuam aceitos) ou material em PDF (Abrir/Baixar),
  descrição, PDFs de apoio, "Marcar como concluída", lista das aulas da mesma trilha
  (ao lado no computador, abaixo no celular) e anterior/próxima.
  A posição do vídeo é salva a cada ~15 s e ao sair da página.
*/
(function () {
  'use strict';

  var AC = window.AC;
  var C = window.AcademiaConteudo;
  var P = window.AcademiaPlayer;
  var CFG = window.ACADEMIA_CONFIG;
  var h = AC.h;
  var alvo = AC.$('#aula');
  var id = AC.parametro('id');
  var INTERVALO = 15000;

  var alunoId = null, aula = null, player = null;
  var salvoSeg = 0, concluido = false;

  window.AcademiaAuth.proteger().then(function (ctx) {
    window.AcademiaLayout.montar(ctx);
    alunoId = ctx.perfil.id;
    if (!C.idValido(id)) return naoEncontrada();
    return C.aula(id).then(function (a) {
      if (!a) return naoEncontrada();
      aula = a;
      return Promise.all([C.trilhas(), C.aulas(), C.anexos(a.id), C.progresso(alunoId)]).then(function (r) {
        montar(C.porId(r[0]), r[1], r[2], r[3]);
      });
    });
  }).catch(function (err) { C.erro(alvo, err); });

  function naoEncontrada() {
    AC.limpar(alvo);
    alvo.appendChild(h('a', { class: 'ac-voltar', href: CFG.rotas.aluno }, '← Início'));
    alvo.appendChild(h('h1', null, 'Aula não encontrada'));
    alvo.appendChild(C.vazio('Esta aula não existe ou ainda não está disponível.'));
  }

  function link(a) { return CFG.rotas.aula + '?id=' + encodeURIComponent(a.id); }

  function montar(trilhas, todas, anexos, progresso) {
    var a = aula;
    var trilha = a.modulo_id ? trilhas[a.modulo_id] : null;
    var prog = progresso[a.id];
    document.title = a.titulo + ' · Área do Aluno · Academia de Virtudes';
    concluido = !!(prog && prog.concluido);
    salvoSeg = prog ? prog.posicao_seg : 0;
    var previa = !C.visivelAluno(a); // só o admin chega aqui com rascunho ou aula agendada
    AC.limpar(alvo);

    var principal = h('div', { class: 'ac-aula__principal' });
    var lateral = h('aside', { class: 'ac-aula__lateral', 'aria-labelledby': 't-lista' });
    alvo.appendChild(h('a', { class: 'ac-voltar', href: CFG.rotas.aluno }, '← Início'));
    alvo.appendChild(h('div', { class: 'ac-aula__grade' }, principal, lateral));

    if (previa) {
      principal.appendChild(h('p', { class: 'ac-msg ac-msg--info ac-aviso-rascunho' },
        a.publicado ? 'Pré-visualização: esta aula está agendada para ' + C.data(a.liberado_em, true) + ' e só a equipe vê. O progresso não é salvo.'
          : 'Pré-visualização: esta aula é rascunho e só a equipe vê. O progresso não é salvo.'));
    }

    // Vídeo ou PDF no topo
    if (a.tipo === 'video') {
      var caixa = h('div', { class: 'ac-player' });
      principal.appendChild(caixa);
      player = P.criar(caixa, {
        provedor: a.provedor, videoId: a.video_id, titulo: a.titulo,
        inicio: concluido ? 0 : salvoSeg,
        aoFim: function () { if (!concluido) marcar(true); }
      });
      iniciarSalvamento();
    } else if (a.tipo === 'pdf' && a.arquivo_path) {
      principal.appendChild(h('div', { class: 'ac-pdf-principal' },
        C.imagem(C.capaAulaUrl(a, trilha), 'ac-pdf-principal__capa', 'pdf'),
        h('div', { class: 'ac-pdf-principal__texto' },
          h('p', { class: 'ac-pdf-principal__rotulo' }, 'Material em PDF'),
          C.botoesArquivo({ caminho: a.arquivo_path, nome: a.arquivo_nome || a.titulo, tamanho: a.arquivo_tamanho }))));
    }

    principal.appendChild(h('div', { class: 'ac-aula__cabeca' },
      trilha ? h('p', { class: 'ac-aula__modulo' }, trilha.titulo) : null,
      h('h1', null, a.titulo),
      h('p', { class: 'ac-sub' }, C.metaAula(a))));

    var botao = h('button', { type: 'button', class: 'ac-btn', id: 'btn-concluir', 'aria-pressed': concluido ? 'true' : 'false' },
      concluido ? '✓ Concluída' : 'Marcar como concluída');
    botao.addEventListener('click', function () { marcar(botao.getAttribute('aria-pressed') !== 'true'); });
    if (!previa) principal.appendChild(h('div', { class: 'ac-aula__acoes' }, botao));
    var msg = h('p', { class: 'ac-msg', id: 'msg-aula', role: 'status', 'aria-live': 'polite', hidden: true });
    principal.appendChild(msg);

    if (a.descricao) principal.appendChild(h('p', { class: 'ac-aula__descricao' }, a.descricao));

    // PDFs de apoio
    if (anexos.length) {
      var lista = h('ul', { class: 'ac-anexos' });
      anexos.forEach(function (x) {
        lista.appendChild(h('li', null, C.botoesArquivo({ caminho: x.arquivo_path, nome: x.nome, tamanho: x.tamanho }, { compacto: true })));
      });
      principal.appendChild(h('section', { class: 'ac-aula__apoio', 'aria-labelledby': 't-apoio' },
        h('h2', { class: 'ac-rotulo-secao', id: 't-apoio' }, 'PDFs de apoio'), lista));
    }
    // Aula antiga com link externo
    if (a.tipo === 'link' && a.url && AC.urlPermitida(a.url) && /^https:\/\//i.test(a.url)) {
      principal.appendChild(h('p', null, h('a', { class: 'ac-btn ac-btn--contorno', href: a.url, target: '_blank', rel: 'noopener noreferrer' }, 'Abrir link ↗')));
    }
    if (a.texto) principal.appendChild(C.markdown(a.texto));

    // Aulas da mesma trilha (ou as sem trilha), na ordem do painel
    var irmas = todas.filter(function (x) { return (x.modulo_id || null) === (a.modulo_id || null) && (C.visivelAluno(x) || x.id === a.id); });
    lateral.appendChild(h('h2', { class: 'ac-rotulo-secao', id: 't-lista' }, trilha ? 'Nesta trilha' : 'Outras aulas'));
    var ul = h('ol', { class: 'ac-lista-aulas' });
    irmas.forEach(function (x) {
      var p = progresso[x.id];
      var atual = x.id === a.id;
      ul.appendChild(h('li', null, h('a', { class: 'ac-lista-aulas__item', href: link(x), 'aria-current': atual ? 'page' : null },
        C.imagem(C.capaAulaUrl(x, trilha), 'ac-lista-aulas__capa', x.tipo),
        h('span', { class: 'ac-lista-aulas__texto' },
          h('span', { class: 'ac-lista-aulas__titulo' }, x.titulo),
          h('span', { class: 'ac-lista-aulas__meta' }, C.metaAula(x) + (p && p.concluido ? ' · ✓ concluída' : ''))))));
    });
    lateral.appendChild(ul);

    var i = irmas.findIndex(function (x) { return x.id === a.id; });
    var ant = i > 0 ? irmas[i - 1] : null;
    var prox = i >= 0 && i < irmas.length - 1 ? irmas[i + 1] : null;
    if (ant || prox) {
      principal.appendChild(h('nav', { class: 'ac-navegacao', 'aria-label': 'Aula anterior e próxima' },
        ant ? h('a', { href: link(ant), rel: 'prev' }, h('span', null, '← Anterior'), ant.titulo) : null,
        prox ? h('a', { class: 'ac-navegacao__proximo', href: link(prox), rel: 'next' }, h('span', null, 'Próxima →'), prox.titulo) : null));
    }

    function marcar(valor) {
      if (previa) return;
      botao.disabled = true;
      var campos = { concluido: valor };
      if (player) campos.posicao_seg = valor ? 0 : player.posicao();
      C.salvarProgresso(alunoId, a.id, campos).then(function () {
        concluido = valor;
        botao.setAttribute('aria-pressed', valor ? 'true' : 'false');
        botao.textContent = valor ? '✓ Concluída' : 'Marcar como concluída';
        AC.mensagem(msg, '');
      }).catch(function (err) {
        AC.mensagem(msg, window.AcademiaAuth.mensagemErro(err), 'erro');
      }).then(function () { botao.disabled = false; });
    }

    // Posição do vídeo: a cada ~15 s (se mudou) e ao esconder/fechar a página.
    function salvarPosicao(forcar) {
      if (previa || !player || concluido) return;
      var seg = Math.floor(player.posicao());
      if (!forcar && Math.abs(seg - salvoSeg) < 5) return;
      salvoSeg = seg;
      C.salvarProgresso(alunoId, a.id, { posicao_seg: seg }).catch(function () { /* tenta de novo no próximo ciclo */ salvoSeg = -999; });
    }
    function iniciarSalvamento() {
      setInterval(function () { if (!document.hidden) salvarPosicao(false); }, INTERVALO);
      document.addEventListener('visibilitychange', function () { if (document.hidden) salvarPosicao(true); });
      window.addEventListener('pagehide', function () { salvarPosicao(true); });
    }
  }
})();
