/*
  /academiadevirtudes/aluno/perfil/
  Dados do aluno, consentimento de comunicações, troca de senha (confirma a senha atual com CAPTCHA),
  MFA opcional e saída.
*/
(function () {
  'use strict';

  var AC = window.AC;
  var A = window.AcademiaAuth;
  var CFG = window.ACADEMIA_CONFIG;
  var C = window.AcademiaCampos;
  var $ = AC.$;
  var perfil = null;
  var captchaSenha = null;
  var fatorEmCadastro = null;

  A.proteger().then(function (ctx) {
    perfil = ctx.perfil;
    window.AcademiaLayout.montar(ctx);
    preencherDados();
    mostrarComunicacoes();
    carregarMfa();
    captchaSenha = A.captcha($('#captcha-senha'), null, null, function (t) { AC.mensagem($('#msg-senha'), t, 'erro'); });
    var aceite = perfil.aceite_privacidade_versao;
    $('#aceite-info').textContent = aceite ? 'Você aceitou a Política de Privacidade (versão ' + aceite + ').' : '';
  });

  AC.ligarMostrarSenha();
  AC.mascaraWhatsapp($('#whatsapp'));

  /* ---------- Dados ---------- */
  var CAMPOS = [
    [$('#nome'), C.erroTexto('nome')],
    [$('#sobrenome'), C.erroTexto('sobrenome')],
    [$('#whatsapp'), C.erroWhatsapp],
    [$('#empresa'), C.erroTexto('empresa')],
    [$('#cargo'), C.erroTexto('cargo')]
  ];
  C.ligarCorrecao(CAMPOS);

  function preencherDados() {
    $('#nome').value = perfil.nome || '';
    $('#sobrenome').value = perfil.sobrenome || '';
    $('#email').value = perfil.email || '';
    $('#whatsapp').value = perfil.whatsapp ? C.formatarWhatsapp(perfil.whatsapp) : '';
    $('#cpf').value = C.mascararCpf(perfil.cpf) || 'Não informado';
    $('#empresa').value = perfil.empresa || '';
    $('#cargo').value = perfil.cargo || '';
  }

  $('#form-dados').addEventListener('submit', function (e) {
    e.preventDefault();
    var btn = $('#btn-dados'), msg = $('#msg-dados');
    AC.mensagem(msg, '');
    if (!C.validar(CAMPOS)) return;
    var dados = {
      nome: C.limparTexto($('#nome').value),
      sobrenome: C.limparTexto($('#sobrenome').value),
      whatsapp: C.whatsappDigitos($('#whatsapp').value),
      empresa: C.limparTexto($('#empresa').value),
      cargo: C.limparTexto($('#cargo').value)
    };
    AC.ocupado(btn, true, 'Salvando…');
    A.cliente().from('profiles').update(dados).eq('id', perfil.id).select('id').then(function (r) {
      AC.ocupado(btn, false);
      if (r.error || !r.data || !r.data.length) { AC.mensagem(msg, A.mensagemErro(r.error), 'erro'); return; }
      Object.assign(perfil, dados);
      window.AcademiaLayout && AC.$$('[data-nome]').forEach(function (el) { el.textContent = AC.primeiroNome(perfil.nome); });
      AC.mensagem(msg, 'Dados salvos.', 'ok');
    });
  });

  /* ---------- Comunicações ---------- */
  function mostrarComunicacoes() {
    var caixa = $('#comunicacoes');
    caixa.checked = perfil.aceite_comunicacoes === true;
    var quando = perfil.aceite_comunicacoes_em ? new Date(perfil.aceite_comunicacoes_em).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '';
    $('#comunicacoes-data').textContent = !quando ? 'Você não pediu para receber comunicações.'
      : perfil.aceite_comunicacoes ? 'Você aceitou receber comunicações em ' + quando + '.'
      : 'Você retirou o consentimento em ' + quando + '.';
  }

  $('#comunicacoes').addEventListener('change', function () {
    var caixa = this, msg = $('#msg-comunicacoes');
    var aceito = caixa.checked;
    AC.mensagem(msg, '');
    caixa.disabled = true;
    A.definirComunicacoes(aceito).then(function (quando) {
      perfil.aceite_comunicacoes = aceito;
      perfil.aceite_comunicacoes_em = quando || perfil.aceite_comunicacoes_em;
      mostrarComunicacoes();
      AC.mensagem(msg, aceito ? 'Pronto. Você vai receber as comunicações dos próximos encontros.' : 'Pronto. Você não vai mais receber essas comunicações.', 'ok');
    }).catch(function (err) {
      caixa.checked = !aceito;
      AC.mensagem(msg, A.mensagemErro(err), 'erro');
    }).then(function () { caixa.disabled = false; });
  });

  /* ---------- Senha ---------- */
  function atualizarRegras() {
    var r = AC.regrasSenha($('#nova').value);
    AC.$$('#regras [data-regra]').forEach(function (li) { li.classList.toggle('ok', !!r[li.getAttribute('data-regra')]); });
    return r;
  }
  $('#nova').addEventListener('input', atualizarRegras);
  $('#codigo-senha').addEventListener('input', function () { this.value = this.value.replace(/\D/g, '').slice(0, 6); });

  var precisaCodigo = false;

  $('#form-senha').addEventListener('submit', function (e) {
    e.preventDefault();
    var atual = $('#atual'), nova = $('#nova'), confirma = $('#confirma'), codigo = $('#codigo-senha');
    var btn = $('#btn-senha'), msg = $('#msg-senha');
    AC.mensagem(msg, '');
    var r = atualizarRegras();
    AC.erroCampo(atual, atual.value ? '' : 'Informe a senha atual.');
    AC.erroCampo(nova, r.ok ? '' : 'A nova senha ainda não atende a todas as regras.');
    AC.erroCampo(confirma, confirma.value === nova.value ? '' : 'As senhas não são iguais.');
    if (!atual.value) { atual.focus(); return; }
    if (!r.ok) { nova.focus(); return; }
    if (confirma.value !== nova.value) { confirma.focus(); return; }
    if (precisaCodigo && !/^\d{6}$/.test(codigo.value)) { AC.erroCampo(codigo, 'Digite os 6 dígitos do código.'); codigo.focus(); return; }

    var passo;
    if (precisaCodigo) {
      // Senha atual já conferida; falta só o código do autenticador.
      passo = A.mfaVerificar(codigo.value);
    } else {
      var token = captchaSenha && captchaSenha.token();
      if (!token) { AC.mensagem(msg, 'Conclua a verificação de segurança antes de trocar a senha.', 'erro'); return; }
      // Confere a senha atual entrando de novo com ela (a sessão é renovada).
      passo = A.entrar(perfil.email, atual.value, token).then(function () {
        return A.mfaNivel();
      }).then(function (n) {
        if (n.nextLevel === 'aal2' && n.currentLevel !== 'aal2') {
          precisaCodigo = true;
          $('#campo-codigo-senha').hidden = false;
          AC.mensagem(msg, 'Senha atual confirmada. Digite o código do aplicativo autenticador para concluir.', 'info');
          codigo.focus();
          throw { pararSemErro: true };
        }
      });
    }

    AC.ocupado(btn, true, 'Salvando…');
    passo.then(function () {
      return A.cliente().auth.updateUser({ password: nova.value });
    }).then(function (res) {
      if (res.error) throw res.error;
      atual.value = nova.value = confirma.value = codigo.value = '';
      precisaCodigo = false;
      $('#campo-codigo-senha').hidden = true;
      atualizarRegras();
      AC.mensagem(msg, 'Senha trocada.', 'ok');
    }).catch(function (err) {
      if (err && err.pararSemErro) return;
      var texto = A.mensagemErro(err, precisaCodigo ? '' : 'login');
      if (texto === 'E-mail ou senha incorretos.') texto = 'A senha atual está incorreta.';
      AC.mensagem(msg, texto, 'erro');
    }).then(function () {
      AC.ocupado(btn, false);
      if (captchaSenha && !precisaCodigo) captchaSenha.reset();
    });
  });

  /* ---------- MFA opcional ---------- */
  function carregarMfa() {
    A.mfaFatores().then(function (f) {
      var ativo = f.verificados.length > 0;
      var st = $('#mfa-status');
      st.textContent = ativo ? 'Ativada' : 'Desativada';
      st.classList.toggle('ac-selo--ok', ativo);
      $('#mfa-ativar').hidden = ativo;
      $('#mfa-desativar').hidden = !ativo || perfil.role === 'admin'; // admin não pode desligar o MFA
      $('#mfa-desativar').dataset.fator = ativo ? f.verificados[0].id : '';
    }).catch(function (err) { AC.mensagem($('#msg-mfa'), A.mensagemErro(err), 'erro'); });
  }

  $('#mfa-ativar').addEventListener('click', function () {
    var btn = this, msg = $('#msg-mfa');
    AC.mensagem(msg, '');
    AC.ocupado(btn, true, 'Preparando…');
    A.mfaCadastrar().then(function (c) {
      fatorEmCadastro = c.id;
      $('#mfa-qr').src = c.qr;
      $('#mfa-segredo').textContent = c.segredo;
      $('#mfa-cadastro').hidden = false;
      btn.hidden = true;
      $('#mfa-codigo').focus();
    }).catch(function (err) { AC.mensagem(msg, A.mensagemErro(err), 'erro'); })
      .then(function () { AC.ocupado(btn, false); });
  });

  $('#mfa-codigo').addEventListener('input', function () { this.value = this.value.replace(/\D/g, '').slice(0, 6); });
  $('#form-mfa').addEventListener('submit', function (e) {
    e.preventDefault();
    var codigo = $('#mfa-codigo'), btn = $('#btn-mfa'), msg = $('#msg-mfa');
    if (!/^\d{6}$/.test(codigo.value)) { AC.erroCampo(codigo, 'Digite os 6 dígitos do código.'); return; }
    AC.erroCampo(codigo, '');
    AC.ocupado(btn, true, 'Confirmando…');
    A.mfaVerificar(codigo.value, fatorEmCadastro).then(function () {
      $('#mfa-cadastro').hidden = true;
      $('#mfa-segredo').textContent = '';
      $('#mfa-qr').removeAttribute('src');
      codigo.value = '';
      fatorEmCadastro = null;
      AC.mensagem(msg, 'Verificação em duas etapas ativada. Nas próximas entradas, o código vai ser pedido.', 'ok');
      carregarMfa();
    }).catch(function (err) { codigo.value = ''; AC.mensagem(msg, A.mensagemErro(err), 'erro'); })
      .then(function () { AC.ocupado(btn, false); });
  });

  $('#mfa-desativar').addEventListener('click', function () {
    var btn = this, msg = $('#msg-mfa');
    if (!window.confirm('Desativar a verificação em duas etapas? A entrada vai pedir só a senha.')) return;
    AC.ocupado(btn, true, 'Desativando…');
    A.mfaRemover(btn.dataset.fator).then(function () {
      AC.mensagem(msg, 'Verificação em duas etapas desativada.', 'ok');
      carregarMfa();
    }).catch(function (err) { AC.mensagem(msg, A.mensagemErro(err), 'erro'); })
      .then(function () { AC.ocupado(btn, false); });
  });

  /* ---------- Sair de todos os dispositivos ---------- */
  $('#sair-todos').addEventListener('click', function () {
    var btn = this;
    if (!window.confirm('Sair de todos os aparelhos em que você entrou na Área do Aluno?')) return;
    AC.ocupado(btn, true, 'Saindo…');
    A.sair(true).then(function () { A.irPara(CFG.rotas.entrar); });
  });
})();
