/*
  /academiadevirtudes/aluno/aula/?id=<uuid>
  Vídeo (Vimeo ou Panda), texto de apoio, material para baixar, "Marcar como concluído",
  anterior/próximo. A posição do vídeo é salva a cada ~15 s e ao sair da página.
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

  var alunoId = null, conteudo = null, player = null;
  var salvoSeg = 0, concluido = false;

  window.AcademiaAuth.proteger().then(function (ctx) {
    window.AcademiaLayout.montar(ctx);
    alunoId = ctx.perfil.id;
    if (!C.idValido(id)) return naoEncontrado();
    return C.conteudo(id).then(function (c) {
      if (!c) return naoEncontrado();
      conteudo = c;
      return Promise.all([C.modulo(c.modulo_id), C.conteudos(c.modulo_id), C.progresso(alunoId)]).then(function (r) {
        if (!r[0]) return naoEncontrado();
        montar(r[0], r[1], r[2][c.id]);
      });
    });
  }).catch(function (err) { C.erro(alvo, err); });

  function naoEncontrado() {
    AC.limpar(alvo);
    alvo.appendChild(h('a', { class: 'ac-voltar', href: CFG.rotas.aluno }, '← Todos os encontros'));
    alvo.appendChild(h('h1', null, 'Aula não encontrada'));
    alvo.appendChild(C.vazio('Esta aula não existe ou ainda não está disponível.'));
  }

  function montar(m, irmaos, prog) {
    var c = conteudo;
    document.title = c.titulo + ' · Área do Aluno · Academia de Virtudes';
    concluido = !!(prog && prog.concluido);
    salvoSeg = prog ? prog.posicao_seg : 0;
    var rascunho = !c.publicado || !m.publicado;
    AC.limpar(alvo);

    if (rascunho) alvo.appendChild(h('p', { class: 'ac-msg ac-msg--info ac-aviso-rascunho' }, 'Pré-visualização: este conteúdo é rascunho e só a equipe vê. O progresso não é salvo.'));

    // Vídeo
    if (c.tipo === 'video') {
      var caixa = h('div', { class: 'ac-player' });
      alvo.appendChild(caixa);
      player = P.criar(caixa, {
        provedor: c.provedor, videoId: c.video_id, titulo: c.titulo,
        inicio: concluido ? 0 : salvoSeg,
        aoFim: function () { if (!concluido) marcar(true); }
      });
      iniciarSalvamento();
    }

    alvo.appendChild(h('div', { class: 'ac-aula__cabeca' },
      h('a', { class: 'ac-aula__modulo', href: CFG.rotas.encontro + '?id=' + encodeURIComponent(m.id) }, m.titulo),
      h('h1', null, c.titulo),
      h('p', { class: 'ac-sub' }, [C.rotuloTipo(c.tipo), C.duracao(c.duracao_min)].filter(Boolean).join(' · '))));
    if (c.descricao) alvo.appendChild(h('p', null, c.descricao));

    // Ações: concluir, material, link
    var botao = h('button', { type: 'button', class: 'ac-btn', id: 'btn-concluir', 'aria-pressed': concluido ? 'true' : 'false' },
      concluido ? '✓ Concluído' : 'Marcar como concluído');
    botao.addEventListener('click', function () { marcar(botao.getAttribute('aria-pressed') !== 'true'); });
    var acoes = h('div', { class: 'ac-aula__acoes' }, rascunho ? null : botao);
    if (c.arquivo_path) acoes.appendChild(C.botaoBaixar(c, c.arquivo_nome ? 'Baixar: ' + c.arquivo_nome : 'Baixar PDF'));
    if (c.tipo === 'link' && c.url && AC.urlPermitida(c.url) && /^https:\/\//i.test(c.url)) {
      acoes.appendChild(h('a', { class: 'ac-btn ac-btn--contorno', href: c.url, target: '_blank', rel: 'noopener noreferrer' }, 'Abrir link ↗'));
    }
    alvo.appendChild(acoes);
    var msg = h('p', { class: 'ac-msg', id: 'msg-aula', role: 'status', 'aria-live': 'polite', hidden: true });
    alvo.appendChild(msg);

    if (c.texto) alvo.appendChild(C.markdown(c.texto));

    // Anterior / próximo dentro do encontro
    var i = irmaos.findIndex(function (x) { return x.id === c.id; });
    var ant = i > 0 ? irmaos[i - 1] : null;
    var prox = i >= 0 && i < irmaos.length - 1 ? irmaos[i + 1] : null;
    if (ant || prox) {
      alvo.appendChild(h('nav', { class: 'ac-navegacao', 'aria-label': 'Aulas do encontro' },
        ant ? h('a', { href: CFG.rotas.aula + '?id=' + encodeURIComponent(ant.id), rel: 'prev' }, h('span', null, '← Anterior'), ant.titulo) : null,
        prox ? h('a', { class: 'ac-navegacao__proximo', href: CFG.rotas.aula + '?id=' + encodeURIComponent(prox.id), rel: 'next' }, h('span', null, 'Próxima →'), prox.titulo) : null));
    }

    function marcar(valor) {
      if (rascunho) return;
      botao.disabled = true;
      var campos = { concluido: valor };
      if (player) campos.posicao_seg = valor ? 0 : player.posicao();
      C.salvarProgresso(alunoId, c.id, campos).then(function () {
        concluido = valor;
        botao.setAttribute('aria-pressed', valor ? 'true' : 'false');
        botao.textContent = valor ? '✓ Concluído' : 'Marcar como concluído';
        AC.mensagem(msg, '');
      }).catch(function (err) {
        AC.mensagem(msg, window.AcademiaAuth.mensagemErro(err), 'erro');
      }).then(function () { botao.disabled = false; });
    }

    // Posição do vídeo: a cada ~15 s (se mudou) e ao esconder/fechar a página.
    function salvarPosicao(forcar) {
      if (rascunho || !player || concluido) return;
      var seg = Math.floor(player.posicao());
      if (!forcar && Math.abs(seg - salvoSeg) < 5) return;
      salvoSeg = seg;
      C.salvarProgresso(alunoId, c.id, { posicao_seg: seg }).catch(function () { /* tenta de novo no próximo ciclo */ salvoSeg = -999; });
    }
    function iniciarSalvamento() {
      setInterval(function () { if (!document.hidden) salvarPosicao(false); }, INTERVALO);
      document.addEventListener('visibilitychange', function () { if (document.hidden) salvarPosicao(true); });
      window.addEventListener('pagehide', function () { salvarPosicao(true); });
    }
  }
})();
