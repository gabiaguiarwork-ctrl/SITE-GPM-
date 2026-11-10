/*
  Área do Aluno · Academia de Virtudes
  Configuração PÚBLICA. Tudo aqui é visível no navegador de qualquer pessoa.
  NUNCA coloque aqui a chave secreta (sb_secret_… / service_role).
  A segurança dos dados é a RLS do banco, não este arquivo.
*/
(function () {
  'use strict';

  var BASE = '/academiadevirtudes';

  window.ACADEMIA_CONFIG = Object.freeze({
    supabaseUrl: 'https://qfghgtrvwklzlsuawndm.supabase.co',
    // Chave pública (publishable). Pode ficar no site.
    supabaseKey: 'sb_publishable_DXzzbhId9PFYpWi24gA_Jg_sFLtXjqJ',

    // Site key PÚBLICA do Cloudflare Turnstile (hostnames: gpmintegracao.com.br, www e localhost).
    // A secret key fica SÓ no painel do Supabase. O CAPTCHA é obrigatório em todo lugar, inclusive localhost:
    // sem token, nenhuma chamada de login ou recuperação é feita.
    turnstileSiteKey: '0x4AAAAAAF7uZlVNU6NHdDHd',

    base: BASE,
    rotas: Object.freeze({
      entrar: BASE + '/entrar/',
      cadastro: BASE + '/cadastro/',
      confirmar: BASE + '/confirmar/',
      completar: BASE + '/aluno/completar/',
      redefinirSenha: BASE + '/redefinir-senha/',
      aluno: BASE + '/aluno/',
      perfil: BASE + '/aluno/perfil/',
      admin: BASE + '/admin/',
      adminMfa: BASE + '/admin/mfa/',
      encontro: BASE + '/aluno/encontro/',
      aula: BASE + '/aluno/aula/',
      materiais: BASE + '/aluno/materiais/'
    }),

    // Panda Video: endereço do player da biblioteca (Panda → Configurações → Embed),
    // no formato player-vz-xxxxxxxx-xxx.tv.pandavideo.com.br. Vazio = Panda ainda não configurado.
    // O Vimeo não precisa de configuração aqui.
    pandaHost: '',

    // Endereços que o Supabase usa nos e-mails de recuperação, convite e confirmação.
    // Em localhost o auth.js troca pelo endereço local automaticamente.
    redirectRedefinirSenha: 'https://gpmintegracao.com.br' + BASE + '/redefinir-senha/',
    // Endereço da confirmação do e-mail do cadastro (precisa estar nas Redirect URLs do painel).
    redirectConfirmar: 'https://gpmintegracao.com.br' + BASE + '/confirmar/',

    // Espera mínima entre reenvios do e-mail de confirmação, na tela (o Supabase também limita).
    reenvioSegundos: 60,

    privacidade: Object.freeze({ versao: '2026-11', url: '/politica-privacidade.html' }),

    senha: Object.freeze({ minimo: 10 })
  });
})();
