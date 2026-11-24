// Academia de Virtudes · envio do e-mail de confirmação da inscrição (Resend).
//
// - A chave fica no secret RESEND_API_KEY do Supabase. Sem ela, nada é enviado e a
//   inscrição fica "nao_enviado" (dá para reenviar depois pelo painel).
// - O banco controla o limite (1 e-mail a cada 10 minutos por inscrição, exceto quando
//   o admin força o reenvio) e guarda o resultado (migration 0010).
// - Remetente e "responder para" podem ser trocados pelos secrets EMAIL_REMETENTE e
//   EMAIL_RESPONDER_PARA, sem mexer no código.
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.119.0';
import { montarEmail } from './modelos-email.mjs';
import { mascarar } from './publico.ts';

const REMETENTE_PADRAO = 'Academia de Virtudes <marketing@gpmintegracao.com.br>';
const RESPONDER_PADRAO = 'marketing@gpmintegracao.com.br';

export type ResultadoEmail = 'enviado' | 'falhou' | 'nao_enviado' | 'limitado';

export function emailConfigurado(): boolean {
  return (Deno.env.get('RESEND_API_KEY') ?? '').startsWith('re_');
}

function base64(texto: string): string {
  const bytes = new TextEncoder().encode(texto);
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

export async function enviarConfirmacao(
  sb: SupabaseClient,
  inscricao: string,
  opcoes: { forcar: boolean; ator: string | null },
): Promise<ResultadoEmail> {
  if (!emailConfigurado()) {
    if (opcoes.ator) await sb.rpc('email_confirmacao_resultado', { inscricao, resultado: 'nao_enviado', ator: opcoes.ator });
    return 'nao_enviado';
  }
  const { data: d, error: er } = await sb.rpc('email_confirmacao_reservar', { inscricao, forcar: opcoes.forcar });
  if (er) {
    console.error('email: reserva falhou', er.code);
    return 'falhou';
  }
  if (!d) return 'limitado';

  let resultado: ResultadoEmail = 'falhou';
  try {
    const m = montarEmail(d);
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + Deno.env.get('RESEND_API_KEY'),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: Deno.env.get('EMAIL_REMETENTE') || REMETENTE_PADRAO,
        to: [d.email],
        reply_to: Deno.env.get('EMAIL_RESPONDER_PARA') || RESPONDER_PADRAO,
        subject: m.assunto,
        html: m.html,
        text: m.texto,
        attachments: m.anexos.map((a: { filename: string; conteudo: string; tipo: string }) => ({
          filename: a.filename, content: base64(a.conteudo), content_type: a.tipo,
        })),
        tags: [{ name: 'tipo', value: 'confirmacao_inscricao' }],
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (r.ok) resultado = 'enviado';
    else console.error('email: Resend respondeu', r.status, 'para', mascarar(d.email));
  } catch (e) {
    console.error('email: erro no envio para', mascarar(d.email), (e as Error).name);
  }
  await sb.rpc('email_confirmacao_resultado', { inscricao, resultado, ator: opcoes.ator });
  return resultado;
}
