/*
  Área do Aluno · Academia de Virtudes
  Acesso: cliente Supabase, CAPTCHA (Turnstile), cadastro, confirmação do e-mail, login,
  recuperação de senha, MFA, aceite da política de privacidade, cadastro completo e guard de rota.

  Importante: o guard é só navegação. A proteção real dos dados é a RLS do banco.
*/
(function () {
  'use strict';

  var CFG = window.ACADEMIA_CONFIG;
  var AC = window.AC;
  var A = {};
  var cliente = null;

  function fetchComKeepalive(url, opcoes) {
    var o = opcoes || {};
    if (typeof o.body === 'string' && o.body.length < 4096 && /\/rest\/v1\/progresso(\?|$)/.test(String(url))) {
      o = Object.assign({}, o, { keepalive: true });
    }
    return window.fetch(url, o);
  }

  /* ---------- Cliente Supabase (único por página) ---------- */
  A.cliente = function () {
    if (cliente) return cliente;
    if (!window.supabase || !window.supabase.createClient) {
      throw new Error('config: biblioteca do Supabase não carregou');
    }
    cliente = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseKey, {
      auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
      // Gravações pequenas de progresso usam keepalive: terminam mesmo se a pessoa fechar a aba.
      global: { fetch: fetchComKeepalive }
    });
    return cliente;
  };

  /* ---------- Mensagens de erro em português (sem revelar se o e-mail existe) ---------- */
  A.mensagemErro = function (erro, contexto) {
    var e = erro || {};
    var codigo = e.code || e.error_code || '';
    var msg = String(e.message || '').toLowerCase();
    var status = e.status || 0;

    if (/^config:/.test(e.message || '')) return 'A página não carregou por completo. Recarregue e tente de novo.';
    if (codigo === 'captcha_failed' || msg.indexOf('captcha') >= 0) return 'A verificação de segurança falhou. Faça a verificação de novo e tente outra vez.';
    if (codigo === 'signup_disabled') return 'Os cadastros ainda não estão abertos. Se você recebeu um convite, use o link do e-mail.';
    // No login, e-mail não confirmado tem a mesma mensagem de senha errada (não revela que a conta existe).
    if (codigo === 'email_not_confirmed') return contexto === 'login' ? 'E-mail ou senha incorretos.' : 'Seu e-mail ainda não foi confirmado. Abra o link que enviamos ou peça um novo.';
    if (codigo === 'email_address_invalid' || codigo === 'email_address_not_authorized') return 'Informe um e-mail válido.';
    if (codigo === '23514') return 'Algum dado está fora do formato aceito. Confira os campos e tente de novo.';
    if (codigo === 'over_request_rate_limit' || codigo === 'over_email_send_rate_limit' || status === 429) return 'Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente de novo.';
    if (codigo === 'weak_password' || e.name === 'AuthWeakPasswordError') {
      var razoes = e.reasons || [];
      if (razoes.indexOf('pwned') >= 0) return 'Essa senha já apareceu em vazamentos conhecidos. Escolha outra.';
      return 'Essa senha não atende às regras: mínimo de ' + CFG.senha.minimo + ' caracteres, com letra maiúscula, minúscula e número.';
    }
    if (codigo === 'same_password') return 'A nova senha precisa ser diferente da atual.';
    if (codigo === 'otp_expired' || codigo === 'flow_state_expired' || /expired|invalid.*(token|link)/.test(msg)) return 'Este link expirou ou já foi usado. Peça um novo em "Esqueci minha senha".';
    if (codigo === 'mfa_verification_failed' || codigo === 'mfa_challenge_expired' || /invalid totp|mfa/.test(msg)) return 'Código incorreto ou expirado. Confira o aplicativo autenticador e tente de novo.';
    if (codigo === 'insufficient_aal') return 'Confirme o código do aplicativo autenticador para continuar.';
    if (codigo === 'session_not_found' || codigo === 'refresh_token_not_found' || status === 401) return 'Sua sessão terminou. Entre de novo.';
    if (e.name === 'AuthRetryableFetchError' || msg.indexOf('failed to fetch') >= 0 || msg.indexOf('network') >= 0) return 'Não foi possível conectar. Verifique sua internet e tente de novo.';
    if (contexto === 'login') return 'E-mail ou senha incorretos.';
    return 'Algo deu errado. Tente de novo em instantes.';
  };

  /* ---------- CAPTCHA (Cloudflare Turnstile) ---------- */
  // Única exceção à regra de não carregar scripts de terceiros (entra explicitamente na CSP).
  var turnstileCarregando = null;
  function carregarTurnstile() {
    if (window.turnstile) return Promise.resolve(window.turnstile);
    if (turnstileCarregando) return turnstileCarregando;
    turnstileCarregando = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      s.async = true;
      s.defer = true;
      s.crossOrigin = 'anonymous';
      var tempo = setTimeout(function () { reject(new Error('turnstile: tempo esgotado')); }, 15000);
      s.addEventListener('load', function () {
        clearTimeout(tempo);
        if (window.turnstile) resolve(window.turnstile); else reject(new Error('turnstile: indisponível'));
      });
      s.addEventListener('error', function () { clearTimeout(tempo); reject(new Error('turnstile: não carregou')); });
      document.head.appendChild(s);
    });
    return turnstileCarregando;
  }

  /*
    Monta o widget no elemento indicado. Devolve { token(), reset(), pronto }.
    ao(token) é chamado quando há token válido; aoPerder() quando expira ou falha.
    Nunca há token "falso": sem widget, nenhuma chamada de login/recuperação é feita.
  */
  A.captcha = function (elemento, ao, aoPerder, aoErro) {
    var atual = '';
    var widgetId = null;
    var api = {
      token: function () { return atual; },
      reset: function () {
        atual = '';
        if (aoPerder) aoPerder();
        if (widgetId !== null && window.turnstile) window.turnstile.reset(widgetId);
      }
    };
    if (!CFG.turnstileSiteKey) {
      api.pronto = Promise.reject(new Error('turnstile: site key ausente'));
      if (aoErro) aoErro('A verificação de segurança não está configurada. Fale com a equipe GPM.');
      api.pronto.catch(function () {});
      return api;
    }
    api.pronto = carregarTurnstile().then(function (ts) {
      widgetId = ts.render(elemento, {
        sitekey: CFG.turnstileSiteKey,
        theme: 'dark',
        language: 'pt-br',
        size: 'flexible',
        callback: function (t) { atual = t; if (ao) ao(t); },
        'expired-callback': function () { atual = ''; if (aoPerder) aoPerder(); },
        'timeout-callback': function () { atual = ''; if (aoPerder) aoPerder(); },
        'error-callback': function () {
          atual = '';
          if (aoPerder) aoPerder();
          if (aoErro) aoErro('A verificação de segurança não carregou. Recarregue a página e tente de novo.');
          return true;
        }
      });
    }).catch(function () {
      if (aoErro) aoErro('A verificação de segurança não carregou. Verifique sua conexão e recarregue a página.');
    });
    return api;
  };

  /* ---------- Sessão e perfil ---------- */
  A.sessao = function () {
    return A.cliente().auth.getSession().then(function (r) { return (r.data && r.data.session) || null; });
  };

  A.meuPerfil = function () {
    var sb = A.cliente();
    return A.sessao().then(function (s) {
      if (!s) return null;
      return sb.from('profiles')
        .select('id, nome, sobrenome, email, whatsapp, cpf, empresa, cargo, role, ativo, aceite_privacidade_versao, aceite_comunicacoes, aceite_comunicacoes_em, ultimo_acesso')
        .eq('id', s.user.id)
        .maybeSingle()
        .then(function (r) { if (r.error) throw r.error; return r.data; });
    });
  };

  A.estaAtivo = function () {
    return A.cliente().rpc('is_active').then(function (r) { if (r.error) throw r.error; return r.data === true; });
  };
  A.temPapelAdmin = function () {
    return A.cliente().rpc('tem_papel_admin').then(function (r) { if (r.error) throw r.error; return r.data === true; });
  };

  // Cadastro completo (nome, sobrenome, WhatsApp, CPF, empresa, cargo e aceite). Quem decide é o banco.
  A.cadastroCompleto = function () {
    return A.cliente().rpc('cadastro_completo').then(function (r) { if (r.error) throw r.error; return r.data === true; });
  };

  // Consentimento de comunicações (marcar/desmarcar). Devolve a data gravada.
  A.definirComunicacoes = function (aceito) {
    return A.cliente().rpc('definir_comunicacoes', { aceito: aceito === true })
      .then(function (r) { if (r.error) throw r.error; return r.data; });
  };

  A.aceitarPrivacidade = function () {
    return A.cliente().rpc('aceitar_privacidade', { versao: CFG.privacidade.versao })
      .then(function (r) { if (r.error) throw r.error; });
  };

  // Uma vez por aba: registra a data do último acesso.
  A.registrarAcesso = function () {
    try { if (sessionStorage.getItem('ac_acesso') === '1') return Promise.resolve(); } catch (e) { /* sem storage */ }
    return A.cliente().rpc('registrar_acesso').then(function (r) {
      if (!r.error) { try { sessionStorage.setItem('ac_acesso', '1'); } catch (e) { /* ok */ } }
    });
  };

  /* ---------- Login, recuperação e saída ---------- */
  A.entrar = function (email, senha, captchaToken) {
    if (!captchaToken) return Promise.reject({ code: 'captcha_failed' });
    return A.cliente().auth.signInWithPassword({
      email: String(email).trim().toLowerCase(),
      password: senha,
      options: { captchaToken: captchaToken }
    }).then(function (r) { if (r.error) throw r.error; return r.data; });
  };

  A.enderecoRedefinir = function () {
    return AC.ehLocalhost() ? location.origin + CFG.rotas.redefinirSenha : CFG.redirectRedefinirSenha;
  };

  A.enderecoConfirmar = function () {
    return AC.ehLocalhost() ? location.origin + CFG.rotas.confirmar : CFG.redirectConfirmar;
  };

  // Só erros que não dizem nada sobre o e-mail voltam para a tela: CAPTCHA, limite por IP e rede.
  // O limite de envio de e-mail (over_email_send_rate_limit) é silenciado: ele aparece quando
  // o e-mail já existe e pediu outro envio há pouco, e revelaria a conta.
  function erroQuePodeAparecer(e) {
    if (!e) return false;
    var codigo = e.code || '';
    if (codigo === 'captcha_failed' || /captcha/i.test(e.message || '')) return true;
    if (codigo === 'over_request_rate_limit') return true;
    if (e.name === 'AuthRetryableFetchError' || /failed to fetch|network/i.test(e.message || '')) return true;
    return false;
  }

  // Sempre "sucesso" para a tela: não revela se o e-mail existe.
  A.pedirNovaSenha = function (email, captchaToken) {
    if (!captchaToken) return Promise.reject({ code: 'captcha_failed' });
    return A.cliente().auth.resetPasswordForEmail(String(email).trim().toLowerCase(), {
      redirectTo: A.enderecoRedefinir(),
      captchaToken: captchaToken
    }).then(function (r) {
      if (erroQuePodeAparecer(r.error)) throw r.error;
    });
  };

  /*
    Cadastro aberto. dados = { email, nome, sobrenome, whatsapp, cpf, empresa, cargo, aceite_comunicacoes }.
    O papel e o aceite da privacidade NÃO vão nos metadados (o banco ignora o papel e grava o aceite
    depois da confirmação do e-mail). Resultado para a tela, igual exista ou não o e-mail:
      { etapa: 'confirmar' } → "Quase lá": e-mail de confirmação enviado
      { etapa: 'logado' }    → só se o painel estiver sem confirmação de e-mail
  */
  A.cadastrar = function (dados, senha, captchaToken) {
    if (!captchaToken) return Promise.reject({ code: 'captcha_failed' });
    return A.cliente().auth.signUp({
      email: String(dados.email).trim().toLowerCase(),
      password: senha,
      options: {
        captchaToken: captchaToken,
        emailRedirectTo: A.enderecoConfirmar(),
        data: {
          nome: dados.nome, sobrenome: dados.sobrenome, whatsapp: dados.whatsapp, cpf: dados.cpf,
          empresa: dados.empresa, cargo: dados.cargo, aceite_comunicacoes: dados.aceite_comunicacoes === true
        }
      }
    }).then(function (r) {
      if (r.error) {
        var c = r.error.code || '';
        // Estes falam só do pedido (senha, CAPTCHA, cadastro fechado, formato), nunca da existência do e-mail.
        if (erroQuePodeAparecer(r.error) || c === 'weak_password' || r.error.name === 'AuthWeakPasswordError' ||
            c === 'signup_disabled' || c === 'email_address_invalid' || c === 'validation_failed') throw r.error;
        // Qualquer outro (ex.: e-mail já cadastrado, limite de e-mail) vira a mesma tela de sucesso.
        return { etapa: 'confirmar' };
      }
      return { etapa: r.data && r.data.session ? 'logado' : 'confirmar' };
    });
  };

  // Reenvio do e-mail de confirmação do cadastro. Sempre "sucesso" para a tela.
  A.reenviarConfirmacao = function (email, captchaToken) {
    if (!captchaToken) return Promise.reject({ code: 'captcha_failed' });
    return A.cliente().auth.resend({
      type: 'signup',
      email: String(email).trim().toLowerCase(),
      options: { emailRedirectTo: A.enderecoConfirmar(), captchaToken: captchaToken }
    }).then(function (r) {
      if (erroQuePodeAparecer(r.error)) throw r.error;
    });
  };

  A.sair = function (todosDispositivos) {
    try { sessionStorage.removeItem('ac_acesso'); } catch (e) { /* ok */ }
    return A.cliente().auth.signOut({ scope: todosDispositivos ? 'global' : 'local' })
      .catch(function () { /* mesmo com erro de rede, a sessão local é apagada */ });
  };

  A.irPara = function (caminho) { location.replace(caminho); };

  A.paraEntrar = function (extra) {
    var voltar = location.pathname + location.search;
    var q = new URLSearchParams(extra || {});
    q.set('voltar', voltar);
    A.irPara(CFG.rotas.entrar + '?' + q.toString());
  };

  /* ---------- MFA (TOTP) ---------- */
  A.mfaNivel = function () {
    return A.cliente().auth.mfa.getAuthenticatorAssuranceLevel().then(function (r) {
      if (r.error) throw r.error;
      return r.data; // { currentLevel, nextLevel, currentAuthenticationMethods }
    });
  };
  A.mfaFatores = function () {
    return A.cliente().auth.mfa.listFactors().then(function (r) {
      if (r.error) throw r.error;
      var totp = (r.data && r.data.totp) || [];
      return {
        verificados: totp.filter(function (f) { return f.status === 'verified'; }),
        pendentes: ((r.data && r.data.all) || []).filter(function (f) { return f.factor_type === 'totp' && f.status !== 'verified'; })
      };
    });
  };
  // Confere o código de 6 dígitos com o primeiro autenticador cadastrado e eleva a sessão a aal2.
  A.mfaVerificar = function (codigo, fatorId) {
    var sb = A.cliente();
    var p = fatorId ? Promise.resolve(fatorId) : A.mfaFatores().then(function (f) {
      if (!f.verificados.length) throw { code: 'mfa_factor_not_found' };
      return f.verificados[0].id;
    });
    return p.then(function (id) {
      return sb.auth.mfa.challengeAndVerify({ factorId: id, code: String(codigo).replace(/\D/g, '') });
    }).then(function (r) { if (r.error) throw r.error; return r.data; });
  };
  // Novo autenticador: apaga cadastros não concluídos e devolve { id, qr, segredo }.
  A.mfaCadastrar = function () {
    var sb = A.cliente();
    return A.mfaFatores().then(function (f) {
      return Promise.all(f.pendentes.map(function (p) { return sb.auth.mfa.unenroll({ factorId: p.id }); }));
    }).then(function () {
      return sb.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Academia de Virtudes ' + new Date().toISOString().slice(0, 10) });
    }).then(function (r) {
      if (r.error) throw r.error;
      return { id: r.data.id, qr: r.data.totp.qr_code, segredo: r.data.totp.secret };
    });
  };
  A.mfaRemover = function (fatorId) {
    return A.cliente().auth.mfa.unenroll({ factorId: fatorId }).then(function (r) { if (r.error) throw r.error; });
  };

  /*
    Etapas depois do login (ou ao abrir /entrar/ já logado):
      'mfa'      → falta o código do autenticador
      'inativo'  → acesso desativado (a sessão é encerrada)
      'aceite'   → falta aceitar a política de privacidade
      'pronto'   → { destino }
  */
  A.proximaEtapa = function () {
    return A.mfaNivel().then(function (n) {
      if (n.nextLevel === 'aal2' && n.currentLevel !== 'aal2') return { etapa: 'mfa' };
      return A.estaAtivo().then(function (ativo) {
        if (!ativo) return A.sair(false).then(function () { return { etapa: 'inativo' }; });
        return A.meuPerfil().then(function (perfil) {
          if (!perfil || perfil.aceite_privacidade_versao !== CFG.privacidade.versao) return { etapa: 'aceite', perfil: perfil };
          return A.registrarAcesso().then(function () {
            var padrao = perfil.role === 'admin' ? CFG.rotas.admin : CFG.rotas.aluno;
            return { etapa: 'pronto', destino: AC.destinoSeguro(AC.parametro('voltar'), padrao), perfil: perfil };
          });
        });
      });
    });
  };

  /*
    Guard de rota. Uso: AcademiaAuth.proteger({ admin: true }).then(function (ctx) { … })
    - Sem sessão → /entrar/?voltar=<rota>
    - Inativo → sai e vai para /entrar/?motivo=inativo
    - Aceite pendente ou MFA pendente → /entrar/ (que conduz a etapa)
    - Admin: precisa de papel admin; sem aal2 → /admin/mfa/
    - Aluno com cadastro incompleto → /aluno/completar/?voltar=<rota> (a opção paginaCompletar desliga)
    A página fica só com o "carregando" até o guard terminar.
  */
  A.proteger = function (opcoes) {
    opcoes = opcoes || {};
    var sb;
    try { sb = A.cliente(); } catch (e) { return falhaGuard(e); }

    return A.sessao().then(function (sessao) {
      if (!sessao) { A.paraEntrar(); return pendente(); }
      return A.mfaNivel().then(function (nivel) {
        return A.estaAtivo().then(function (ativo) {
          if (!ativo) { return A.sair(false).then(function () { A.irPara(CFG.rotas.entrar + '?motivo=inativo'); return pendente(); }); }
          return A.meuPerfil().then(function (perfil) {
            if (!perfil || perfil.aceite_privacidade_versao !== CFG.privacidade.versao) { A.paraEntrar({ etapa: 'aceite' }); return pendente(); }

            if (opcoes.admin) {
              if (perfil.role !== 'admin') { A.irPara(CFG.rotas.aluno); return pendente(); }
              if (nivel.currentLevel !== 'aal2' && !opcoes.paginaMfa) {
                A.irPara(CFG.rotas.adminMfa + '?voltar=' + encodeURIComponent(location.pathname + location.search));
                return pendente();
              }
            } else if (nivel.nextLevel === 'aal2' && nivel.currentLevel !== 'aal2') {
              // Aluno com autenticador cadastrado precisa confirmar o código.
              A.paraEntrar({ etapa: 'mfa' });
              return pendente();
            }

            // Cadastro incompleto (ex.: entrou por convite) → "Complete seu cadastro" antes de tudo.
            // Admin não passa por aqui (com MFA ele já vê tudo pelo banco).
            var conferir = !opcoes.admin && !opcoes.paginaCompletar && perfil.role !== 'admin';
            return (conferir ? A.cadastroCompleto() : Promise.resolve(true)).then(function (completo) {
              if (!completo) {
                A.irPara(CFG.rotas.completar + '?voltar=' + encodeURIComponent(location.pathname + location.search));
                return pendente();
              }
              sb.auth.onAuthStateChange(function (evento) {
                if (evento === 'SIGNED_OUT') A.irPara(CFG.rotas.entrar);
              });
              return A.registrarAcesso().then(function () {
                return { sessao: sessao, perfil: perfil, nivel: nivel };
              });
            });
          });
        });
      });
    }).catch(falhaGuard);
  };

  function pendente() { return new Promise(function () {}); } // a página já está saindo
  function falhaGuard(erro) {
    var caixa = document.querySelector('.ac-loader');
    if (caixa) caixa.textContent = A.mensagemErro(erro) + ' ';
    if (caixa) {
      caixa.appendChild(AC.h('a', { href: CFG.rotas.entrar, class: 'ac-link' }, 'Voltar para a página de entrada'));
    }
    return pendente();
  }

  window.AcademiaAuth = Object.freeze(A);
})();
