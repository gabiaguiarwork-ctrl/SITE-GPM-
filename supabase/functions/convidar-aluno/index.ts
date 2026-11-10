// convidar-aluno · convida uma pessoa para a Área do Aluno (ou reenvia o convite pendente).
// Corpo: { nome, sobrenome?, email, whatsapp?, empresa?, cargo?, papel?: 'aluno' | 'admin' }
import { convidar, email, erro, iniciar, resposta, servidor, texto } from '../_shared/comum.ts';

Deno.serve(async (req) => {
  try {
    const ini = await iniciar(req);
    if (ini instanceof Response) return ini;
    const { admin, corpo } = ini;

    const dados = {
      nome: texto(corpo.nome, 60),
      sobrenome: texto(corpo.sobrenome, 80),
      email: email(corpo.email),
      whatsapp: texto(corpo.whatsapp, 30),
      empresa: texto(corpo.empresa, 120),
      cargo: texto(corpo.cargo, 120),
    };
    const papel = corpo.papel === 'admin' ? 'admin' : 'aluno';
    if (dados.nome.length < 2) return erro(req, 400, 'Informe o nome.');
    if (!dados.email) return erro(req, 400, 'Informe um e-mail válido.');

    const sb = servidor();
    const r = await convidar(sb, admin, dados);
    if (!r.ok) return erro(req, 409, r.mensagem);

    if (papel === 'admin' && r.id) {
      const { error } = await sb.rpc('admin_definir_papel', { alvo: r.id, papel: 'admin', ator: admin.id });
      if (error) return resposta(req, 200, { ok: true, id: r.id, aviso: 'Convite enviado, mas não foi possível dar o papel de admin. Tente pelo botão "Tornar admin".' });
    }
    return resposta(req, 200, { ok: true, id: r.id, mensagem: r.mensagem });
  } catch (_e) {
    return erro(req, 500, 'Erro interno. Tente de novo em instantes.');
  }
});
