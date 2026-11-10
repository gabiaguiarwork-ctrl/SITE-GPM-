/*
  /academiadevirtudes/entrar/
  Login (e-mail + senha + CAPTCHA) → código do autenticador (se tiver) → aceite da privacidade
  → registro de acesso → destino seguro ("voltar" só dentro da Área do Aluno).
*/
(function () {
  'use strict';

  var AC = window.AC;
  var A = window.AcademiaAuth;
  var $ = AC.$;
  var msg = $('#msg');
  var PAINEIS = ['entrar', 'esqueci', 'mfa', 'aceite', 'inativo'];
  var captchaEntrar = null;
  var captchaEsqueci = null;

  function mostrar(nome) {
    PAINEIS.forEach(function (p) { $('#painel-' + p).hidden = p !== nome; });
    var foco = { entrar: '#email', esqueci: '#email-esqueci', mfa: '#codigo', aceite: '#aceite', inativo: '#inativo-voltar' }[nome];
    AC.liberar();
    if (foco) setTimeout(function () { var el = $(foco); if (el) el.focus(); }, 30);
  }

  function erro(texto) { AC.mensagem(msg, texto, 'erro'); }
  function limparMsg() { AC.mensagem(msg, ''); }
  function emailValido(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(v).trim()); }

  function iniciarCaptchaEntrar() {
    if (captchaEntrar) return;
    captchaEntrar = A.captcha($('#captcha-entrar'), null, null, erro);
  }
  function iniciarCaptchaEsqueci() {
    if (captchaEsqueci) return;
    captchaEsqueci = A.captcha($('#captcha-esqueci'), null, null, erro);
  }

  // Decide a próxima etapa depois de logado.
  function continuar() {
    return A.proximaEtapa().then(function (r) {
      if (r.etapa === 'mfa') { limparMsg(); mostrar('mfa'); return; }
      if (r.etapa === 'inativo') { limparMsg(); mostrar('inativo'); return; }
      if (r.etapa === 'aceite') { limparMsg(); mostrar('aceite'); return; }
      A.irPara(r.destino);
    });
  }

  /* ---------- Entrar ---------- */
  $('#form-entrar').addEventListener('submit', function (e) {
    e.preventDefault();
    limparMsg();
    $('#nao-confirmado').hidden = true;
    var email = $('#email'), senha = $('#senha'), btn = $('#btn-entrar');
    var ok = true;
    AC.erroCampo(email, emailValido(email.value) ? '' : 'Informe um e-mail válido.');
    AC.erroCampo(senha, senha.value ? '' : 'Informe sua senha.');
    if (!emailValido(email.value)) { ok = false; email.focus(); } else if (!senha.value) { ok = false; senha.focus(); }
    if (!ok) return;
    var token = captchaEntrar && captchaEntrar.token();
    if (!token) { erro('Conclua a verificação de segurança antes de entrar.'); return; }

    AC.ocupado(btn, true, 'Entrando…');
    A.entrar(email.value, senha.value, token)
      .then(function () { senha.value = ''; return continuar(); })
      .catch(function (err) {
        erro(A.mensagemErro(err, 'login'));
        // Para qualquer falha de login (não só e-mail não confirmado), para não revelar nada sobre a conta.
        if (err && err.status === 400) $('#nao-confirmado').hidden = false;
        if (captchaEntrar) captchaEntrar.reset();
      })
      .then(function () { AC.ocupado(btn, false); });
  });

  /* ---------- Esqueci minha senha ---------- */
  $('#ir-esqueci').addEventListener('click', function () {
    limparMsg();
    $('#email-esqueci').value = $('#email').value;
    mostrar('esqueci');
    iniciarCaptchaEsqueci();
  });
  $('#voltar-entrar').addEventListener('click', function () { limparMsg(); mostrar('entrar'); });

  $('#form-esqueci').addEventListener('submit', function (e) {
    e.preventDefault();
    limparMsg();
    var email = $('#email-esqueci'), btn = $('#btn-esqueci');
    AC.erroCampo(email, emailValido(email.value) ? '' : 'Informe um e-mail válido.');
    if (!emailValido(email.value)) { email.focus(); return; }
    var token = captchaEsqueci && captchaEsqueci.token();
    if (!token) { erro('Conclua a verificação de segurança antes de enviar.'); return; }

    AC.ocupado(btn, true, 'Enviando…');
    A.pedirNovaSenha(email.value, token)
      .then(function () {
        AC.mensagem(msg, 'Se este e-mail estiver cadastrado, você vai receber um link para criar uma nova senha.', 'ok');
      })
      .catch(function (err) { erro(A.mensagemErro(err)); })
      .then(function () {
        if (captchaEsqueci) captchaEsqueci.reset();
        AC.ocupado(btn, false);
      });
  });

  /* ---------- Código do autenticador ---------- */
  $('#codigo').addEventListener('input', function () { this.value = this.value.replace(/\D/g, '').slice(0, 6); });
  $('#form-mfa').addEventListener('submit', function (e) {
    e.preventDefault();
    limparMsg();
    var codigo = $('#codigo'), btn = $('#btn-mfa');
    if (!/^\d{6}$/.test(codigo.value)) { AC.erroCampo(codigo, 'Digite os 6 dígitos do código.'); codigo.focus(); return; }
    AC.erroCampo(codigo, '');
    AC.ocupado(btn, true, 'Confirmando…');
    A.mfaVerificar(codigo.value)
      .then(function () { codigo.value = ''; return continuar(); })
      .catch(function (err) { codigo.value = ''; erro(A.mensagemErro(err)); codigo.focus(); })
      .then(function () { AC.ocupado(btn, false); });
  });

  /* ---------- Aceite da privacidade ---------- */
  $('#aceite').addEventListener('change', function () { $('#btn-aceite').disabled = !this.checked; });
  $('#btn-aceite').addEventListener('click', function () {
    var btn = this;
    limparMsg();
    AC.ocupado(btn, true, 'Salvando…');
    A.aceitarPrivacidade()
      .then(continuar)
      .catch(function (err) { erro(A.mensagemErro(err)); AC.ocupado(btn, false); });
  });

  /* ---------- Sair / voltar ---------- */
  AC.$$('[data-acao-sair]').forEach(function (b) {
    b.addEventListener('click', function () {
      AC.ocupado(b, true, 'Saindo…');
      A.sair(false).then(function () { A.irPara(window.ACADEMIA_CONFIG.rotas.entrar); });
    });
  });
  $('#inativo-voltar').addEventListener('click', function () { A.irPara(window.ACADEMIA_CONFIG.rotas.entrar); });

  AC.ligarMostrarSenha();

  /* ---------- Início ---------- */
  try { A.cliente(); } catch (e) { mostrar('entrar'); erro(A.mensagemErro(e)); return; }

  if (AC.parametro('motivo') === 'inativo') { mostrar('inativo'); return; }

  A.sessao().then(function (sessao) {
    if (sessao) return continuar();
    mostrar(AC.parametro('esqueci') === '1' ? 'esqueci' : 'entrar');
    iniciarCaptchaEntrar();
    if (AC.parametro('esqueci') === '1') iniciarCaptchaEsqueci();
  }).catch(function (err) {
    mostrar('entrar');
    iniciarCaptchaEntrar();
    erro(A.mensagemErro(err));
  });
})();
