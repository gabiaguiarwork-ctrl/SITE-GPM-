/*
  Painel · início: guard de admin (papel admin + MFA aal2), carrega os dados e abre a aba do endereço (#alunos…).
*/
(function () {
  'use strict';

  var ADM = window.AcademiaAdmin;

  window.AcademiaAuth.proteger({ admin: true }).then(function (ctx) {
    ADM.estado.perfil = ctx.perfil;
    window.AcademiaLayout.montar(ctx);
    var abas = ADM.abas();
    Object.keys(abas).forEach(function (n) { if (abas[n].iniciar) abas[n].iniciar(); });
    return Promise.all([ADM.carregarConteudo(), ADM.carregarAlunos()]).then(function () {
      ADM.mostrarAba(location.hash.replace('#', '') || 'alunos');
    });
  }).catch(ADM.falha);
})();
