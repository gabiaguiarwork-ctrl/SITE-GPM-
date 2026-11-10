// alterar-papel-aluno · torna admin ou volta a aluno.
// Corpo: { id, papel: 'aluno' | 'admin' }
// O novo admin precisa cadastrar o aplicativo autenticador no primeiro acesso ao painel.
import { erro, iniciar, resposta, servidor, uuid } from '../_shared/comum.ts';

Deno.serve(async (req) => {
  try {
    const ini = await iniciar(req);
    if (ini instanceof Response) return ini;
    const { admin, corpo } = ini;

    const id = uuid(corpo.id);
    const papel = corpo.papel;
    if (!id || (papel !== 'aluno' && papel !== 'admin')) return erro(req, 400, 'Dados inválidos.');
    if (id === admin.id && papel === 'aluno') return erro(req, 400, 'Você não pode tirar o próprio papel de admin.');

    const sb = servidor();
    const { error } = await sb.rpc('admin_definir_papel', { alvo: id, papel, ator: admin.id });
    if (error) return erro(req, 404, 'Aluno não encontrado.');

    return resposta(req, 200, { ok: true, mensagem: papel === 'admin' ? 'Agora é admin.' : 'Agora é aluno.' });
  } catch (_e) {
    return erro(req, 500, 'Erro interno. Tente de novo em instantes.');
  }
});
