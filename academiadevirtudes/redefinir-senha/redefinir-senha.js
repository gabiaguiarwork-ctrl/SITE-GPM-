/*
  /academiadevirtudes/redefinir-senha/
  Primeiro acesso (convite) e recuperação de senha.
  - Link novo (e-mails com token_hash): verifyOtp({ token_hash, type }).
  - Link antigo (?code= ou #access_token): o cliente Supabase troca sozinho.
  - Sem link válido: "Este link expirou". Quem só abriu o endereço logado vai para o perfil
    (lá a troca de senha pede a senha atual).
*/
(function () {
  'use strict';

  var AC = window.AC;
  var A = window.AcademiaAuth;
  var CFG = window.ACADEMIA_CONFIG;
  var LINK = window.ACADEMIA_LINK || {};
  var $ = AC.$;
  var msg = $('#msg');
  var PAINEIS = ['senha', 'mfa', 'expirado', 'email'];
  var TIPOS_SENHA = ['invite', 'recovery'];
  var novaSenhaPendente = '';

  function mostrar(nome) {
    PAINEIS.forEach(function (p) { $('#painel-' + p).hidden = p !== nome; });
    AC.liberar();
    var foco = { senha: '#nova', mfa: '#codigo' }[nome];
    if (foco) setTimeout(function () { $(foco).focus(); }, 30);
  }
  function erro(t) { AC.mensagem(msg, t, 'erro'); }

  /* ---------- Regras da senha, ao vivo ---------- */
  function atualizarRegras() {
    var r = AC.regrasSenha($('#nova').value);
    AC.$$('#regras [data-regra]').forEach(function (li) { li.classList.toggle('ok', !!r[li.getAttribute('data-regra')]); });
    return r;
  }
  $('#nova').addEventListener('input', atualizarRegras);
  AC.ligarMostrarSenha();

  function salvar(senha) {
    return A.cliente().auth.updateUser({ password: senha }).then(function (r) {
      if (r.error) throw r.error;
    });
  }

  function concluir() {
    AC.mensagem(msg, 'Senha salva. Entrando…', 'ok');
    // A tela de entrada (já com sessão) conduz o aceite da privacidade e o destino.
    setTimeout(function () { A.irPara(CFG.rotas.entrar); }, 900);
  }

  $('#form-senha').addEventListener('submit', function (e) {
    e.preventDefault();
    AC.mensagem(msg, '');
    var nova = $('#nova'), confirma = $('#confirma'), btn = $('#btn-senha');
    var r = atualizarRegras();
    AC.erroCampo(nova, r.ok ? '' : 'A senha ainda não atende a todas as regras.');
    AC.erroCampo(confirma, confirma.value === nova.value ? '' : 'As senhas não são iguais.');
    if (!r.ok) { nova.focus(); return; }
    if (confirma.value !== nova.value) { confirma.focus(); return; }

    AC.ocupado(btn, true, 'Salvando…');
    salvar(nova.value)
      .then(function () { nova.value = ''; confirma.value = ''; concluir(); })
      .catch(function (err) {
        AC.ocupado(btn, false);
        if (err && err.code === 'insufficient_aal') {
          novaSenhaPendente = nova.value;
          mostrar('mfa');
          return;
        }
        erro(A.mensagemErro(err));
      });
  });

  /* ---------- Contas com MFA: confirmar o código antes de salvar ---------- */
  $('#codigo').addEventListener('input', function () { this.value = this.value.replace(/\D/g, '').slice(0, 6); });
  $('#form-mfa').addEventListener('submit', function (e) {
    e.preventDefault();
    var codigo = $('#codigo'), btn = $('#btn-mfa');
    if (!/^\d{6}$/.test(codigo.value)) { AC.erroCampo(codigo, 'Digite os 6 dígitos do código.'); return; }
    AC.erroCampo(codigo, '');
    AC.ocupado(btn, true, 'Confirmando…');
    A.mfaVerificar(codigo.value)
      .then(function () { return salvar(novaSenhaPendente); })
      .then(function () { novaSenhaPendente = ''; concluir(); })
      .catch(function (err) { codigo.value = ''; AC.ocupado(btn, false); erro(A.mensagemErro(err)); });
  });

  /* ---------- Início: validar o link ---------- */
  function abrirFormulario(tipo) {
    if (tipo === 'invite') {
      $('#t-senha').textContent = 'Bem-vindo à Área do Aluno';
      $('#sub-senha').textContent = 'Para concluir seu primeiro acesso, crie uma senha.';
      document.title = 'Primeiro acesso · Área do Aluno · Academia de Virtudes';
    }
    mostrar('senha');
  }

  var sb;
  try { sb = A.cliente(); } catch (e) { mostrar('expirado'); erro(A.mensagemErro(e)); return; }

  if (LINK.erro) { mostrar('expirado'); return; }

  if (LINK.tokenHash) {
    var tipo = LINK.tipo;
    var permitido = TIPOS_SENHA.concat(['email_change', 'email', 'signup']);
    if (permitido.indexOf(tipo) < 0) { mostrar('expirado'); return; }
    sb.auth.verifyOtp({ token_hash: LINK.tokenHash, type: tipo }).then(function (r) {
      if (r.error) throw r.error;
      if (tipo === 'email_change') { mostrar('email'); return; }
      if (tipo === 'email' || tipo === 'signup') { A.irPara(CFG.rotas.entrar); return; }
      abrirFormulario(tipo);
    }).catch(function () { mostrar('expirado'); });
    return;
  }

  if (LINK.temCodigo || LINK.temTokenNoHash) {
    // O cliente Supabase já está trocando o código/token pela sessão.
    A.sessao().then(function (s) {
      if (!s) { mostrar('expirado'); return; }
      if (location.search || location.hash) history.replaceState(null, '', location.pathname);
      abrirFormulario(LINK.tipo === 'invite' ? 'invite' : 'recovery');
    }).catch(function () { mostrar('expirado'); });
    return;
  }

  // Sem link: quem está logado troca a senha pelo perfil (pede a senha atual).
  A.sessao().then(function (s) {
    if (s) { A.irPara(CFG.rotas.perfil); return; }
    mostrar('expirado');
  }).catch(function () { mostrar('expirado'); });
})();
