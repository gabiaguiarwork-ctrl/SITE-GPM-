/*
  Área do Aluno · Academia de Virtudes
  Header e footer da área logada: marca a página atual, mostra "Admin" só para admin,
  liga o botão "Sair". O HTML do header está em cada página (sem script inline).
*/
(function () {
  'use strict';

  var AC = window.AC;
  var A = window.AcademiaAuth;

  window.AcademiaLayout = Object.freeze({
    // ctx = resultado do AcademiaAuth.proteger()
    montar: function (ctx) {
      var perfil = (ctx && ctx.perfil) || {};

      // Página atual no menu
      var aqui = location.pathname.replace(/index\.html$/, '');
      AC.$$('.ac-topo__nav a[href]').forEach(function (a) {
        var alvo = a.getAttribute('href');
        var atual = alvo === aqui || (alvo !== '/academiadevirtudes/aluno/' && aqui.indexOf(alvo) === 0);
        if (atual) a.setAttribute('aria-current', 'page');
      });

      // Link do painel só para quem tem papel de admin (a RLS protege os dados de qualquer forma)
      AC.$$('[data-so-admin]').forEach(function (el) { el.hidden = perfil.role !== 'admin'; });

      // Nome no header
      AC.$$('[data-nome]').forEach(function (el) { el.textContent = AC.primeiroNome(perfil.nome) || 'Aluno'; });

      // Sair
      AC.$$('[data-sair]').forEach(function (b) {
        b.addEventListener('click', function () {
          AC.ocupado(b, true, 'Saindo…');
          A.sair(false).then(function () { A.irPara(window.ACADEMIA_CONFIG.rotas.entrar); });
        });
      });

      AC.liberar();
    }
  });
})();
