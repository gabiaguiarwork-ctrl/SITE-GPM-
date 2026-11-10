/*
  /academiadevirtudes/admin/mfa/
  Admin sem sessão aal2: cadastra o autenticador (primeira vez) ou confirma o código.
  Depois volta para a página do painel que pediu (?voltar=, só dentro da Academia).
*/
(function () {
  'use strict';

  var AC = window.AC;
  var A = window.AcademiaAuth;
  var CFG = window.ACADEMIA_CONFIG;
  var $ = AC.$;
  var msg = $('#msg');
  var fatorNovo = null;

  function destino() { return AC.destinoSeguro(AC.parametro('voltar'), CFG.rotas.admin); }
  function mostrar(nome) {
    ['cadastro', 'codigo'].forEach(function (p) { $('#painel-' + p).hidden = p !== nome; });
    AC.liberar();
    setTimeout(function () { $(nome === 'cadastro' ? '#codigo-cadastro' : '#codigo').focus(); }, 30);
  }
  function soDigitos() { this.value = this.value.replace(/\D/g, '').slice(0, 6); }
  $('#codigo').addEventListener('input', soDigitos);
  $('#codigo-cadastro').addEventListener('input', soDigitos);

  $('#sair').addEventListener('click', function () {
    A.sair(false).then(function () { A.irPara(CFG.rotas.entrar); });
  });

  function enviar(input, btn, fatorId) {
    if (!/^\d{6}$/.test(input.value)) { AC.erroCampo(input, 'Digite os 6 dígitos do código.'); input.focus(); return; }
    AC.erroCampo(input, '');
    AC.mensagem(msg, '');
    AC.ocupado(btn, true, 'Confirmando…');
    A.mfaVerificar(input.value, fatorId).then(function () {
      A.irPara(destino());
    }).catch(function (err) {
      input.value = '';
      AC.ocupado(btn, false);
      AC.mensagem(msg, A.mensagemErro(err), 'erro');
    });
  }

  $('#form-codigo').addEventListener('submit', function (e) {
    e.preventDefault();
    enviar($('#codigo'), $('#btn-codigo'));
  });
  $('#form-cadastro').addEventListener('submit', function (e) {
    e.preventDefault();
    enviar($('#codigo-cadastro'), $('#btn-cadastro'), fatorNovo);
  });

  A.proteger({ admin: true, paginaMfa: true }).then(function (ctx) {
    if (ctx.nivel.currentLevel === 'aal2') { A.irPara(destino()); return; }
    return A.mfaFatores().then(function (f) {
      if (f.verificados.length) { mostrar('codigo'); return; }
      return A.mfaCadastrar().then(function (c) {
        fatorNovo = c.id;
        $('#qr').src = c.qr;
        $('#segredo').textContent = c.segredo;
        mostrar('cadastro');
      });
    });
  }).catch(function (err) {
    AC.liberar();
    $('#painel-codigo').hidden = true;
    AC.mensagem(msg, A.mensagemErro(err), 'erro');
  });
})();
