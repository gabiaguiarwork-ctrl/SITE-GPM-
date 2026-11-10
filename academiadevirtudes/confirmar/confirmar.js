/*
  /academiadevirtudes/confirmar/
  Link do e-mail "Confirme seu e-mail" (cadastro aberto):
  - Valida o token_hash (verifyOtp, type 'email' ou 'signup') → a pessoa fica logada.
  - Grava o aceite da Política de Privacidade (marcado no cadastro) com aceitar_privacidade().
  - Segue para /entrar/, que conduz MFA, cadastro completo e destino.
  Link expirado, já usado ou ausente: formulário para pedir outro (CAPTCHA + espera entre envios),
  com a mesma mensagem exista ou não o e-mail.
*/
(function () {
  'use strict';

  var AC = window.AC;
  var A = window.AcademiaAuth;
  var C = window.AcademiaCampos;
  var CFG = window.ACADEMIA_CONFIG;
  var LINK = window.ACADEMIA_LINK || {};
  var $ = AC.$;
  var msg = $('#msg');
  var captcha = null;
  var relogio = null;

  function mostrar(nome) {
    $('#painel-ok').hidden = nome !== 'ok';
    $('#painel-reenviar').hidden = nome !== 'reenviar';
    AC.liberar();
    var titulo = $('#t-' + nome);
    if (titulo) setTimeout(function () { titulo.focus(); }, 30);
  }

  function abrirReenvio(semLink) {
    if (semLink) {
      $('#t-reenviar').textContent = 'Confirmar e-mail';
      $('#sub-reenviar').textContent = 'Informe o e-mail do cadastro para receber um novo link de confirmação.';
    }
    mostrar('reenviar');
    if (!captcha) captcha = A.captcha($('#captcha-reenviar'), null, null, function (t) { AC.mensagem(msg, t, 'erro'); });
  }

  function confirmado() {
    // O aceite foi marcado no cadastro; aqui ele é gravado de forma confiável (pela função do banco).
    return A.aceitarPrivacidade().then(function () {
      $('#versao-privacidade').textContent = CFG.privacidade.versao;
      mostrar('ok');
      setTimeout(function () { A.irPara(CFG.rotas.entrar); }, 1500);
    }, function () {
      // Não gravou (ex.: rede): /entrar/ já está com a sessão e pede o aceite de novo.
      A.irPara(CFG.rotas.entrar);
    });
  }

  /* ---------- Pedir novo link ---------- */
  function esperar(segundos) {
    var btn = $('#btn-reenviar'), aviso = $('#espera-reenvio');
    var fim = Date.now() + segundos * 1000;
    clearInterval(relogio);
    btn.disabled = true;
    var passo = function () {
      var falta = Math.ceil((fim - Date.now()) / 1000);
      if (falta <= 0) { clearInterval(relogio); btn.disabled = false; aviso.textContent = ''; return; }
      aviso.textContent = 'Você pode pedir outro envio em ' + falta + ' s.';
    };
    passo();
    relogio = setInterval(passo, 1000);
  }

  $('#form-reenviar').addEventListener('submit', function (e) {
    e.preventDefault();
    AC.mensagem(msg, '');
    var email = $('#email'), btn = $('#btn-reenviar');
    if (!C.validar([[email, C.erroEmail]])) return;
    var token = captcha && captcha.token();
    if (!token) { AC.mensagem(msg, 'Conclua a verificação de segurança antes de enviar.', 'erro'); return; }
    AC.ocupado(btn, true, 'Enviando…');
    A.reenviarConfirmacao(email.value, token).then(function () {
      AC.ocupado(btn, false);
      AC.mensagem(msg, 'Se houver um cadastro aguardando confirmação para este e-mail, enviamos um novo link. Pode levar alguns minutos; confira também o spam.', 'ok');
      esperar(CFG.reenvioSegundos || 60);
    }).catch(function (err) {
      AC.ocupado(btn, false);
      AC.mensagem(msg, A.mensagemErro(err), 'erro');
    }).then(function () {
      if (captcha) captcha.reset();
    });
  });

  /* ---------- Início: validar o link ---------- */
  var sb;
  try { sb = A.cliente(); } catch (e) { abrirReenvio(false); AC.mensagem(msg, A.mensagemErro(e), 'erro'); return; }

  if (LINK.erro) { abrirReenvio(false); return; }

  if (LINK.tokenHash) {
    if (['email', 'signup'].indexOf(LINK.tipo) < 0) { abrirReenvio(false); return; }
    sb.auth.verifyOtp({ token_hash: LINK.tokenHash, type: LINK.tipo }).then(function (r) {
      if (r.error) throw r.error;
      return confirmado();
    }).catch(function () { abrirReenvio(false); });
    return;
  }

  if (LINK.temCodigo || LINK.temTokenNoHash) {
    // Link no formato antigo: o cliente Supabase já está trocando o código pela sessão.
    A.sessao().then(function (s) {
      if (location.search || location.hash) history.replaceState(null, '', location.pathname);
      if (!s) { abrirReenvio(false); return; }
      return confirmado();
    }).catch(function () { abrirReenvio(false); });
    return;
  }

  // Sem link: quem já está logado segue; os outros podem pedir um novo link.
  A.sessao().then(function (s) {
    if (s) { A.irPara(CFG.rotas.entrar); return; }
    abrirReenvio(true);
  }).catch(function () { abrirReenvio(true); });
})();
