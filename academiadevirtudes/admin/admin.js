/*
  /academiadevirtudes/admin/
  Fase 1: confirma papel admin + sessão aal2 (o guard manda para /admin/mfa/ se faltar o código).
  O painel completo entra na Fase 3.
*/
(function () {
  'use strict';
  window.AcademiaAuth.proteger({ admin: true }).then(function (ctx) {
    window.AcademiaLayout.montar(ctx);
  });
})();
