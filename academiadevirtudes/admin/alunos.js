/*
  Painel · aba Alunos
  Lista com busca, status e filtro de comunicações; convidar, importar CSV, reenviar convite,
  desativar/reativar, tornar admin/aluno, exportar e excluir dados (LGPD).
  As ações sensíveis passam pelas Edge Functions.
*/
(function () {
  'use strict';

  var AC = window.AC;
  var ADM = window.AcademiaAdmin;
  var C = window.AcademiaConteudo;
  var CP = window.AcademiaCampos;
  var h = AC.h;
  var $ = AC.$;
  var importacao = [];

  function progressoDe(alunoId, validos) {
    if (!validos.length) return { feitos: 0, total: 0 };
    var ids = {};
    validos.forEach(function (c) { ids[c.id] = true; });
    var feitos = ADM.estado.progresso.filter(function (p) { return p.aluno_id === alunoId && p.concluido && ids[p.conteudo_id]; }).length;
    return { feitos: feitos, total: validos.length };
  }

  function listar() {
    var busca = $('#busca-alunos').value.trim().toLowerCase();
    var filtro = $('#filtro-status').value;
    var comunicacoes = $('#filtro-comunicacoes').value;
    var validos = ADM.conteudosValidos();
    var corpo = AC.limpar($('#tabela-alunos tbody'));
    // CPF repetido em mais de uma conta (o banco não impede, para o cadastro não revelar quem já tem conta)
    var cpfs = {};
    ADM.estado.alunos.forEach(function (a) { if (a.cpf) cpfs[a.cpf] = (cpfs[a.cpf] || 0) + 1; });
    var lista = ADM.estado.alunos.filter(function (a) {
      var st = ADM.statusAluno(a).id;
      if (filtro === 'admin' && a.role !== 'admin') return false;
      if (filtro && filtro !== 'admin' && st !== filtro) return false;
      if (comunicacoes === 'sim' && !a.aceite_comunicacoes) return false;
      if (comunicacoes === 'nao' && a.aceite_comunicacoes) return false;
      if (!busca) return true;
      return [ADM.nomeCompleto(a), a.email, a.empresa, a.cargo].some(function (v) { return v && v.toLowerCase().indexOf(busca) >= 0; });
    });
    $('#contagem-alunos').textContent = lista.length + ' de ' + ADM.estado.alunos.length + ' pessoa' + (ADM.estado.alunos.length === 1 ? '' : 's');
    if (!lista.length) {
      corpo.appendChild(h('tr', null, h('td', { colspan: '5' }, C.vazio('Ninguém encontrado.'))));
      return;
    }
    lista.forEach(function (a) {
      var st = ADM.statusAluno(a);
      var pr = progressoDe(a.id, validos);
      var pct = pr.total ? Math.round(pr.feitos / pr.total * 100) : 0;
      var eu = a.id === ADM.estado.perfil.id;
      var acoes = h('div', { class: 'ac-acoes-linha' });
      if (st.id === 'pendente') acoes.appendChild(botao('Reenviar convite', function (b) { reenviar(a, b); }));
      if (!eu) acoes.appendChild(botao(a.ativo ? 'Desativar' : 'Reativar', function (b) { status(a, b); }, a.ativo ? 'perigo' : ''));
      if (!eu) acoes.appendChild(botao(a.role === 'admin' ? 'Tornar aluno' : 'Tornar admin', function (b) { papel(a, b); }));
      acoes.appendChild(botao('Exportar dados', function (b) { exportar(a, b); }));
      if (!eu && a.role !== 'admin') acoes.appendChild(botao('Excluir dados', function (b) { excluir(a, b); }, 'perigo'));

      var trabalho = [a.empresa, a.cargo].filter(Boolean).join(' · ');
      var conta = [
        a.cpf ? 'CPF ' + CP.mascararCpf(a.cpf) : 'Sem CPF',
        'Cadastro em ' + C.data(a.criado_em),
        a.origem === 'convite' ? 'Convite' : 'Cadastro próprio',
        'E-mail confirmado: ' + (a.email_confirmado_em ? 'sim' : 'não'),
        'Comunicações: ' + (a.aceite_comunicacoes ? 'sim' + (a.aceite_comunicacoes_em ? ' (' + C.data(a.aceite_comunicacoes_em) + ')' : '') : 'não')
      ].join(' · ');
      corpo.appendChild(h('tr', null,
        h('td', { 'data-rotulo': 'Aluno' },
          h('strong', null, ADM.nomeCompleto(a) || '(sem nome)'), a.role === 'admin' ? h('span', { class: 'ac-selo ac-selo--mini' }, 'Admin') : null,
          a.cpf && cpfs[a.cpf] > 1 ? h('span', { class: 'ac-selo ac-selo--mini ac-selo--alerta', title: 'Este CPF aparece em mais de uma conta' }, 'CPF repetido') : null, h('br'),
          h('span', { class: 'ac-meta' }, a.email || ''), a.whatsapp ? h('span', { class: 'ac-meta' }, ' · ' + CP.formatarWhatsapp(a.whatsapp)) : null,
          trabalho ? [h('br'), h('span', { class: 'ac-meta' }, trabalho)] : null,
          h('br'), h('span', { class: 'ac-meta ac-meta--fraca' }, conta)),
        h('td', { 'data-rotulo': 'Status' }, h('span', { class: 'ac-selo ac-selo--mini ac-status--' + st.id }, st.texto)),
        h('td', { 'data-rotulo': 'Último acesso' }, a.ultimo_acesso ? C.data(a.ultimo_acesso, true) : 'Nunca'),
        h('td', { 'data-rotulo': 'Progresso' }, pr.total ? pct + '% (' + pr.feitos + '/' + pr.total + ')' : '—'),
        h('td', { 'data-rotulo': 'Ações' }, acoes)));
    });
  }

  function botao(texto, fn, tipo) {
    var b = h('button', { type: 'button', class: 'ac-btn ac-btn--mini' + (tipo === 'perigo' ? ' ac-btn--perigo' : ' ac-btn--contorno') }, texto);
    b.addEventListener('click', function () { fn(b); });
    return b;
  }

  function recarregar() {
    return ADM.carregarAlunos().then(listar).catch(ADM.falha);
  }

  /* ---------- Ações ---------- */
  function executar(b, rotulo, promessa) {
    AC.ocupado(b, true, rotulo);
    return promessa.then(function (r) {
      ADM.msg((r && (r.aviso || r.mensagem)) || 'Feito.', r && r.aviso ? 'info' : 'ok');
      return recarregar();
    }).catch(function (err) { AC.ocupado(b, false); ADM.falha(err); });
  }
  function reenviar(a, b) {
    executar(b, 'Enviando…', ADM.chamar('convidar-aluno', { nome: a.nome || a.email, sobrenome: a.sobrenome || '', email: a.email, whatsapp: a.whatsapp || '', empresa: a.empresa || '', cargo: a.cargo || '' }));
  }
  function status(a, b) {
    var desativar = a.ativo;
    if (desativar && !ADM.confirmar('Desativar o acesso de ' + (ADM.nomeCompleto(a) || a.email) + '? A pessoa perde o acesso na hora, mesmo se estiver com a página aberta.')) return;
    executar(b, desativar ? 'Desativando…' : 'Reativando…', ADM.chamar('alterar-status-aluno', { id: a.id, ativo: !desativar }));
  }
  function papel(a, b) {
    var novo = a.role === 'admin' ? 'aluno' : 'admin';
    var texto = novo === 'admin'
      ? 'Dar acesso ao painel para ' + (a.nome || a.email) + '? No próximo acesso ao painel, a pessoa vai cadastrar o aplicativo autenticador.'
      : 'Tirar o acesso ao painel de ' + (a.nome || a.email) + '?';
    if (!ADM.confirmar(texto)) return;
    executar(b, 'Salvando…', ADM.chamar('alterar-papel-aluno', { id: a.id, papel: novo }));
  }
  function exportar(a, b) {
    AC.ocupado(b, true, 'Exportando…');
    ADM.chamar('dados-aluno', { id: a.id, acao: 'exportar' }).then(function (dados) {
      var url = URL.createObjectURL(new Blob([JSON.stringify(dados, null, 2)], { type: 'application/json' }));
      var link = h('a', { href: '#', download: 'dados-' + ADM.slug(a.nome || a.email) + '.json' });
      link.setAttribute('href', url);
      document.body.appendChild(link);
      link.click();
      setTimeout(function () { URL.revokeObjectURL(url); link.remove(); }, 1000);
      ADM.msg('Dados exportados. Envie o arquivo só para o próprio aluno.', 'ok');
    }).catch(ADM.falha).then(function () { AC.ocupado(b, false); });
  }
  function excluir(a, b) {
    var digitado = window.prompt('Excluir TODOS os dados de ' + (a.nome || a.email) + ' (conta, perfil e progresso)? Isso não pode ser desfeito.\n\nPara confirmar, digite o e-mail do aluno:');
    if (digitado === null) return;
    if (digitado.trim().toLowerCase() !== String(a.email || '').toLowerCase()) { ADM.msg('O e-mail digitado não confere. Nada foi excluído.', 'erro'); return; }
    executar(b, 'Excluindo…', ADM.chamar('dados-aluno', { id: a.id, acao: 'excluir', confirmacao: digitado.trim() }));
  }

  /* ---------- Convite ---------- */
  function abrirConvite() {
    $('#form-importar').hidden = true;
    var f = $('#form-convite');
    f.reset();
    f.hidden = false;
    $('#cv-nome').focus();
  }
  function enviarConvite(e) {
    e.preventDefault();
    var nome = $('#cv-nome'), email = $('#cv-email'), btn = $('#btn-convite');
    var okNome = nome.value.trim().length >= 2, okEmail = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.value.trim());
    AC.erroCampo(nome, okNome ? '' : 'Informe o nome.');
    AC.erroCampo(email, okEmail ? '' : 'Informe um e-mail válido.');
    if (!okNome) { nome.focus(); return; }
    if (!okEmail) { email.focus(); return; }
    AC.ocupado(btn, true, 'Enviando…');
    ADM.chamar('convidar-aluno', {
      nome: nome.value.trim(), sobrenome: $('#cv-sobrenome').value.trim(), email: email.value.trim().toLowerCase(), whatsapp: $('#cv-whatsapp').value.trim(),
      empresa: $('#cv-empresa').value.trim(), cargo: $('#cv-cargo').value.trim(), papel: $('#cv-papel').value
    }).then(function (r) {
      $('#form-convite').hidden = true;
      ADM.msg((r && r.aviso) || ('Convite enviado para ' + email.value.trim().toLowerCase() + '.'), r && r.aviso ? 'info' : 'ok');
      return recarregar();
    }).catch(ADM.falha).then(function () { AC.ocupado(btn, false); });
  }

  /* ---------- Importar CSV ---------- */
  function abrirImportar() {
    $('#form-convite').hidden = true;
    var f = $('#form-importar');
    f.reset();
    importacao = [];
    AC.limpar($('#im-previa'));
    $('#btn-importar').disabled = true;
    f.hidden = false;
    $('#im-arquivo').focus();
  }
  function lerArquivo() {
    var arq = this.files && this.files[0];
    var previa = AC.limpar($('#im-previa'));
    importacao = [];
    $('#btn-importar').disabled = true;
    if (!arq) return;
    if (arq.size > 500000) { previa.appendChild(h('p', { class: 'ac-msg ac-msg--erro' }, 'Arquivo grande demais (máximo 500 KB).')); return; }
    arq.text().then(function (t) {
      var linhas = ADM.lerCsv(t);
      if (linhas === null) { previa.appendChild(h('p', { class: 'ac-msg ac-msg--erro' }, 'Não encontrei as colunas "nome" e "email" na primeira linha.')); return; }
      var existentes = {};
      ADM.estado.alunos.forEach(function (a) { if (a.email) existentes[a.email.toLowerCase()] = true; });
      var novos = linhas.filter(function (l) { return l.email && !existentes[l.email]; });
      var jaTem = linhas.length - novos.length;
      if (novos.length > 100) { previa.appendChild(h('p', { class: 'ac-msg ac-msg--erro' }, 'São ' + novos.length + ' pessoas novas. Divida em arquivos de até 100.')); return; }
      importacao = novos;
      previa.appendChild(h('p', { class: 'ac-msg ac-msg--info' }, novos.length + ' convite(s) para enviar' + (jaTem ? ' · ' + jaTem + ' linha(s) ignorada(s) (já cadastrado ou sem e-mail)' : '') + '.'));
      var ul = h('ul', { class: 'ac-previa' });
      novos.slice(0, 8).forEach(function (l) { ul.appendChild(h('li', null, ([l.nome, l.sobrenome].filter(Boolean).join(' ') || '(sem nome)') + ' · ' + l.email)); });
      if (novos.length > 8) ul.appendChild(h('li', null, '… e mais ' + (novos.length - 8)));
      previa.appendChild(ul);
      $('#btn-importar').disabled = !novos.length;
    });
  }
  function enviarImportacao(e) {
    e.preventDefault();
    if (!importacao.length) return;
    if (!ADM.confirmar('Enviar ' + importacao.length + ' convite(s) agora?')) return;
    var btn = $('#btn-importar');
    AC.ocupado(btn, true, 'Enviando convites…');
    ADM.chamar('importar-alunos', { alunos: importacao }).then(function (r) {
      var previa = AC.limpar($('#im-previa'));
      previa.appendChild(h('p', { class: 'ac-msg ' + (r.enviados === r.total ? 'ac-msg--ok' : 'ac-msg--info') }, r.enviados + ' de ' + r.total + ' convite(s) enviado(s).'));
      var falhas = (r.resultados || []).filter(function (x) { return !x.ok; });
      if (falhas.length) {
        var ul = h('ul', { class: 'ac-previa' });
        falhas.forEach(function (x) { ul.appendChild(h('li', null, 'Linha ' + x.linha + ' · ' + x.email + ': ' + x.mensagem)); });
        previa.appendChild(ul);
      }
      importacao = [];
      return recarregar();
    }).catch(ADM.falha).then(function () { AC.ocupado(btn, false); $('#btn-importar').disabled = true; });
  }

  ADM.registrar('alunos', {
    iniciar: function () {
      $('#busca-alunos').addEventListener('input', listar);
      $('#filtro-status').addEventListener('change', listar);
      $('#filtro-comunicacoes').addEventListener('change', listar);
      $('#abrir-convite').addEventListener('click', abrirConvite);
      $('#abrir-importar').addEventListener('click', abrirImportar);
      $('#form-convite').addEventListener('submit', enviarConvite);
      $('#form-importar').addEventListener('submit', enviarImportacao);
      $('#im-arquivo').addEventListener('change', lerArquivo);
      AC.mascaraWhatsapp($('#cv-whatsapp'));
    },
    mostrar: function () { listar(); },
    recarregar: recarregar
  });
})();
