/*
  /academiadevirtudes/colaborador/ · "Sou colaborador"
  Explica que a plataforma é só para colaboradores do Grupo GPM e pessoas aprovadas,
  recebe o pedido de acesso (mini cadastro) e leva quem já é aluno para o login.
  O pedido NÃO cria conta: a equipe analisa e, se aprovar, convida pelo painel (aba Alunos).
  Sem innerHTML; nada fica guardado no aparelho.
*/
(function () {
  'use strict';
  // Destino do pedido de acesso (Formspree, mesmo formulário das inscrições; o assunto separa).
  var DESTINO = 'https://formspree.io/f/xoedlyqp';
  var $ = function (s) { return document.querySelector(s); };

  /* Menu do celular (o mesmo da página da Academia) */
  var botao = $('#av-menu-botao'), menu = $('#av-menu-celular');
  if (botao && menu) {
    botao.addEventListener('click', function () {
      var abrir = menu.hidden;
      menu.hidden = !abrir;
      botao.setAttribute('aria-expanded', String(abrir));
      botao.setAttribute('aria-label', abrir ? 'Fechar menu' : 'Abrir menu');
    });
  }

  /* Pedido de acesso */
  var form = $('#co-form'), erro = $('#co-erro'), enviar = $('#co-enviar');
  function digitos(v) { return String(v || '').replace(/\D/g, '').slice(0, 11); }
  function mascara(v) {
    var d = digitos(v);
    if (!d) return '';
    if (d.length <= 2) return '(' + d;
    if (d.length <= 6) return '(' + d.slice(0, 2) + ') ' + d.slice(2);
    if (d.length <= 10) return '(' + d.slice(0, 2) + ') ' + d.slice(2, 6) + '-' + d.slice(6);
    return '(' + d.slice(0, 2) + ') ' + d.slice(2, 7) + '-' + d.slice(7);
  }
  $('#co-whatsapp').addEventListener('input', function (e) { e.target.value = mascara(e.target.value); });
  form.addEventListener('input', function () { erro.textContent = ''; });

  function validar() {
    var nome = $('#co-nome').value.trim().replace(/\s+/g, ' ');
    if (nome.split(' ').length < 2 || nome.length < 5) return ['#co-nome', 'Escreva seu nome e sobrenome.'];
    var d = digitos($('#co-whatsapp').value);
    if (!/^[1-9][1-9]\d{8,9}$/.test(d) || (d.length === 11 && d.charAt(2) !== '9')) return ['#co-whatsapp', 'Escreva seu WhatsApp com DDD, por exemplo (21) 99999-9999.'];
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test($('#co-email').value.trim())) return ['#co-email', 'Escreva um e-mail válido.'];
    if ($('#co-empresa').value.trim().length < 2) return ['#co-empresa', 'Escreva o nome da empresa em que você trabalha.'];
    if ($('#co-motivo').value.trim().length < 10) return ['#co-motivo', 'Conte em poucas palavras por que você quer fazer parte.'];
    if (!$('#co-consent').checked) return ['#co-consent', 'Marque a concordância para enviar o pedido.'];
    return null;
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (enviar.disabled) return;
    var v = validar();
    if (v) { erro.textContent = v[1]; $(v[0]).focus(); return; }
    var nome = $('#co-nome').value.trim().replace(/\s+/g, ' ');
    var corpo = {
      _subject: 'Pedido de acesso · Academia de Virtudes · ' + nome,
      tipo: 'Pedido de acesso à plataforma (Sou colaborador)',
      nome: nome,
      whatsapp: mascara($('#co-whatsapp').value),
      email: $('#co-email').value.trim(),
      empresa: $('#co-empresa').value.trim(),
      motivo: $('#co-motivo').value.trim(),
      consentimento: 'Concordo com o uso dos meus dados para a análise deste pedido.',
      origem: 'site-academia-colaborador'
    };
    if ($('#co-hp').value) corpo._gotcha = $('#co-hp').value;
    if (/[?&]teste\b/.test(location.search)) { mostrarOk(nome); return; }
    enviar.disabled = true; enviar.textContent = 'Enviando…';
    fetch(DESTINO, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(corpo) })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); mostrarOk(nome); })
      .catch(function () {
        enviar.disabled = false; enviar.textContent = 'Tentar de novo';
        erro.textContent = 'Não conseguimos enviar agora. Verifique sua conexão e tente de novo. Seus dados continuam aqui.';
      });
  });

  function mostrarOk(nome) {
    form.hidden = true;
    $('#co-ok-nome').textContent = nome.split(' ')[0];
    var ok = $('#co-ok');
    ok.hidden = false;
    ok.focus();
  }
})();
