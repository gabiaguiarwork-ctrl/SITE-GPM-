// Academia de Virtudes · código comum das Edge Functions PÚBLICAS (sem login):
// inscricao e confirmar-presenca.
//
// Segurança
// - CORS só para o site e os endereços de teste (mesma lista do comum.ts).
// - CAPTCHA (Cloudflare Turnstile) conferido NO SERVIDOR, com a secret TURNSTILE_SECRET.
// - Limite de envios por origem: o IP nunca é guardado, só um hash com o sal secreto IP_SALT.
// - Logs sem dados pessoais (WhatsApp e e-mail mascarados).
import { cors, erro, ORIGENS } from './comum.ts';

export const HOSTS_TURNSTILE = new Set(['gpmintegracao.com.br', 'www.gpmintegracao.com.br', 'localhost', '127.0.0.1']);

// CORS, método, origem, tamanho e corpo JSON (sem exigir login).
export async function iniciarPublico(req: Request, limiteBytes = 20_000): Promise<Record<string, unknown> | Response> {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(req) });
  if (req.method !== 'POST') return erro(req, 405, 'Método não permitido.');
  const origem = req.headers.get('Origin');
  if (origem && !ORIGENS.has(origem)) return erro(req, 403, 'Origem não permitida.');
  const tamanho = Number(req.headers.get('Content-Length') ?? '0');
  if (tamanho > limiteBytes) return erro(req, 413, 'Requisição grande demais.');
  try {
    const bruto = await req.text();
    if (bruto.length > limiteBytes) return erro(req, 413, 'Requisição grande demais.');
    const c = JSON.parse(bruto);
    if (!c || typeof c !== 'object' || Array.isArray(c)) throw new Error('corpo');
    return c as Record<string, unknown>;
  } catch {
    return erro(req, 400, 'Dados inválidos.');
  }
}

export function ipDe(req: Request): string {
  const cf = req.headers.get('cf-connecting-ip');
  if (cf) return cf.trim();
  const xff = req.headers.get('x-forwarded-for') ?? '';
  return xff.split(',')[0].trim() || '0.0.0.0';
}

// Hash SHA-256 de (sal + IP): serve para contar envios sem guardar o IP.
export async function chaveOrigem(req: Request): Promise<string> {
  const sal = Deno.env.get('IP_SALT') ?? '';
  if (sal.length < 16) throw new Error('IP_SALT ausente ou curto');
  const bytes = new TextEncoder().encode(sal + '|' + ipDe(req));
  const h = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(h), (b) => b.toString(16).padStart(2, '0')).join('');
}

// Confere o token do Turnstile na Cloudflare. Recusa se faltar a secret.
export async function captchaValido(req: Request, token: unknown, acao: string): Promise<boolean> {
  const secret = Deno.env.get('TURNSTILE_SECRET') ?? '';
  if (!secret || typeof token !== 'string' || token.length < 10 || token.length > 4096) return false;
  const form = new FormData();
  form.append('secret', secret);
  form.append('response', token);
  form.append('remoteip', ipDe(req));
  form.append('idempotency_key', crypto.randomUUID());
  try {
    const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST', body: form, signal: AbortSignal.timeout(8000),
    });
    const j = await r.json() as { success?: boolean; hostname?: string; action?: string };
    if (!j.success) return false;
    if (j.hostname && !HOSTS_TURNSTILE.has(j.hostname)) return false;
    if (j.action && j.action !== acao) return false;
    return true;
  } catch {
    return false;
  }
}

// Para logs: 21999990001 → 21*******01 · ana@empresa.com → a***@empresa.com
export function mascarar(v: string): string {
  if (!v) return '';
  if (v.includes('@')) {
    const [u, d] = v.split('@');
    return (u.slice(0, 1) || '') + '***@' + (d || '');
  }
  return v.length > 4 ? v.slice(0, 2) + '*'.repeat(v.length - 4) + v.slice(-2) : '****';
}

// Roda depois de responder (o e-mail não segura a resposta da inscrição).
export function emSegundoPlano(p: Promise<unknown>) {
  const rt = (globalThis as unknown as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime;
  if (rt?.waitUntil) rt.waitUntil(p);
  else p.catch(() => {});
}
