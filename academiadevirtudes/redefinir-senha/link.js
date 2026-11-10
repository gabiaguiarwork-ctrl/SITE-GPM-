/*
  Lê o link do e-mail ANTES de o cliente Supabase iniciar (ele consome ?code= e #access_token).
  Assim sabemos se a pessoa chegou por um link de convite/recuperação ou só abriu o endereço.
*/
(function () {
  'use strict';
  var q = new URLSearchParams(location.search);
  var h = new URLSearchParams(location.hash.replace(/^#/, ''));
  window.ACADEMIA_LINK = Object.freeze({
    tokenHash: q.get('token_hash') || '',
    tipo: q.get('type') || h.get('type') || '',
    temCodigo: q.has('code'),
    temTokenNoHash: h.has('access_token'),
    erro: q.get('error_code') || h.get('error_code') || q.get('error') || h.get('error') || ''
  });
  // Tira o token do endereço o quanto antes (não fica no histórico nem em capturas de tela).
  if (q.has('token_hash')) history.replaceState(null, '', location.pathname);
})();
