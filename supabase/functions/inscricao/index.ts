// inscricao · inscrição num encontro da Academia de Virtudes (pública, sem login).
//
// Corpo: { evento, email, nome, whatsapp, empresa, cargo, equipe_gpm, convidado_por,
//          participou[], perfil_ia, doacao_tamanho, acompanhante, acompanhante_nome,
//          acompanhante_whatsapp, acompanhante_doacao_tamanho, consentimento,
//          aceite_comunicacoes, captchaToken, website (armadilha para robôs: tem de vir vazio) }
// Resposta: { ok: true, situacao: "inscrito" | "lista_espera" }
//        ou { ok: false, erro: "encerradas" | "tamanho_esgotado" | "dados" | "captcha" | "limite" | "interno", mensagem, tamanhos? }
// Nunca devolve dados de inscritos. Inscrição NÃO cria conta no portal (nada em auth.users/profiles).
import { resposta, servidor } from '../_shared/comum.ts';
import { captchaValido, chaveOrigem, emSegundoPlano, iniciarPublico, mascarar } from '../_shared/publico.ts';
import { enviarConfirmacao } from '../_shared/email.ts';

const PERFIS = new Set(['Reativo', 'Usuário Google', 'Especialista', 'Nexialista', 'Ainda não sei']);
const TAMANHOS = new Set(['P', 'M', 'G']);
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;

const MENSAGENS: Record<string, string> = {
  encerradas: 'As inscrições para este encontro estão encerradas.',
  tamanho_esgotado: 'O tamanho de fralda escolhido acabou de esgotar. Escolha outro tamanho.',
  dados: 'Algum dado não está no formato esperado. Confira e envie de novo.',
  consentimento: 'Marque a concordância para enviar a inscrição.',
  captcha: 'Não foi possível confirmar que você não é um robô. Tente de novo.',
  limite: 'Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente de novo.',
  interno: 'Não conseguimos registrar agora. Tente de novo em instantes.',
};

function falha(req: Request, status: number, erro: string, extra: Record<string, unknown> = {}) {
  return resposta(req, status, { ok: false, erro, mensagem: MENSAGENS[erro] ?? MENSAGENS.interno, ...extra });
}

function txt(v: unknown, max: number): string {
  return typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : '';
}
function digitos(v: unknown): string {
  let d = typeof v === 'string' ? v.replace(/\D/g, '') : '';
  if (/^55[1-9][1-9]\d{8,9}$/.test(d)) d = d.slice(2);
  return /^[1-9][1-9](\d{8}|9\d{8})$/.test(d) ? d : '';
}

Deno.serve(async (req) => {
  try {
    const c = await iniciarPublico(req);
    if (c instanceof Response) return c;

    // Robô preencheu o campo escondido: responde como sucesso e não grava nada.
    if (txt(c.website, 200) || txt(c._gotcha, 200)) return resposta(req, 200, { ok: true, situacao: 'inscrito' });

    if (!(await captchaValido(req, c.captchaToken, 'inscricao'))) return falha(req, 403, 'captcha');

    const sb = servidor();
    const { data: permitido, error: el } = await sb.rpc('permitir_envio', {
      chave: await chaveOrigem(req), acao: 'inscricao', maximo: 5, janela_segundos: 600,
    });
    if (el) throw new Error('limite: ' + el.code);
    if (permitido !== true) return falha(req, 429, 'limite');

    // Validação e normalização (o banco confere tudo de novo).
    const acomp = c.acompanhante === true;
    const dados = {
      evento: txt(c.evento, 60),
      email: txt(c.email, 254).toLowerCase(),
      nome: txt(c.nome, 120),
      whatsapp: digitos(c.whatsapp),
      empresa: txt(c.empresa, 120),
      cargo: txt(c.cargo, 120),
      equipe_gpm: c.equipe_gpm === true,
      convidado_por: txt(c.convidado_por, 120) || null,
      participou: Array.isArray(c.participou)
        ? [...new Set(c.participou.filter((x): x is string => typeof x === 'string' && /^encontro-\d{1,2}$/.test(x)))].slice(0, 20)
        : [],
      perfil_ia: PERFIS.has(txt(c.perfil_ia, 40)) ? txt(c.perfil_ia, 40) : null,
      doacao_tamanho: txt(c.doacao_tamanho, 1),
      acompanhante: acomp,
      acompanhante_nome: acomp ? txt(c.acompanhante_nome, 120) : null,
      acompanhante_whatsapp: acomp ? digitos(c.acompanhante_whatsapp) : null,
      acompanhante_doacao_tamanho: acomp ? txt(c.acompanhante_doacao_tamanho, 1) : null,
      consentimento: c.consentimento === true,
      aceite_comunicacoes: c.aceite_comunicacoes === true,
      origem: 'site-academia-v2',
    };
    if (!dados.consentimento) return falha(req, 400, 'consentimento');
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(dados.evento) || !EMAIL.test(dados.email) || dados.nome.length < 3 ||
        !dados.whatsapp || !dados.empresa || !dados.cargo || !TAMANHOS.has(dados.doacao_tamanho) ||
        (acomp && (dados.acompanhante_nome!.length < 3 || !dados.acompanhante_whatsapp ||
                   dados.acompanhante_whatsapp === dados.whatsapp || !TAMANHOS.has(dados.acompanhante_doacao_tamanho!)))) {
      return falha(req, 400, 'dados');
    }

    const { data: r, error: er } = await sb.rpc('inscricao_registrar', { dados });
    if (er || !r) throw new Error('registrar: ' + (er?.code ?? 'vazio'));

    if (r.ok !== true) {
      const erro = String(r.erro ?? 'interno');
      if (erro === 'tamanho_esgotado') return falha(req, 409, erro, { tamanhos: Array.isArray(r.tamanhos) ? r.tamanhos : [] });
      if (erro === 'encerradas') return falha(req, 409, erro);
      if (erro === 'consentimento') return falha(req, 400, erro);
      return falha(req, 400, 'dados');
    }

    // E-mail de confirmação depois da resposta: se falhar, a inscrição continua gravada.
    if (typeof r.id === 'string') {
      emSegundoPlano(enviarConfirmacao(sb, r.id, { forcar: false, ator: null }).catch((e) => {
        console.error('inscricao: e-mail não enviado para', mascarar(dados.email), (e as Error).name);
      }));
    }
    return resposta(req, 200, { ok: true, situacao: r.situacao === 'lista_espera' ? 'lista_espera' : 'inscrito' });
  } catch (e) {
    console.error('inscricao: erro interno', (e as Error).message);
    return falha(req, 500, 'interno');
  }
});
