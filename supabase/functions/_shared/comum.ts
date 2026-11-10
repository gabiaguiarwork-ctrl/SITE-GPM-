// Área do Aluno · Academia de Virtudes · código comum das Edge Functions.
//
// Segurança
// - CORS só para o site (e o localhost de testes).
// - Toda função confere, com o token de quem chamou, que é admin ATIVO e com MFA (is_admin() = aal2).
// - A chave do servidor (service_role) vem do ambiente da Edge Function (variável padrão do Supabase).
//   Ela nunca aparece no repositório nem volta para o navegador.
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.119.0';

const ORIGENS = new Set([
  'https://gpmintegracao.com.br',
  'https://www.gpmintegracao.com.br',
  'http://localhost:5500',
  'http://127.0.0.1:5500',
]);

export const SITE = 'https://gpmintegracao.com.br';
export const REDIRECT_CONVITE = SITE + '/academiadevirtudes/redefinir-senha/';

export function cors(req: Request): Record<string, string> {
  const origem = req.headers.get('Origin') ?? '';
  return {
    'Access-Control-Allow-Origin': ORIGENS.has(origem) ? origem : SITE,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '600',
    'Vary': 'Origin',
  };
}

export function resposta(req: Request, status: number, corpo: unknown): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { ...cors(req), 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

export function erro(req: Request, status: number, mensagem: string): Response {
  return resposta(req, status, { erro: mensagem });
}

function env(nome: string): string {
  const v = Deno.env.get(nome);
  if (!v) throw new Error(`variável de ambiente ausente: ${nome}`);
  return v;
}

export function servidor(): SupabaseClient {
  return createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export type Admin = { id: string; email: string };

// Confere quem chamou. Devolve o admin ou uma Response de erro.
export async function exigirAdmin(req: Request): Promise<Admin | Response> {
  const auth = req.headers.get('Authorization') ?? '';
  const token = auth.replace(/^Bearer\s+/i, '');
  if (!token || token.split('.').length !== 3) return erro(req, 401, 'Sessão inválida. Entre de novo.');

  const chavePublica = Deno.env.get('SUPABASE_ANON_KEY') ?? req.headers.get('apikey') ?? '';
  const usuario = createClient(env('SUPABASE_URL'), chavePublica, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data: u, error: eu } = await usuario.auth.getUser(token);
  if (eu || !u?.user) return erro(req, 401, 'Sessão inválida. Entre de novo.');

  // is_admin() só é verdadeiro para admin ativo com sessão aal2 (MFA confirmado).
  const { data: ok, error: ea } = await usuario.rpc('is_admin');
  if (ea || ok !== true) return erro(req, 403, 'Acesso restrito à equipe GPM (com verificação em duas etapas).');

  return { id: u.user.id, email: u.user.email ?? '' };
}

// Início comum: CORS, método, admin e corpo JSON.
export async function iniciar(req: Request): Promise<{ admin: Admin; corpo: Record<string, unknown> } | Response> {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(req) });
  if (req.method !== 'POST') return erro(req, 405, 'Método não permitido.');
  const origem = req.headers.get('Origin');
  if (origem && !ORIGENS.has(origem)) return erro(req, 403, 'Origem não permitida.');

  const admin = await exigirAdmin(req);
  if (admin instanceof Response) return admin;

  const tamanho = Number(req.headers.get('Content-Length') ?? '0');
  if (tamanho > 200_000) return erro(req, 413, 'Requisição grande demais.');
  let corpo: Record<string, unknown>;
  try {
    const c = await req.json();
    if (!c || typeof c !== 'object' || Array.isArray(c)) throw new Error('corpo');
    corpo = c as Record<string, unknown>;
  } catch {
    return erro(req, 400, 'Dados inválidos.');
  }
  return { admin, corpo };
}

/* ---------- Validação ---------- */
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function texto(v: unknown, max: number): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}
export function email(v: unknown): string {
  const e = texto(v, 254).toLowerCase();
  return EMAIL.test(e) ? e : '';
}
export function uuid(v: unknown): string {
  const s = texto(v, 36);
  return UUID.test(s) ? s.toLowerCase() : '';
}

export async function auditar(sb: SupabaseClient, quem: string, acao: string, alvo: string, detalhes: Record<string, unknown>) {
  await sb.from('auditoria').insert({ quem, acao, alvo, detalhes });
}

// Convida (ou reenvia o convite) e completa o perfil. Usado por convidar-aluno e importar-alunos.
export async function convidar(
  sb: SupabaseClient,
  admin: Admin,
  dados: { nome: string; sobrenome: string; email: string; whatsapp: string; empresa: string; cargo: string },
): Promise<{ ok: boolean; id?: string; mensagem: string }> {
  const { data, error } = await sb.auth.admin.inviteUserByEmail(dados.email, {
    redirectTo: REDIRECT_CONVITE,
    // O banco limpa e valida estes dados (migration 0006). CPF não vem do painel: a pessoa preenche no primeiro acesso.
    data: { nome: dados.nome, sobrenome: dados.sobrenome, whatsapp: dados.whatsapp, empresa: dados.empresa, cargo: dados.cargo },
  });
  if (error) {
    const codigo = (error as { code?: string }).code ?? '';
    if (codigo === 'email_exists' || /already been registered|already registered/i.test(error.message)) {
      return { ok: false, mensagem: 'Este e-mail já tem acesso. Se a pessoa não lembra a senha, ela pode usar "Esqueci minha senha".' };
    }
    if (error.status === 429 || /rate limit/i.test(error.message)) {
      return { ok: false, mensagem: 'Limite de envio de e-mails atingido. Tente de novo mais tarde.' };
    }
    return { ok: false, mensagem: 'Não foi possível enviar o convite.' };
  }
  const id = data.user?.id ?? '';
  if (id) {
    await sb.rpc('admin_completar_perfil', {
      alvo: id, nome: dados.nome, whatsapp: dados.whatsapp, empresa: dados.empresa, cargo: dados.cargo,
    });
    await auditar(sb, admin.id, 'convidar_aluno', id, { email: dados.email });
  }
  return { ok: true, id, mensagem: 'Convite enviado.' };
}
