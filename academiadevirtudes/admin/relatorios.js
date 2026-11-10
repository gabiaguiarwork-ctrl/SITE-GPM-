/*
  Painel · aba Relatórios
  Números gerais, quem nunca acessou, conclusão por conteúdo, últimas ações da auditoria
  e exportação em CSV (aberto direto no Excel, com proteção contra fórmulas).
*/
(function () {
  'use strict';

  var AC = window.AC;
  var ADM = window.AcademiaAdmin;
  var C = window.AcademiaConteudo;
  var h = AC.h;
  var $ = AC.$;

  var ACOES = {
    convidar_aluno: 'Convidou', desativar_aluno: 'Desativou', reativar_aluno: 'Reativou', alterar_papel: 'Mudou o papel',
    criar_encontro: 'Criou encontro', publicar_encontro: 'Publicou encontro', despublicar_encontro: 'Despublicou encontro', excluir_encontro: 'Excluiu encontro',
    criar_conteudo: 'Criou conteúdo', publicar_conteudo: 'Publicou conteúdo', despublicar_conteudo: 'Despublicou conteúdo', excluir_conteudo: 'Excluiu conteúdo',
    criar_aviso: 'Criou aviso', publicar_aviso: 'Publicou aviso', despublicar_aviso: 'Despublicou aviso', excluir_aviso: 'Excluiu aviso',
    exportar_dados_aluno: 'Exportou dados (LGPD)', excluir_dados_aluno: 'Excluiu dados (LGPD)'
  };

  function nomePor(id) {
    var a = ADM.estado.alunos.filter(function (x) { return x.id === id; })[0];
    return a ? (a.nome || a.email) : '';
  }
  function alunosSemAdmin() { return ADM.estado.alunos.filter(function (a) { return a.role !== 'admin'; }); }

  function montar() {
    var alunos = alunosSemAdmin();
    var validos = ADM.conteudosValidos();
    var ativos = alunos.filter(function (a) { return a.ativo; });
    var nunca = ativos.filter(function (a) { return !a.ultimo_acesso; });
    var semana = Date.now() - 7 * 864e5;
    var recentes = ativos.filter(function (a) { return a.ultimo_acesso && new Date(a.ultimo_acesso).getTime() >= semana; });

    var numeros = AC.limpar($('#numeros'));
    [[ativos.length, 'alunos ativos'], [nunca.length, 'nunca acessaram'], [recentes.length, 'acessaram nos últimos 7 dias'], [validos.length, 'conteúdos liberados']]
      .forEach(function (n) { numeros.appendChild(h('div', { class: 'ac-numero' }, h('strong', null, String(n[0])), h('span', null, n[1]))); });

    var caixa = AC.limpar($('#nunca-acessaram'));
    if (!nunca.length) caixa.appendChild(C.vazio('Todos os alunos ativos já acessaram.'));
    else {
      var ul = h('ul', { class: 'ac-previa' });
      nunca.forEach(function (a) { ul.appendChild(h('li', null, (a.nome || '(sem nome)') + ' · ' + a.email + (a.whatsapp ? ' · ' + a.whatsapp : ''))); });
      caixa.appendChild(ul);
    }

    var corpo = AC.limpar($('#tabela-conclusao tbody'));
    var ids = {};
    alunos.forEach(function (a) { ids[a.id] = true; });
    var mods = {};
    ADM.estado.modulos.forEach(function (m) { mods[m.id] = m; });
    if (!validos.length) corpo.appendChild(h('tr', null, h('td', { colspan: '4' }, C.vazio('Nenhum conteúdo liberado ainda.'))));
    linhasConclusao(validos, ids).forEach(function (l) {
      corpo.appendChild(h('tr', null,
        h('td', { 'data-rotulo': 'Conteúdo' }, l.titulo), h('td', { 'data-rotulo': 'Encontro' }, l.encontro),
        h('td', { 'data-rotulo': 'Concluíram' }, l.concluiram + ' (' + l.pct + '%)'), h('td', { 'data-rotulo': 'Começaram' }, String(l.comecaram))));
    });

    ADM.sb().from('auditoria').select('quando, quem, acao, alvo, detalhes').order('quando', { ascending: false }).limit(30).then(function (r) {
      var tb = AC.limpar($('#tabela-auditoria tbody'));
      if (r.error) { tb.appendChild(h('tr', null, h('td', { colspan: '4' }, ADM.textoErro(r.error)))); return; }
      if (!r.data.length) { tb.appendChild(h('tr', null, h('td', { colspan: '4' }, C.vazio('Nada registrado ainda.')))); return; }
      r.data.forEach(function (x) {
        var d = x.detalhes || {};
        var alvo = d.titulo || d.email || nomePor(x.alvo) || (d.de ? d.de + ' → ' + d.para : '') || '—';
        tb.appendChild(h('tr', null,
          h('td', { 'data-rotulo': 'Quando' }, C.data(x.quando, true)), h('td', { 'data-rotulo': 'Quem' }, nomePor(x.quem) || 'Sistema / SQL'),
          h('td', { 'data-rotulo': 'Ação' }, ACOES[x.acao] || x.acao), h('td', { 'data-rotulo': 'Alvo' }, alvo)));
      });
    });
  }

  function linhasConclusao(validos, ids) {
    var mods = {};
    ADM.estado.modulos.forEach(function (m) { mods[m.id] = m; });
    var total = Object.keys(ids).length;
    return validos.map(function (c) {
      var linhas = ADM.estado.progresso.filter(function (p) { return p.conteudo_id === c.id && ids[p.aluno_id]; });
      var concl = linhas.filter(function (p) { return p.concluido; }).length;
      return { titulo: c.titulo, encontro: mods[c.modulo_id].titulo, concluiram: concl, comecaram: linhas.length, pct: total ? Math.round(concl / total * 100) : 0 };
    });
  }

  function csvAlunos() {
    var validos = ADM.conteudosValidos();
    var ids = {};
    validos.forEach(function (c) { ids[c.id] = true; });
    var linhas = [['Nome', 'E-mail', 'WhatsApp', 'Empresa', 'Cargo', 'Papel', 'Status', 'Último acesso', 'Concluídos', 'Total', '% concluído', 'Aceite da privacidade']];
    ADM.estado.alunos.forEach(function (a) {
      var feitos = ADM.estado.progresso.filter(function (p) { return p.aluno_id === a.id && p.concluido && ids[p.conteudo_id]; }).length;
      linhas.push([a.nome, a.email, a.whatsapp, a.empresa, a.cargo, a.role, ADM.statusAluno(a).texto, a.ultimo_acesso ? C.data(a.ultimo_acesso, true) : 'Nunca',
        feitos, validos.length, validos.length ? Math.round(feitos / validos.length * 100) : 0,
        a.aceite_privacidade_em ? C.data(a.aceite_privacidade_em, true) + ' (v' + a.aceite_privacidade_versao + ')' : '']);
    });
    ADM.csv('alunos-academia-' + new Date().toISOString().slice(0, 10) + '.csv', linhas);
  }
  function csvConteudos() {
    var ids = {};
    alunosSemAdmin().forEach(function (a) { ids[a.id] = true; });
    var linhas = [['Encontro', 'Conteúdo', 'Concluíram', 'Começaram', '% dos alunos']];
    linhasConclusao(ADM.conteudosValidos(), ids).forEach(function (l) { linhas.push([l.encontro, l.titulo, l.concluiram, l.comecaram, l.pct]); });
    ADM.csv('conclusao-academia-' + new Date().toISOString().slice(0, 10) + '.csv', linhas);
  }

  ADM.registrar('relatorios', {
    iniciar: function () {
      $('#csv-alunos').addEventListener('click', csvAlunos);
      $('#csv-conteudos').addEventListener('click', csvConteudos);
    },
    mostrar: function () { ADM.carregarAlunos().then(montar).catch(ADM.falha); }
  });
})();
