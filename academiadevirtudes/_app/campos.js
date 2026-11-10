/*
  Área do Aluno · Academia de Virtudes
  Regras dos campos do cadastro: as mesmas do banco (migration 0006). O banco valida de novo;
  aqui é só para a pessoa ver o erro na hora, abaixo de cada campo.
*/
(function () {
  'use strict';

  var AC = window.AC;
  var C = {};

  C.soDigitos = function (v) { return String(v || '').replace(/\D/g, ''); };
  C.limparTexto = function (v) { return String(v || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim(); };

  /* ---------- Textos ---------- */
  C.TEXTOS = Object.freeze({
    nome: { min: 2, max: 60, msg: 'Informe seu nome (de 2 a 60 caracteres).' },
    sobrenome: { min: 2, max: 80, msg: 'Informe seu sobrenome (de 2 a 80 caracteres).' },
    empresa: { min: 2, max: 120, msg: 'Informe a empresa (de 2 a 120 caracteres).' },
    cargo: { min: 2, max: 120, msg: 'Informe seu cargo ou função (de 2 a 120 caracteres).' }
  });
  C.erroTexto = function (campo) {
    var r = C.TEXTOS[campo];
    return function (v) {
      var t = C.limparTexto(v);
      return t.length >= r.min && t.length <= r.max ? '' : r.msg;
    };
  };

  /* ---------- E-mail ---------- */
  C.emailValido = function (v) { return /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/.test(String(v || '').trim()); };
  C.erroEmail = function (v) { return C.emailValido(v) ? '' : 'Informe um e-mail válido.'; };

  /* ---------- WhatsApp / telefone (DDD + 8 ou 9 dígitos) ---------- */
  C.whatsappDigitos = function (v) {
    var d = C.soDigitos(v);
    if (/^55[1-9][1-9]\d{8,9}$/.test(d)) d = d.slice(2);
    return d;
  };
  C.whatsappValido = function (d) { return /^[1-9][1-9](\d{8}|9\d{8})$/.test(d); };
  C.erroWhatsapp = function (v) {
    if (!C.soDigitos(v)) return 'Informe seu WhatsApp com DDD.';
    return C.whatsappValido(C.whatsappDigitos(v)) ? '' : 'Número inválido. Use o DDD, ex.: (21) 99999-9999.';
  };
  C.formatarWhatsapp = function (d) {
    d = C.soDigitos(d);
    if (d.length < 10) return d;
    return '(' + d.slice(0, 2) + ') ' + d.slice(2, d.length - 4) + '-' + d.slice(-4);
  };

  /* ---------- CPF ---------- */
  C.cpfValido = function (v) {
    var d = C.soDigitos(v);
    if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
    var dig = function (n) {
      var soma = 0;
      for (var i = 0; i < n; i++) soma += Number(d[i]) * (n + 1 - i);
      var r = (soma * 10) % 11;
      return r === 10 ? 0 : r;
    };
    return dig(9) === Number(d[9]) && dig(10) === Number(d[10]);
  };
  C.erroCpf = function (v) {
    if (!C.soDigitos(v)) return 'Informe seu CPF.';
    return C.cpfValido(v) ? '' : 'CPF inválido. Confira os números.';
  };
  C.formatarCpf = function (d) {
    d = C.soDigitos(d).slice(0, 11);
    var o = d;
    if (d.length > 3) o = d.slice(0, 3) + '.' + d.slice(3);
    if (d.length > 6) o = o.slice(0, 7) + '.' + d.slice(6);
    if (d.length > 9) o = o.slice(0, 11) + '-' + d.slice(9);
    return o;
  };
  // Para mostrar sem expor o número inteiro: ***.456.789-**
  C.mascararCpf = function (d) {
    d = C.soDigitos(d);
    return d.length === 11 ? '***.' + d.slice(3, 6) + '.' + d.slice(6, 9) + '-**' : '';
  };
  C.mascaraCpf = function (input) {
    input.addEventListener('input', function () { input.value = C.formatarCpf(input.value); });
  };

  /* ---------- Validação de um formulário ---------- */
  // lista = [[input, funcaoQueDevolveOErro], …]. Marca cada campo, foca o primeiro com erro.
  C.validar = function (lista) {
    var primeiro = null;
    lista.forEach(function (par) {
      if (!par[0] || par[0].closest('[hidden]')) return;
      var e = par[1](par[0].value);
      AC.erroCampo(par[0], e);
      if (e && !primeiro) primeiro = par[0];
    });
    if (primeiro) primeiro.focus();
    return !primeiro;
  };
  // Tira o erro do campo assim que a pessoa corrige.
  C.ligarCorrecao = function (lista) {
    lista.forEach(function (par) {
      if (!par[0]) return;
      par[0].addEventListener('blur', function () {
        if (par[0].getAttribute('aria-invalid') === 'true') AC.erroCampo(par[0], par[1](par[0].value));
      });
    });
  };

  window.AcademiaCampos = Object.freeze(C);
})();
