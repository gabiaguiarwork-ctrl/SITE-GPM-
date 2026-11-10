-- =====================================================================
-- Área do Aluno · Academia de Virtudes
-- 0006 · Cadastro aberto (gratuito), cadastro completo com CPF e
--        consentimento de comunicações (LGPD)
--
-- Rodar no SQL Editor DEPOIS da 0005. Idempotente.
-- IMPORTANTE: esta migration substitui funções e privilégios criados na
-- 0001–0004. Se alguma delas for rodada de novo, rode a 0006 em seguida.
--
-- Regras
-- - Qualquer pessoa pode se cadastrar (o painel decide quando liberar).
--   O papel continua SEMPRE "aluno", ignorando os metadados.
-- - Dados do cadastro chegam pelos metadados do signUp. Aqui eles são
--   limpos (CPF e WhatsApp só com dígitos e válidos, textos com tamanho
--   certo). Dado inválido vira vazio em vez de derrubar o cadastro: a
--   pessoa completa depois na tela "Complete seu cadastro".
-- - CPF e WhatsApp saem dos metadados da conta (auth.users) logo depois de
--   copiados para o perfil, para não irem dentro do token de sessão.
-- - O aceite da privacidade NÃO vem dos metadados: é gravado por
--   aceitar_privacidade() depois da confirmação do e-mail.
-- - Conteúdo (encontros, aulas, avisos, progresso e materiais) só aparece
--   para quem está ativo E com o cadastro completo. Admin com MFA vê tudo.
-- - Consentimento de comunicações: só muda pela função própria, que grava
--   a data e registra na auditoria. O aluno pode marcar e desmarcar.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Colunas novas em profiles
-- ---------------------------------------------------------------------
alter table public.profiles add column if not exists sobrenome text;
alter table public.profiles add column if not exists cpf text;
alter table public.profiles add column if not exists aceite_comunicacoes boolean not null default false;
alter table public.profiles add column if not exists aceite_comunicacoes_em timestamptz;

alter table public.profiles drop constraint if exists profiles_sobrenome_tamanho;
alter table public.profiles add constraint profiles_sobrenome_tamanho
  check (sobrenome is null or char_length(sobrenome) between 2 and 80);
alter table public.profiles drop constraint if exists profiles_cpf_formato;
alter table public.profiles add constraint profiles_cpf_formato
  check (cpf is null or cpf ~ '^[0-9]{11}$');

comment on column public.profiles.cpf is 'CPF só com dígitos (validado). O aluno só preenche se estiver vazio; correção pela equipe.';
comment on column public.profiles.whatsapp is 'Celular/telefone com DDD, só dígitos (10 ou 11).';
comment on column public.profiles.aceite_comunicacoes is 'Consentimento (opcional) para receber comunicações do Grupo GPM.';
comment on column public.profiles.aceite_comunicacoes_em is 'Data da última mudança do consentimento de comunicações (aceite ou retirada).';

-- ---------------------------------------------------------------------
-- Funções de limpeza e validação (puras, sem acesso a dados)
-- ---------------------------------------------------------------------
create or replace function privado.so_digitos(v text)
returns text
language sql immutable set search_path = ''
as $$ select regexp_replace(coalesce(v, ''), '[^0-9]', '', 'g'); $$;

-- Celular ou fixo brasileiro com DDD, só dígitos: DDD (11–99, sem zero) + 8 dígitos,
-- ou DDD + 9 + 8 dígitos.
create or replace function privado.whatsapp_valido(v text)
returns boolean
language sql immutable set search_path = ''
as $$ select coalesce(v ~ '^[1-9][1-9]([0-9]{8}|9[0-9]{8})$', false); $$;

-- Aceita máscara e +55; devolve só os dígitos, ou null se não for válido.
create or replace function privado.whatsapp_limpo(v text)
returns text
language plpgsql immutable set search_path = ''
as $$
declare
  d text := privado.so_digitos(v);
begin
  if d ~ '^55[1-9][1-9][0-9]{8,9}$' then
    d := substr(d, 3);
  end if;
  return case when privado.whatsapp_valido(d) then d end;
end;
$$;

-- CPF com os dois dígitos verificadores (recusa sequências como 111.111.111-11).
create or replace function privado.cpf_valido(v text)
returns boolean
language plpgsql immutable set search_path = ''
as $$
declare
  soma int;
  resto int;
  i int;
begin
  if v is null or v !~ '^[0-9]{11}$' or v = repeat(substr(v, 1, 1), 11) then
    return false;
  end if;
  soma := 0;
  for i in 1..9 loop
    soma := soma + substr(v, i, 1)::int * (11 - i);
  end loop;
  resto := (soma * 10) % 11;
  if resto = 10 then resto := 0; end if;
  if resto <> substr(v, 10, 1)::int then
    return false;
  end if;
  soma := 0;
  for i in 1..10 loop
    soma := soma + substr(v, i, 1)::int * (12 - i);
  end loop;
  resto := (soma * 10) % 11;
  if resto = 10 then resto := 0; end if;
  return resto = substr(v, 11, 1)::int;
end;
$$;

create or replace function privado.cpf_limpo(v text)
returns text
language sql immutable set search_path = ''
as $$ select case when privado.cpf_valido(privado.so_digitos(v)) then privado.so_digitos(v) end; $$;

-- Texto vindo de fora (metadados, convite): tira caracteres de controle e espaços repetidos,
-- corta no máximo e devolve null se ficar curto demais.
create or replace function privado.texto_limpo(v text, minimo int, maximo int)
returns text
language sql immutable set search_path = ''
as $$
  select case when char_length(t) >= minimo then t end
    from (select btrim(left(btrim(regexp_replace(regexp_replace(coalesce(v, ''), '[[:cntrl:]]', ' ', 'g'), '\s+', ' ', 'g')), maximo)) as t) x;
$$;

-- Texto gravado pelo front: mesma limpeza, mas tamanho fora da regra é erro.
create or replace function privado.texto_validado(v text, minimo int, maximo int, campo text)
returns text
language plpgsql immutable set search_path = ''
as $$
declare
  t text := btrim(regexp_replace(regexp_replace(coalesce(v, ''), '[[:cntrl:]]', ' ', 'g'), '\s+', ' ', 'g'));
begin
  if t = '' then
    return null;
  end if;
  if char_length(t) < minimo or char_length(t) > maximo then
    raise exception '% inválido', campo using errcode = '23514';
  end if;
  return t;
end;
$$;

-- ---------------------------------------------------------------------
-- Cadastro completo
-- ---------------------------------------------------------------------
create or replace function privado.cadastro_completo_de(uid uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((
    select char_length(p.nome) between 2 and 60
       and char_length(p.sobrenome) between 2 and 80
       and privado.whatsapp_valido(p.whatsapp)
       and privado.cpf_valido(p.cpf)
       and char_length(p.empresa) between 2 and 120
       and char_length(p.cargo) between 2 and 120
       and p.aceite_privacidade_em is not null
      from public.profiles p
     where p.id = uid
  ), false);
$$;

-- O usuário logado está com o cadastro completo?
create or replace function privado.cadastro_completo()
returns boolean
language sql stable security definer set search_path = ''
as $$ select privado.cadastro_completo_de((select auth.uid())); $$;

-- O usuário logado pode ver o conteúdo da Academia? (ativo + cadastro completo)
create or replace function privado.pode_ver_conteudo()
returns boolean
language sql stable security definer set search_path = ''
as $$ select (select privado.is_active()) and (select privado.cadastro_completo()); $$;

-- ---------------------------------------------------------------------
-- Novo usuário: perfil a partir dos metadados (limpos) + tira CPF/WhatsApp da conta
-- ---------------------------------------------------------------------
create or replace function privado.limpar_metadados(uid uuid)
returns void
language sql volatile security definer set search_path = ''
as $$
  update auth.users
     set raw_user_meta_data = raw_user_meta_data - 'cpf' - 'whatsapp'
   where id = uid
     and (raw_user_meta_data ? 'cpf' or raw_user_meta_data ? 'whatsapp');
$$;

-- O papel NUNCA vem dos metadados (sempre 'aluno'); só o servidor promove a admin.
create or replace function privado.handle_new_user()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  m jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  comunicacoes boolean := coalesce((m ->> 'aceite_comunicacoes') = 'true', false);
  criado boolean;
begin
  insert into public.profiles (id, nome, sobrenome, email, whatsapp, cpf, empresa, cargo,
                               aceite_comunicacoes, aceite_comunicacoes_em)
  values (
    new.id,
    privado.texto_limpo(m ->> 'nome', 2, 60),
    privado.texto_limpo(m ->> 'sobrenome', 2, 80),
    new.email,
    privado.whatsapp_limpo(m ->> 'whatsapp'),
    privado.cpf_limpo(m ->> 'cpf'),
    privado.texto_limpo(m ->> 'empresa', 2, 120),
    privado.texto_limpo(m ->> 'cargo', 2, 120),
    comunicacoes,
    case when comunicacoes then now() end
  )
  on conflict (id) do nothing;
  criado := found;

  if criado and comunicacoes then
    insert into public.auditoria (quem, acao, alvo, detalhes)
    values (new.id, 'aceitar_comunicacoes', new.id::text, jsonb_build_object('origem', 'cadastro'));
  end if;

  -- A limpeza dos metadados nunca pode derrubar o cadastro.
  begin
    perform privado.limpar_metadados(new.id);
  exception when others then
    raise warning 'limpar_metadados falhou para %: %', new.id, sqlerrm;
  end;
  return new;
end;
$$;

-- Cadastro repetido de um e-mail ainda NÃO confirmado: o Supabase regrava os metadados.
-- Atualiza o perfil com os dados novos (só os válidos) e tira CPF/WhatsApp da conta de novo.
create or replace function privado.atualizar_cadastro_pendente()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  m jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  comunicacoes boolean := coalesce((m ->> 'aceite_comunicacoes') = 'true', false);
begin
  update public.profiles p
     set nome      = coalesce(privado.texto_limpo(m ->> 'nome', 2, 60), p.nome),
         sobrenome = coalesce(privado.texto_limpo(m ->> 'sobrenome', 2, 80), p.sobrenome),
         whatsapp  = coalesce(privado.whatsapp_limpo(m ->> 'whatsapp'), p.whatsapp),
         cpf       = coalesce(privado.cpf_limpo(m ->> 'cpf'), p.cpf),
         empresa   = coalesce(privado.texto_limpo(m ->> 'empresa', 2, 120), p.empresa),
         cargo     = coalesce(privado.texto_limpo(m ->> 'cargo', 2, 120), p.cargo),
         aceite_comunicacoes    = comunicacoes,
         aceite_comunicacoes_em = case when comunicacoes is distinct from p.aceite_comunicacoes then now()
                                       else p.aceite_comunicacoes_em end
   where p.id = new.id;
  -- A limpeza dos metadados nunca pode derrubar o cadastro.
  begin
    perform privado.limpar_metadados(new.id);
  exception when others then
    raise warning 'limpar_metadados falhou para %: %', new.id, sqlerrm;
  end;
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- profiles: normalização e validação do que muda (vale para front, servidor e SQL)
-- Só confere as colunas alteradas: perfis antigos fora do formato não travam
-- outras gravações (ex.: registrar_acesso).
-- ---------------------------------------------------------------------
create or replace function privado.normalizar_profiles()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  novo boolean := tg_op = 'INSERT';
  velho public.profiles;   -- no INSERT fica vazio (todas as colunas null)
  d text;
begin
  if not novo then
    velho := old;
  end if;
  if novo or new.nome is distinct from velho.nome then
    new.nome := privado.texto_validado(new.nome, 2, 60, 'nome');
  end if;
  if novo or new.sobrenome is distinct from velho.sobrenome then
    new.sobrenome := privado.texto_validado(new.sobrenome, 2, 80, 'sobrenome');
  end if;
  if novo or new.empresa is distinct from velho.empresa then
    new.empresa := privado.texto_validado(new.empresa, 2, 120, 'empresa');
  end if;
  if novo or new.cargo is distinct from velho.cargo then
    new.cargo := privado.texto_validado(new.cargo, 2, 120, 'cargo');
  end if;
  if novo or new.whatsapp is distinct from velho.whatsapp then
    d := privado.so_digitos(new.whatsapp);
    if d = '' then
      new.whatsapp := null;
    else
      new.whatsapp := privado.whatsapp_limpo(d);
      if new.whatsapp is null then
        raise exception 'whatsapp inválido' using errcode = '23514';
      end if;
    end if;
  end if;
  if novo or new.cpf is distinct from velho.cpf then
    d := privado.so_digitos(new.cpf);
    if d = '' then
      new.cpf := null;
    elsif not privado.cpf_valido(d) then
      raise exception 'cpf inválido' using errcode = '23514';
    else
      new.cpf := d;
    end if;
  end if;
  return new;
end;
$$;

-- Proteção de colunas (nova versão, substitui a da 0001).
-- Pelo front (anon/authenticated) ninguém altera id, e-mail, papel, status, aceites e datas.
-- O CPF só pode ser preenchido se estiver vazio (correção pela equipe, por SQL).
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
       or new.aceite_privacidade_versao is distinct from old.aceite_privacidade_versao
       or new.aceite_comunicacoes is distinct from old.aceite_comunicacoes
       or new.aceite_comunicacoes_em is distinct from old.aceite_comunicacoes_em
       or (old.cpf is not null and new.cpf is distinct from old.cpf) then
      raise exception 'alteração não permitida' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- Consentimento de comunicações (marcar e desmarcar, com data e auditoria)
-- Retirar o consentimento vale até para acesso inativo.
-- ---------------------------------------------------------------------
create or replace function privado.definir_comunicacoes(aceito boolean)
returns timestamptz
language plpgsql volatile security definer set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
begin
  if uid is null then
    raise exception 'não autenticado' using errcode = '42501';
  end if;
  if aceito is null then
    raise exception 'valor inválido' using errcode = '22023';
  end if;
  update public.profiles
     set aceite_comunicacoes = aceito,
         aceite_comunicacoes_em = now()
   where id = uid
     and (ativo or not aceito)
     and aceite_comunicacoes is distinct from aceito;
  if found then
    insert into public.auditoria (quem, acao, alvo, detalhes)
    values (uid, case when aceito then 'aceitar_comunicacoes' else 'retirar_comunicacoes' end,
            uid::text, jsonb_build_object('origem', 'perfil'));
  end if;
  return (select p.aceite_comunicacoes_em from public.profiles p where p.id = uid);
end;
$$;

-- ---------------------------------------------------------------------
-- Painel: dados da conta que ficam em auth.users (só admin com MFA)
-- ---------------------------------------------------------------------
create or replace function privado.admin_contas()
returns table (id uuid, email_confirmado_em timestamptz, convidado_em timestamptz, cadastro_completo boolean)
language sql stable security definer set search_path = ''
as $$
  select u.id, u.email_confirmed_at, u.invited_at, privado.cadastro_completo_de(u.id)
    from auth.users u
    join public.profiles p on p.id = u.id
   where (select privado.is_admin());
$$;

-- ---------------------------------------------------------------------
-- Conteúdo: passa a exigir cadastro completo (substitui as funções da 0002)
-- ---------------------------------------------------------------------
create or replace function privado.conteudo_visivel(conteudo uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select (select privado.pode_ver_conteudo()) and exists (
    select 1
      from public.conteudos c
      join public.modulos m on m.id = c.modulo_id
     where c.id = conteudo
       and c.publicado and m.publicado
       and (m.liberado_em is null or m.liberado_em <= now())
  );
$$;

create or replace function privado.material_visivel(caminho text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select (select privado.pode_ver_conteudo()) and exists (
    select 1
      from public.conteudos c
      join public.modulos m on m.id = c.modulo_id
     where c.arquivo_path = caminho
       and c.publicado and m.publicado
       and (m.liberado_em is null or m.liberado_em <= now())
  );
$$;

-- Convite pelo painel: completa o perfil com os mesmos limites (substitui a da 0004).
create or replace function public.admin_completar_perfil(alvo uuid, nome text, whatsapp text, empresa text, cargo text)
returns void
language sql volatile security invoker set search_path = ''
as $$
  update public.profiles
     set nome     = coalesce(privado.texto_limpo(admin_completar_perfil.nome, 2, 60), profiles.nome),
         whatsapp = coalesce(privado.whatsapp_limpo(admin_completar_perfil.whatsapp), profiles.whatsapp),
         empresa  = coalesce(privado.texto_limpo(admin_completar_perfil.empresa, 2, 120), profiles.empresa),
         cargo    = coalesce(privado.texto_limpo(admin_completar_perfil.cargo, 2, 120), profiles.cargo)
   where id = alvo;
$$;

-- ---------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function privado.handle_new_user();

drop trigger if exists on_auth_user_cadastro_pendente on auth.users;
create trigger on_auth_user_cadastro_pendente
  after update of raw_user_meta_data on auth.users
  for each row
  when (new.email_confirmed_at is null
        and (new.raw_user_meta_data ? 'cpf' or new.raw_user_meta_data ? 'whatsapp'))
  execute function privado.atualizar_cadastro_pendente();

-- Nome em ordem alfabética antes de profiles_proteger: normaliza primeiro, protege depois.
drop trigger if exists profiles_normalizar on public.profiles;
create trigger profiles_normalizar
  before insert or update on public.profiles
  for each row execute function privado.normalizar_profiles();

-- ---------------------------------------------------------------------
-- Funções públicas (SECURITY INVOKER) chamadas pelo front via RPC
-- ---------------------------------------------------------------------
create or replace function public.cadastro_completo()
returns boolean language sql stable security invoker set search_path = ''
as $$ select privado.cadastro_completo(); $$;

create or replace function public.definir_comunicacoes(aceito boolean)
returns timestamptz language sql volatile security invoker set search_path = ''
as $$ select privado.definir_comunicacoes(aceito); $$;

create or replace function public.admin_contas()
returns table (id uuid, email_confirmado_em timestamptz, convidado_em timestamptz, cadastro_completo boolean)
language sql stable security invoker set search_path = ''
as $$ select * from privado.admin_contas(); $$;

-- ---------------------------------------------------------------------
-- Privilégios de execução
-- ---------------------------------------------------------------------
revoke execute on all functions in schema privado from public, anon;

revoke execute on function privado.so_digitos(text)                     from authenticated;
revoke execute on function privado.whatsapp_valido(text)                from authenticated;
revoke execute on function privado.whatsapp_limpo(text)                 from authenticated;
revoke execute on function privado.cpf_valido(text)                     from authenticated;
revoke execute on function privado.cpf_limpo(text)                      from authenticated;
revoke execute on function privado.texto_limpo(text, int, int)          from authenticated;
revoke execute on function privado.texto_validado(text, int, int, text) from authenticated;
revoke execute on function privado.cadastro_completo_de(uuid)           from authenticated;
revoke execute on function privado.limpar_metadados(uuid)               from authenticated;
revoke execute on function privado.handle_new_user()                    from authenticated;
revoke execute on function privado.atualizar_cadastro_pendente()        from authenticated;
revoke execute on function privado.normalizar_profiles()                from authenticated;
revoke execute on function privado.proteger_profiles()                  from authenticated;

grant execute on function privado.cadastro_completo()          to authenticated, service_role;
grant execute on function privado.pode_ver_conteudo()          to authenticated, service_role;
grant execute on function privado.definir_comunicacoes(boolean) to authenticated;
grant execute on function privado.admin_contas()               to authenticated;
-- Usadas por admin_completar_perfil (Edge Function, chave do servidor)
grant execute on function privado.texto_limpo(text, int, int)  to service_role;
grant execute on function privado.whatsapp_limpo(text)         to service_role;

revoke execute on function public.cadastro_completo()           from public, anon;
revoke execute on function public.definir_comunicacoes(boolean) from public, anon;
revoke execute on function public.admin_contas()                from public, anon;
grant execute on function public.cadastro_completo()            to authenticated;
grant execute on function public.definir_comunicacoes(boolean)  to authenticated;
grant execute on function public.admin_contas()                 to authenticated;

revoke execute on function public.admin_completar_perfil(uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.admin_completar_perfil(uuid, text, text, text, text)  to service_role;

-- ---------------------------------------------------------------------
-- Privilégios nas colunas: o aluno passa a editar também sobrenome e CPF
-- (o CPF só se estiver vazio; o trigger proteger_profiles garante).
-- aceite_comunicacoes(_em) ficam de fora: só pela função definir_comunicacoes().
-- ---------------------------------------------------------------------
grant update (nome, sobrenome, whatsapp, cpf, empresa, cargo) on table public.profiles to authenticated;

-- ---------------------------------------------------------------------
-- RLS: leitura de conteúdo exige ativo + cadastro completo
-- (conteudos, progresso insert/update e materiais já usam conteudo_visivel / material_visivel)
-- ---------------------------------------------------------------------
drop policy if exists modulos_select on public.modulos;
create policy modulos_select on public.modulos for select to authenticated
  using ((publicado and (select privado.pode_ver_conteudo())) or (select privado.is_admin()));

drop policy if exists avisos_select on public.avisos;
create policy avisos_select on public.avisos for select to authenticated
  using ((publicado and (select privado.pode_ver_conteudo())) or (select privado.is_admin()));

drop policy if exists progresso_select on public.progresso;
create policy progresso_select on public.progresso for select to authenticated
  using ((aluno_id = (select auth.uid()) and (select privado.pode_ver_conteudo())) or (select privado.is_admin()));

-- ---------------------------------------------------------------------
-- Dados que já existem: WhatsApp válido gravado com máscara passa a ficar só com dígitos.
-- (Nada é apagado: número que não dá para validar continua como está, e a pessoa
-- corrige na tela "Complete seu cadastro".)
-- ---------------------------------------------------------------------
update public.profiles
   set whatsapp = privado.whatsapp_limpo(whatsapp)
 where whatsapp is not null
   and privado.whatsapp_limpo(whatsapp) is not null
   and whatsapp <> privado.whatsapp_limpo(whatsapp);
