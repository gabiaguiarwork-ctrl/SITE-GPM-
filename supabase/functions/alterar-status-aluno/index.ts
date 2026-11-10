// alterar-status-aluno · desativa ou reativa o acesso de um aluno.
// Corpo: { id, ativo: boolean }
// Desativado: a RLS bloqueia tudo na hora (mesmo com a sessão aberta) e o login fica
// suspenso (ban), então a sessão não se renova.
import { erro, iniciar, resposta, servidor, uuid } from '../_shared/comum.ts';

Deno.serve(async (req) => {
  try {
    const ini = await iniciar(req);
    if (ini instanceof Response) return ini;
    const { admin, corpo } = ini;

    const id = uuid(corpo.id);
    if (!id || typeof corpo.ativo !== 'boolean') return erro(req, 400, 'Dados inválidos.');
    if (id === admin.id && corpo.ativo === false) return erro(req, 400, 'Você não pode desativar o próprio acesso.');

    const sb = servidor();
    const { error: e1 } = await sb.rpc('admin_definir_status', { alvo: id, ativo: corpo.ativo, ator: admin.id });
    if (e1) return erro(req, 404, 'Aluno não encontrado.');

    const { error: e2 } = await sb.auth.admin.updateUserById(id, { ban_duration: corpo.ativo ? 'none' : '876000h' });
    if (e2) return resposta(req, 200, { ok: true, aviso: 'Status alterado. O bloqueio de novas entradas não foi aplicado; tente de novo.' });

    return resposta(req, 200, { ok: true, mensagem: corpo.ativo ? 'Acesso reativado.' : 'Acesso desativado.' });
  } catch (_e) {
    return erro(req, 500, 'Erro interno. Tente de novo em instantes.');
  }
});
