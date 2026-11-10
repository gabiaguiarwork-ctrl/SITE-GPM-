// importar-alunos · convida várias pessoas de uma vez (lista vinda de um CSV lido no navegador).
// Corpo: { alunos: [{ nome, email, whatsapp?, empresa?, cargo? }] }  (até 100 por vez)
// Devolve o resultado de cada linha. O limite de e-mails por hora do SMTP vale aqui também.
import { convidar, email, erro, iniciar, resposta, servidor, texto } from '../_shared/comum.ts';

const MAXIMO = 100;

Deno.serve(async (req) => {
  try {
    const ini = await iniciar(req);
    if (ini instanceof Response) return ini;
    const { admin, corpo } = ini;

    if (!Array.isArray(corpo.alunos) || !corpo.alunos.length) return erro(req, 400, 'Envie a lista de alunos.');
    if (corpo.alunos.length > MAXIMO) return erro(req, 400, `Envie no máximo ${MAXIMO} pessoas por vez.`);

    const sb = servidor();
    const vistos = new Set<string>();
    const resultados: { linha: number; email: string; ok: boolean; mensagem: string }[] = [];

    for (let i = 0; i < corpo.alunos.length; i++) {
      const a = (corpo.alunos[i] ?? {}) as Record<string, unknown>;
      const dados = {
        nome: texto(a.nome, 120), email: email(a.email), whatsapp: texto(a.whatsapp, 30),
        empresa: texto(a.empresa, 120), cargo: texto(a.cargo, 120),
      };
      const linha = i + 1;
      if (!dados.email) { resultados.push({ linha, email: texto(a.email, 254), ok: false, mensagem: 'E-mail inválido.' }); continue; }
      if (dados.nome.length < 3) { resultados.push({ linha, email: dados.email, ok: false, mensagem: 'Nome ausente.' }); continue; }
      if (vistos.has(dados.email)) { resultados.push({ linha, email: dados.email, ok: false, mensagem: 'Repetido na lista.' }); continue; }
      vistos.add(dados.email);

      const r = await convidar(sb, admin, dados);
      resultados.push({ linha, email: dados.email, ok: r.ok, mensagem: r.mensagem });
      if (/Limite de envio/.test(r.mensagem)) {
        for (let j = i + 1; j < corpo.alunos.length; j++) {
          const b = (corpo.alunos[j] ?? {}) as Record<string, unknown>;
          resultados.push({ linha: j + 1, email: texto(b.email, 254), ok: false, mensagem: 'Não enviado (limite de e-mails). Importe de novo mais tarde.' });
        }
        break;
      }
      await new Promise((r) => setTimeout(r, 250)); // não estoura o limite de envio por segundo
    }

    const enviados = resultados.filter((r) => r.ok).length;
    return resposta(req, 200, { ok: true, enviados, total: resultados.length, resultados });
  } catch (_e) {
    return erro(req, 500, 'Erro interno. Tente de novo em instantes.');
  }
});
