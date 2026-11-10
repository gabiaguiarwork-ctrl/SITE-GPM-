/*
  Área do Aluno · Academia de Virtudes
  Utilitários compartilhados (sem dependências).
  Regra: NUNCA usar innerHTML/outerHTML/insertAdjacentHTML/document.write com dados.
  Todo texto entra por textContent ou por nós de texto criados aqui.
*/
(function () {
  'use strict';

  var AC = {};

  /* ---------- Seleção ---------- */
  AC.$ = function (sel, ctx) { return (ctx || document).querySelector(sel); };
  AC.$$ = function (sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); };

  /*
    Cria elementos com segurança.
    AC.h('p', { class: 'ac-msg', text: 'Olá' })
    AC.h('a', { href: '/x', class: 'ac-btn' }, 'Entrar')
    AC.h('button', { type: 'button', on: { click: fn } }, 'Sair')
    - Textos (strings) viram nós de texto: nunca são interpretados como HTML.
    - Atributos "on*", "style", "srcdoc", "formaction" e "xlink:href" são recusados.
    - href/src/action só aceitam http(s), caminho do próprio site ("/x", "./x", "../x"), "#", "mailto:" ou "tel:".
      Recusa "//outro-site" (endereço sem protocolo), barra invertida e "javascript:"/"data:".
  */
  var ATRIB_PROIBIDO = /^(on|style$|srcdoc$|formaction$|xlink:href$)/i;
  var ATRIB_URL = /^(href|src|action|poster|data|cite|background)$/i;
  AC.urlPermitida = function (v) {
    v = String(v).trim();
    if (/[\\\u0000-\u001f]/.test(v)) return false;          // barra invertida e caracteres de controle
    if (/^\/\//.test(v)) return false;                       // "//outro-site.com"
    return /^(https?:\/\/[^/]|mailto:|tel:|\/(?!\/)|\.\.?\/|#)/i.test(v);
  };
  AC.h = function (tag, attrs) {
    var el = document.createElement(tag);
    attrs = attrs || {};
    Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v === null || v === undefined || v === false) return;
      if (k === 'text') { el.textContent = String(v); return; }
      if (k === 'on') { Object.keys(v).forEach(function (ev) { el.addEventListener(ev, v[ev]); }); return; }
      if (ATRIB_PROIBIDO.test(k)) throw new Error('Atributo não permitido: ' + k);
      if (ATRIB_URL.test(k) && !AC.urlPermitida(v) && !(k === 'src' && tag === 'img' && /^data:image\/(png|svg\+xml);/.test(String(v)))) {
        throw new Error('URL não permitida em ' + k);
      }
      el.setAttribute(k, v === true ? '' : String(v));
    });
    for (var i = 2; i < arguments.length; i++) AC.anexar(el, arguments[i]);
    return el;
  };
  AC.anexar = function (pai, filho) {
    if (filho === null || filho === undefined || filho === false) return;
    if (Array.isArray(filho)) { filho.forEach(function (f) { AC.anexar(pai, f); }); return; }
    pai.appendChild(filho instanceof Node ? filho : document.createTextNode(String(filho)));
  };
  AC.limpar = function (el) { while (el.firstChild) el.removeChild(el.firstChild); return el; };
  AC.texto = function (el, valor) { el.textContent = valor === null || valor === undefined ? '' : String(valor); return el; };

  /* ---------- Carregando / exibir página ---------- */
  // As páginas protegidas começam com <html class="ac-carregando">: o CSS esconde o conteúdo
  // e mostra só o indicador. O guard chama AC.liberar() quando o acesso é confirmado.
  AC.liberar = function () { document.documentElement.classList.remove('ac-carregando'); };
  AC.ocupado = function (botao, ocupado, rotuloOcupado) {
    if (!botao) return;
    if (ocupado) {
      if (!botao.dataset.rotulo) botao.dataset.rotulo = botao.textContent;
      botao.disabled = true;
      botao.setAttribute('aria-busy', 'true');
      botao.textContent = rotuloOcupado || 'Aguarde…';
    } else {
      botao.disabled = false;
      botao.removeAttribute('aria-busy');
      if (botao.dataset.rotulo) botao.textContent = botao.dataset.rotulo;
    }
  };

  /* ---------- Mensagens ---------- */
  // tipo: 'erro' | 'ok' | 'info'. O elemento deve ter role="alert" (erro) ou aria-live="polite".
  AC.mensagem = function (el, texto, tipo) {
    if (!el) return;
    el.classList.remove('ac-msg--erro', 'ac-msg--ok', 'ac-msg--info');
    if (!texto) { el.hidden = true; el.textContent = ''; return; }
    el.classList.add('ac-msg--' + (tipo || 'info'));
    el.textContent = texto;
    el.hidden = false;
  };
  AC.erroCampo = function (input, texto) {
    var id = input.getAttribute('aria-describedby');
    var alvo = id ? document.getElementById(id.split(' ').filter(function (x) { return x.indexOf('erro-') === 0; })[0]) : null;
    if (texto) { input.setAttribute('aria-invalid', 'true'); if (alvo) { alvo.textContent = texto; alvo.hidden = false; } }
    else { input.removeAttribute('aria-invalid'); if (alvo) { alvo.textContent = ''; alvo.hidden = true; } }
  };

  /* ---------- Endereços ---------- */
  AC.ehLocalhost = function () { return /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname); };

  // Só aceita voltar para dentro da Área do Aluno (evita redirecionamento aberto).
  AC.destinoSeguro = function (valor, padrao) {
    var base = (window.ACADEMIA_CONFIG && window.ACADEMIA_CONFIG.base) || '/academiadevirtudes';
    if (typeof valor !== 'string' || !valor) return padrao;
    if (/^\s*\/\/|\\/.test(valor)) return padrao;            // "//outro-site" ou barra invertida
    try {
      var u = new URL(valor, location.origin);
      if (u.origin !== location.origin) return padrao;
      if (u.pathname.indexOf(base + '/') !== 0) return padrao;
      if (/\/\/|\\|%2f|%5c/i.test(u.pathname)) return padrao;
      return u.pathname + u.search + u.hash;
    } catch (e) { return padrao; }
  };
  AC.parametro = function (nome) { return new URLSearchParams(location.search).get(nome); };

  /* ---------- Senha ---------- */
  // Mesmas regras configuradas no Supabase (mínimo 10, maiúscula, minúscula e número).
  // O Supabase só conta letras sem acento (A–Z, a–z): seguimos igual para não aprovar aqui
  // uma senha que o servidor vai recusar.
  AC.regrasSenha = function (s) {
    s = s || '';
    var min = (window.ACADEMIA_CONFIG && window.ACADEMIA_CONFIG.senha.minimo) || 10;
    var r = {
      tamanho: s.length >= min,
      maiuscula: /[A-Z]/.test(s),
      minuscula: /[a-z]/.test(s),
      numero: /[0-9]/.test(s)
    };
    r.ok = r.tamanho && r.maiuscula && r.minuscula && r.numero;
    return r;
  };

  // Liga o botão "mostrar/ocultar" a um campo de senha: <button data-mostrar="id-do-campo">.
  AC.ligarMostrarSenha = function (ctx) {
    AC.$$('[data-mostrar]', ctx).forEach(function (b) {
      var campo = document.getElementById(b.getAttribute('data-mostrar'));
      if (!campo) return;
      b.addEventListener('click', function () {
        var visivel = campo.type === 'text';
        campo.type = visivel ? 'password' : 'text';
        b.setAttribute('aria-pressed', String(!visivel));
        b.textContent = visivel ? 'Mostrar' : 'Ocultar';
        campo.focus();
      });
    });
  };

  /* ---------- Texto ---------- */
  AC.primeiroNome = function (nome) { return String(nome || '').trim().split(/\s+/)[0] || ''; };
  AC.mascaraWhatsapp = function (input) {
    input.addEventListener('input', function () {
      var d = input.value.replace(/\D/g, '').slice(0, 11), o = d;
      if (d.length > 2) o = '(' + d.slice(0, 2) + ') ' + d.slice(2);
      if (d.length > 6) o = '(' + d.slice(0, 2) + ') ' + d.slice(2, d.length - 4) + '-' + d.slice(-4);
      input.value = o;
    });
  };

  /* ---------- Rodapé: ano corrente ---------- */
  document.addEventListener('DOMContentLoaded', function () {
    AC.$$('[data-ano]').forEach(function (el) { el.textContent = String(new Date().getFullYear()); });
  });

  window.AC = Object.freeze(AC);
})();
