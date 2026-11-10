/*
  /academiadevirtudes/aluno/  (vitrine)
  Fase 1: só confirma o acesso. A vitrine de encontros e aulas entra na Fase 2.
*/
(function () {
  'use strict';
  window.AcademiaAuth.proteger().then(function (ctx) {
    window.AcademiaLayout.montar(ctx);
  });
})();
