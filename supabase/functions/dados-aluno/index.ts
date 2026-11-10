// dados-aluno · LGPD: exportar ou excluir os dados de um aluno, a pedido dele.
// Corpo: { id, acao: 'exportar' | 'excluir', confirmacao?: string }
// - exportar: devolve um JSON com perfil, conta, progresso e registros de auditoria sobre a pessoa.
// - excluir: apaga a conta (perfil e progresso vão junto, em cascata). Exige confirmacao = e-mail do aluno.
//   Admins precisam voltar a "aluno" antes. Os registros de auditoria ficam (prestação de contas),
//   mas sem o e-mail.
import { auditar, erro, iniciar, resposta, servidor, texto, uuid } from '../_shared/comum.ts';

Deno.serve(async (req) => {
  try {
    const ini = await iniciar(req);
    if (ini instanceof Response) return ini;
    const { admin, corpo } = ini;

    const id = uuid(corpo.id);
    if (!id || (corpo.acao !== 'exportar' && corpo.acao !== 'excluir')) return erro(req, 400, 'Dados inválidos.');

    const sb = servidor();
    const { data: perfil } = await sb.from('profiles').select('*').eq('id', id).maybeSingle();
    if (!perfil) return erro(req, 404, 'Aluno não encontrado.');

    if (corpo.acao === 'exportar') {
      const { data: conta } = await sb.auth.admin.getUserById(id);
      const { data: progresso } = await sb.from('progresso')
        .select('concluido, posicao_seg, atualizado_em, conteudos(titulo, modulos(titulo))').eq('aluno_id', id);
      const { data: registros } = await sb.from('auditoria').select('quando, acao, detalhes').eq('alvo', id).order('quando');
      await auditar(sb, admin.id, 'exportar_dados_aluno', id, {});
      return resposta(req, 200, {
        ok: true,
        exportado_em: new Date().toISOString(),
        controlador: 'Grupo GPM · gpmintegracao.com.br',
        perfil,
        conta: conta?.user ? {
          email: conta.user.email, criado_em: conta.user.created_at, email_confirmado_em: conta.user.email_confirmed_at,
          ultimo_login: conta.user.last_sign_in_at, verificacao_duas_etapas: (conta.user.factors ?? []).some((f) => f.status === 'verified'),
        } : null,
        progresso: progresso ?? [],
        registros: registros ?? [],
      });
    }

    // excluir
    if (id === admin.id) return erro(req, 400, 'Você não pode excluir a própria conta por aqui.');
    if (perfil.role === 'admin') return erro(req, 400, 'Volte esta pessoa para "aluno" antes de excluir.');
    if (texto(corpo.confirmacao, 254).toLowerCase() !== String(perfil.email ?? '').toLowerCase()) {
      return erro(req, 400, 'Para confirmar, digite o e-mail do aluno.');
    }
    await auditar(sb, admin.id, 'excluir_dados_aluno', id, { motivo: 'pedido do titular (LGPD)' });
    const { error } = await sb.auth.admin.deleteUser(id);
    if (error) return erro(req, 500, 'Não foi possível excluir. Tente de novo.');
    // Tira o e-mail dos registros de auditoria sobre esta pessoa (o registro da ação continua).
    const { data: antigos } = await sb.from('auditoria').select('id, detalhes').eq('alvo', id);
    for (const r of antigos ?? []) {
      if (r.detalhes && typeof r.detalhes === 'object' && 'email' in r.detalhes) {
        const { email: _removido, ...resto } = r.detalhes as Record<string, unknown>;
        await sb.from('auditoria').update({ detalhes: resto }).eq('id', r.id);
      }
    }
    return resposta(req, 200, { ok: true, mensagem: 'Dados excluídos.' });
  } catch (_e) {
    return erro(req, 500, 'Erro interno. Tente de novo em instantes.');
  }
});
