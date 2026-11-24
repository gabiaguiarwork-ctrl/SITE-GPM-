// reenviar-confirmacao · painel (admin com MFA): reenvia o e-mail de confirmação da inscrição.
// Corpo: { ids: [uuid, ...] }  ou  { evento: uuid, falhas: true }  (todos com falha no evento)
// Resposta: { ok: true, enviado, falhou, nao_enviado, aviso? }
// Cada reenvio fica na auditoria (email_confirmacao_resultado com o admin como ator).
import { erro, iniciar, resposta, servidor, uuid } from '../_shared/comum.ts';
import { emailConfigurado, enviarConfirmacao } from '../_shared/email.ts';

Deno.serve(async (req) => {
  try {
    const ini = await iniciar(req);
    if (ini instanceof Response) return ini;
    const { admin, corpo } = ini;
    const sb = servidor();

    let ids: string[] = [];
    if (Array.isArray(corpo.ids)) {
      ids = [...new Set(corpo.ids.map(uuid).filter(Boolean))];
    } else if (corpo.falhas === true && uuid(corpo.evento)) {
      const { data, error } = await sb.from('inscricoes').select('id')
        .eq('evento_id', uuid(corpo.evento)).eq('email_confirmacao_status', 'falhou').neq('status', 'cancelado');
      if (error) throw new Error('lista: ' + error.code);
      ids = (data ?? []).map((x: { id: string }) => x.id);
    }
    if (!ids.length) return erro(req, 400, 'Nenhuma inscrição para reenviar.');
    if (ids.length > 300) return erro(req, 400, 'Reenvie no máximo 300 de cada vez.');

    const total = { enviado: 0, falhou: 0, nao_enviado: 0 };
    for (const id of ids) {
      const r = await enviarConfirmacao(sb, id, { forcar: true, ator: admin.id });
      if (r === 'enviado') total.enviado++;
      else if (r === 'nao_enviado') total.nao_enviado++;
      else total.falhou++;
    }
    return resposta(req, 200, {
      ok: true, ...total,
      ...(emailConfigurado() ? {} : { aviso: 'O envio de e-mails ainda não está configurado (Resend). Nada foi enviado.' }),
    });
  } catch (e) {
    console.error('reenviar-confirmacao: erro interno', (e as Error).message);
    return erro(req, 500, 'Erro interno. Tente de novo em instantes.');
  }
});
