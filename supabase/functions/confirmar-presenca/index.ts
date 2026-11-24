// confirmar-presenca · página /academiadevirtudes/presenca/?t=TOKEN (pública, sem login).
//
// Corpo: { token }                                 → consulta (para mostrar a pergunta)
//        { token, resposta: "sim" | "nao_vai", captchaToken } → grava a resposta
// Resposta: { ok: true, primeiro_nome, titulo, data_inicio, local, resposta, doacao_marca, tamanhos }
//        ou { ok: false, erro?: "sem_vaga" | "captcha" | "limite" } (token inválido, cancelado ou
//           evento já realizado: só { ok: false }, mensagem neutra no site).
import { resposta, servidor } from '../_shared/comum.ts';
import { captchaValido, chaveOrigem, iniciarPublico } from '../_shared/publico.ts';

const TOKEN = /^[A-Za-z0-9_-]{32,64}$/;

Deno.serve(async (req) => {
  try {
    const c = await iniciarPublico(req, 4_000);
    if (c instanceof Response) return c;

    const token = typeof c.token === 'string' ? c.token : '';
    if (!TOKEN.test(token)) return resposta(req, 200, { ok: false });

    const sb = servidor();
    const gravar = c.resposta === 'sim' || c.resposta === 'nao_vai';

    const { data: permitido, error: el } = await sb.rpc('permitir_envio', {
      chave: await chaveOrigem(req), acao: 'presenca', maximo: gravar ? 10 : 30, janela_segundos: 600,
    });
    if (el) throw new Error('limite: ' + el.code);
    if (permitido !== true) return resposta(req, 429, { ok: false, erro: 'limite' });

    if (!gravar) {
      const { data, error } = await sb.rpc('presenca_consultar', { token });
      if (error) throw new Error('consultar: ' + error.code);
      return resposta(req, 200, data ?? { ok: false });
    }

    if (!(await captchaValido(req, c.captchaToken, 'presenca'))) return resposta(req, 403, { ok: false, erro: 'captcha' });
    const { data, error } = await sb.rpc('presenca_confirmar', { token, resposta: c.resposta });
    if (error) throw new Error('confirmar: ' + error.code);
    return resposta(req, 200, data ?? { ok: false });
  } catch (e) {
    console.error('confirmar-presenca: erro interno', (e as Error).message);
    return resposta(req, 500, { ok: false, erro: 'interno' });
  }
});
