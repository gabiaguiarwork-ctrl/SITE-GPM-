/*
  /academiadevirtudes/cadastro/
  Cadastro aberto e gratuito: dados completos + senha + aceite da privacidade + CAPTCHA → signUp.
  Depois, sempre a mesma tela "Quase lá" (exista ou não o e-mail), com reenvio do link
  (CAPTCHA + espera mínima entre envios). O acesso abre na confirmação do e-mail (/confirmar/).
*/
(function () {
  'use strict';

  var AC = window.AC;
  var A = window.AcademiaAuth;
  var C = window.AcademiaCampos;
  var CFG = window.ACADEMIA_CONFIG;
  var $ = AC.$;
  var msg = $('#msg');
  var captchaCadastro = null;
  var captchaReenvio = null;
  var emailEnviado = '';
  var relogio = null;

  function erro(t) { AC.mensagem(msg, t, 'erro'); }
  function mostrar(nome) {
    $('#painel-cadastro').hidden = nome !== 'cadastro';
    $('#painel-enviado').hidden = nome !== 'enviado';
    AC.liberar();
  }

  /* ---------- Regras da senha, ao vivo ---------- */
  function atualizarRegras() {
    var r = AC.regrasSenha($('#senha').value);
    AC.$$('#regras [data-regra]').forEach(function (li) { li.classList.toggle('ok', !!r[li.getAttribute('data-regra')]); });
    return r;
  }
  $('#senha').addEventListener('input', atualizarRegras);
  AC.ligarMostrarSenha();
  AC.mascaraWhatsapp($('#whatsapp'));
  C.mascaraCpf($('#cpf'));

  var CAMPOS = [
    [$('#nome'), C.erroTexto('nome')],
    [$('#sobrenome'), C.erroTexto('sobrenome')],
    [$('#email'), C.erroEmail],
    [$('#whatsapp'), C.erroWhatsapp],
    [$('#cpf'), C.erroCpf],
    [$('#empresa'), C.erroTexto('empresa')],
    [$('#cargo'), C.erroTexto('cargo')],
    [$('#senha'), function () { return atualizarRegras().ok ? '' : 'A senha ainda não atende a todas as regras.'; }],
    [$('#confirma'), function (v) { return v && v === $('#senha').value ? '' : 'As senhas não são iguais.'; }],
    [$('#aceite'), function () { return $('#aceite').checked ? '' : 'Para criar o acesso, aceite a Política de Privacidade.'; }]
  ];
  C.ligarCorrecao(CAMPOS);
  $('#aceite').addEventListener('change', function () { if (this.checked) AC.erroCampo(this, ''); });

  /* ---------- Enviar ---------- */
  $('#form-cadastro').addEventListener('submit', function (e) {
    e.preventDefault();
    AC.mensagem(msg, '');
    if (!C.validar(CAMPOS)) return;
    var token = captchaCadastro && captchaCadastro.token();
    if (!token) { erro('Conclua a verificação de segurança antes de continuar.'); return; }

    var email = $('#email').value.trim().toLowerCase();
    var dados = {
      email: email,
      nome: C.limparTexto($('#nome').value),
      sobrenome: C.limparTexto($('#sobrenome').value),
      whatsapp: C.whatsappDigitos($('#whatsapp').value),
      cpf: C.soDigitos($('#cpf').value),
      empresa: C.limparTexto($('#empresa').value),
      cargo: C.limparTexto($('#cargo').value),
      aceite_comunicacoes: $('#comunicacoes').checked
    };
    var btn = $('#btn-cadastro');
    AC.ocupado(btn, true, 'Enviando…');
    A.cadastrar(dados, $('#senha').value, token).then(function (r) {
      $('#senha').value = '';
      $('#confirma').value = '';
      atualizarRegras();
      if (r.etapa === 'logado') {
        // Só acontece se o painel estiver sem "Confirm email": grava o aceite e segue.
        return A.aceitarPrivacidade().then(function () { A.irPara(CFG.rotas.entrar); });
      }
      emailEnviado = email;
      abrirEnviado();
    }).catch(function (err) {
      var texto = A.mensagemErro(err);
      if (err && (err.code === 'weak_password' || err.name === 'AuthWeakPasswordError')) {
        AC.erroCampo($('#senha'), texto);
        $('#senha').focus();
      } else if (err && (err.code === 'email_address_invalid' || err.code === 'validation_failed')) {
        AC.erroCampo($('#email'), 'Informe um e-mail válido.');
        $('#email').focus();
      }
      erro(texto);
    }).then(function () {
      AC.ocupado(btn, false);
      if (captchaCadastro) captchaCadastro.reset();
    });
  });

  /* ---------- "Quase lá" e reenvio ---------- */
  function abrirEnviado() {
    AC.mensagem(msg, '');
    AC.mensagem($('#msg-reenvio'), '');
    $('#enviado-email').textContent = emailEnviado;
    mostrar('enviado');
    if (!captchaReenvio) {
      captchaReenvio = A.captcha($('#captcha-reenvio'), null, null, function (t) { AC.mensagem($('#msg-reenvio'), t, 'erro'); });
    }
    esperar(CFG.reenvioSegundos || 60);
    var t = $('#t-enviado');
    setTimeout(function () { t.focus(); }, 30);
  }

  function esperar(segundos) {
    var btn = $('#btn-reenvio'), aviso = $('#espera-reenvio');
    var fim = Date.now() + segundos * 1000;
    clearInterval(relogio);
    btn.disabled = true;
    var passo = function () {
      var falta = Math.ceil((fim - Date.now()) / 1000);
      if (falta <= 0) {
        clearInterval(relogio);
        btn.disabled = false;
        aviso.textContent = '';
        return;
      }
      aviso.textContent = 'Você pode pedir outro envio em ' + falta + ' s.';
    };
    passo();
    relogio = setInterval(passo, 1000);
  }

  $('#btn-reenvio').addEventListener('click', function () {
    var btn = this, aviso = $('#msg-reenvio');
    AC.mensagem(aviso, '');
    var token = captchaReenvio && captchaReenvio.token();
    if (!token) { AC.mensagem(aviso, 'Conclua a verificação de segurança antes de reenviar.', 'erro'); return; }
    AC.ocupado(btn, true, 'Enviando…');
    A.reenviarConfirmacao(emailEnviado, token).then(function () {
      AC.ocupado(btn, false);
      AC.mensagem(aviso, 'Se houver um cadastro aguardando confirmação para este e-mail, enviamos um novo link. Pode levar alguns minutos.', 'ok');
      esperar(CFG.reenvioSegundos || 60);
    }).catch(function (err) {
      AC.ocupado(btn, false);
      AC.mensagem(aviso, A.mensagemErro(err), 'erro');
    }).then(function () {
      if (captchaReenvio) captchaReenvio.reset();
    });
  });

  $('#corrigir-email').addEventListener('click', function () {
    clearInterval(relogio);
    mostrar('cadastro');
    $('#email').focus();
    $('#email').select();
  });

  /* ---------- Início ---------- */
  try { A.cliente(); } catch (e) { mostrar('cadastro'); erro(A.mensagemErro(e)); return; }

  A.sessao().then(function (sessao) {
    // Já está logado: a tela de entrada conduz para o lugar certo.
    if (sessao) { A.irPara(CFG.rotas.entrar); return; }
    mostrar('cadastro');
    captchaCadastro = A.captcha($('#captcha-cadastro'), null, null, erro);
    setTimeout(function () { $('#nome').focus(); }, 30);
  }).catch(function (err) {
    mostrar('cadastro');
    captchaCadastro = A.captcha($('#captcha-cadastro'), null, null, erro);
    erro(A.mensagemErro(err));
  });
})();
