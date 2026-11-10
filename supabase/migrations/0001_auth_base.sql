-- =====================================================================
-- Área do Aluno · Academia de Virtudes
-- 0001 · Base de autenticação: perfis, auditoria, funções de acesso e RLS
--
-- Rodar no SQL Editor do Supabase (projeto qfghgtrvwklzlsuawndm).
-- Idempotente: pode ser executado mais de uma vez.
--
-- Desenho de segurança
-- - Funções com privilégio elevado (SECURITY DEFINER) ficam no esquema
--   "privado", que NÃO é exposto pela API. O esquema "public" só tem
--   funções SECURITY INVOKER que chamam as do "privado".
-- - RLS ativada em todas as tabelas; o papel anon não recebe nada.
-- - O aluno edita só nome, WhatsApp, empresa e cargo do próprio perfil
--   (privilégio por coluna + trigger de proteção).
-- - is_admin() só é verdadeiro com a sessão em aal2 (MFA).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Esquema privado (não exposto na API do Supabase)
-- ---------------------------------------------------------------------
create schema if not exists privado;
revoke all on schema privado from public, anon;
grant usage on schema privado to authenticated, service_role;

-- ---------------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id                        uuid primary key references auth.users (id) on delete cascade,
  nome                      text check (nome is null or char_length(nome) <= 120),
  email                     text,
  whatsapp                  text check (whatsapp is null or char_length(whatsapp) <= 30),
  empresa                   text check (empresa is null or char_length(empresa) <= 120),
  cargo                     text check (cargo is null or char_length(cargo) <= 120),
  role                      text not null default 'aluno' check (role in ('aluno', 'admin')),
  ativo                     boolean not null default true,
  aceite_privacidade_em     timestamptz,
  aceite_privacidade_versao text check (aceite_privacidade_versao is null or char_length(aceite_privacidade_versao) <= 20),
  criado_em                 timestamptz not null default now(),
  ultimo_acesso             timestamptz
);
comment on table public.profiles is 'Perfil de cada usuário da Área do Aluno (1:1 com auth.users).';

create table if not exists public.auditoria (
  id        bigint generated always as identity primary key,
  quando    timestamptz not null default now(),
  quem      uuid,
  acao      text not null,
  alvo      text,
  detalhes  jsonb
);
comment on table public.auditoria is 'Registro de ações administrativas. Só inserção (por funções do servidor); só admin lê.';
create index if not exists auditoria_quando_idx on public.auditoria (quando desc);

alter table public.profiles  enable row level security;
alter table public.auditoria enable row level security;

-- ---------------------------------------------------------------------
-- Funções privadas (SECURITY DEFINER, search_path vazio)
-- ---------------------------------------------------------------------

-- O usuário logado está ativo?
create or replace function privado.is_active()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(
    (select p.ativo from public.profiles p where p.id = (select auth.uid())),
    false
  );
$$;

-- O usuário logado é admin ativo E está com a sessão verificada por MFA (aal2)?
create or replace function privado.is_admin()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(
    (select p.role = 'admin' and p.ativo from public.profiles p where p.id = (select auth.uid())),
    false
  )
  and coalesce((select auth.jwt() ->> 'aal') = 'aal2', false);
$$;

-- O usuário logado tem papel de admin (sem exigir MFA)? Usado só para a tela
-- decidir se manda para o cadastro do autenticador. Não libera nenhum dado.
create or replace function privado.tem_papel_admin()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(
    (select p.role = 'admin' and p.ativo from public.profiles p where p.id = (select auth.uid())),
    false
  );
$$;

create or replace function privado.registrar_acesso()
returns void
language sql volatile security definer set search_path = ''
as $$
  update public.profiles
     set ultimo_acesso = now()
   where id = (select auth.uid()) and ativo;
$$;

create or replace function privado.aceitar_privacidade(versao text)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'não autenticado' using errcode = '42501';
  end if;
  if versao is null or versao !~ '^[0-9]{4}-[0-9]{2}$' then
    raise exception 'versão inválida' using errcode = '22023';
  end if;
  update public.profiles
     set aceite_privacidade_em = now(),
         aceite_privacidade_versao = versao
   where id = (select auth.uid()) and ativo;
end;
$$;


-- Novo usuário em auth.users → cria o perfil.
-- O papel NUNCA vem dos metadados (sempre 'aluno'); só o servidor promove a admin.
create or replace function privado.handle_new_user()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, nome, email, whatsapp, empresa, cargo)
  values (
    new.id,
    nullif(left(trim(new.raw_user_meta_data ->> 'nome'), 120), ''),
    new.email,
    nullif(left(trim(new.raw_user_meta_data ->> 'whatsapp'), 30), ''),
    nullif(left(trim(new.raw_user_meta_data ->> 'empresa'), 120), ''),
    nullif(left(trim(new.raw_user_meta_data ->> 'cargo'), 120), '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- E-mail trocado em auth.users → atualiza o perfil.
create or replace function privado.sync_user_email()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.email is distinct from old.email then
    update public.profiles set email = new.email where id = new.id;
  end if;
  return new;
end;
$$;

-- Proteção de colunas: pelo front (papéis anon/authenticated) ninguém altera
-- id, e-mail, papel, status, aceite, datas. Só funções do servidor
-- (SECURITY DEFINER, que rodam como o dono) e a service_role conseguem.
-- Precisa ser SECURITY INVOKER: numa função definer, current_user seria o dono
-- (postgres) e a checagem abaixo nunca bloquearia nada.
create or replace function privado.proteger_profiles()
returns trigger
language plpgsql security invoker set search_path = ''
as $$
begin
  if current_user in ('authenticated', 'anon') then
    if new.id is distinct from old.id
       or new.email is distinct from old.email
       or new.role is distinct from old.role
       or new.ativo is distinct from old.ativo
       or new.criado_em is distinct from old.criado_em
       or new.ultimo_acesso is distinct from old.ultimo_acesso
       or new.aceite_privacidade_em is distinct from old.aceite_privacidade_em
       or new.aceite_privacidade_versao is distinct from old.aceite_privacidade_versao then
      raise exception 'alteração não permitida' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

-- Quem está agindo: o usuário logado ou, quando a ação vem de uma Edge Function
-- (chave do servidor, sem auth.uid()), o admin informado em app.ator só para a transação.
create or replace function privado.ator()
returns uuid
language plpgsql stable security definer set search_path = ''
as $$
declare
  v text;
begin
  if (select auth.uid()) is not null then
    return (select auth.uid());
  end if;
  v := nullif(current_setting('app.ator', true), '');
  if v is null or v !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return null;
  end if;
  return v::uuid;
end;
$$;

-- Auditoria de mudanças de papel e status (venham de onde vierem, inclusive SQL manual).
create or replace function privado.auditar_profiles()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.role is distinct from old.role then
    insert into public.auditoria (quem, acao, alvo, detalhes)
    values (privado.ator(), 'alterar_papel', new.id::text,
            jsonb_build_object('de', old.role, 'para', new.role, 'email', new.email));
  end if;
  if new.ativo is distinct from old.ativo then
    insert into public.auditoria (quem, acao, alvo, detalhes)
    values (privado.ator(), case when new.ativo then 'reativar_aluno' else 'desativar_aluno' end,
            new.id::text, jsonb_build_object('email', new.email));
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function privado.handle_new_user();

drop trigger if exists on_auth_user_email_changed on auth.users;
create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row execute function privado.sync_user_email();

drop trigger if exists profiles_proteger on public.profiles;
create trigger profiles_proteger
  before update on public.profiles
  for each row execute function privado.proteger_profiles();

drop trigger if exists profiles_auditar on public.profiles;
create trigger profiles_auditar
  after update on public.profiles
  for each row execute function privado.auditar_profiles();

-- ---------------------------------------------------------------------
-- Funções públicas (SECURITY INVOKER) chamadas pelo front via RPC
-- ---------------------------------------------------------------------
create or replace function public.is_active()
returns boolean language sql stable security invoker set search_path = ''
as $$ select privado.is_active(); $$;

create or replace function public.is_admin()
returns boolean language sql stable security invoker set search_path = ''
as $$ select privado.is_admin(); $$;

create or replace function public.tem_papel_admin()
returns boolean language sql stable security invoker set search_path = ''
as $$ select privado.tem_papel_admin(); $$;

create or replace function public.registrar_acesso()
returns void language sql volatile security invoker set search_path = ''
as $$ select privado.registrar_acesso(); $$;

create or replace function public.aceitar_privacidade(versao text)
returns void language sql volatile security invoker set search_path = ''
as $$ select privado.aceitar_privacidade(versao); $$;

-- ---------------------------------------------------------------------
-- Privilégios de execução: nada para public/anon
-- ---------------------------------------------------------------------
revoke execute on all functions in schema privado from public, anon;
revoke execute on function privado.handle_new_user()   from authenticated;
revoke execute on function privado.sync_user_email()   from authenticated;
revoke execute on function privado.proteger_profiles() from authenticated;
revoke execute on function privado.auditar_profiles()  from authenticated;
revoke execute on function privado.ator()              from authenticated;

grant execute on function privado.is_active()                to authenticated, service_role;
grant execute on function privado.is_admin()                 to authenticated, service_role;
grant execute on function privado.tem_papel_admin()          to authenticated, service_role;
grant execute on function privado.registrar_acesso()         to authenticated;
grant execute on function privado.aceitar_privacidade(text)  to authenticated;

revoke execute on function public.is_active()                from public, anon;
revoke execute on function public.is_admin()                 from public, anon;
revoke execute on function public.tem_papel_admin()          from public, anon;
revoke execute on function public.registrar_acesso()         from public, anon;
revoke execute on function public.aceitar_privacidade(text)  from public, anon;
grant execute on function public.is_active()                 to authenticated;
grant execute on function public.is_admin()                  to authenticated;
grant execute on function public.tem_papel_admin()           to authenticated;
grant execute on function public.registrar_acesso()          to authenticated;
grant execute on function public.aceitar_privacidade(text)   to authenticated;

-- Funções criadas no futuro neste esquema não ficam executáveis por padrão.
alter default privileges in schema privado revoke execute on functions from public, anon;

-- ---------------------------------------------------------------------
-- Privilégios nas tabelas (mínimos)
-- ---------------------------------------------------------------------
revoke all on table public.profiles  from public, anon, authenticated;
revoke all on table public.auditoria from public, anon, authenticated;

grant select on table public.profiles to authenticated;
grant update (nome, whatsapp, empresa, cargo) on table public.profiles to authenticated;
grant select on table public.auditoria to authenticated;

grant all on table public.profiles  to service_role;
grant all on table public.auditoria to service_role;

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated
  using ((id = (select auth.uid()) and (select privado.is_active())) or (select privado.is_admin()));

drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles
  for update to authenticated
  using      ((id = (select auth.uid()) and (select privado.is_active())) or (select privado.is_admin()))
  with check ((id = (select auth.uid()) and (select privado.is_active())) or (select privado.is_admin()));

-- INSERT e DELETE em profiles: nenhuma política = ninguém pelo front.

drop policy if exists auditoria_select on public.auditoria;
create policy auditoria_select on public.auditoria
  for select to authenticated
  using ((select privado.is_admin()));

-- INSERT/UPDATE/DELETE em auditoria: nenhuma política e nenhum GRANT = ninguém pelo front.
