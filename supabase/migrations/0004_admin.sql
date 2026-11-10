-- =====================================================================
-- Área do Aluno · Academia de Virtudes
-- 0004 · Funções usadas SÓ pelas Edge Functions (chave do servidor)
--
-- Rodar no SQL Editor DEPOIS da 0003. Idempotente.
--
-- As Edge Functions já conferem que quem chamou é admin com MFA (aal2).
-- Estas funções só existem para gravar, na mesma transação, QUEM fez a ação
-- (app.ator), para a auditoria registrar o admin, e não "o servidor".
-- Ninguém do front (anon/authenticated) consegue executá-las.
-- =====================================================================

create or replace function public.admin_definir_status(alvo uuid, ativo boolean, ator uuid)
returns void
language plpgsql volatile security invoker set search_path = ''
as $$
begin
  perform set_config('app.ator', ator::text, true);
  update public.profiles set ativo = admin_definir_status.ativo where id = alvo;
  if not found then
    raise exception 'aluno não encontrado' using errcode = 'P0002';
  end if;
end;
$$;

create or replace function public.admin_definir_papel(alvo uuid, papel text, ator uuid)
returns void
language plpgsql volatile security invoker set search_path = ''
as $$
begin
  if papel not in ('aluno', 'admin') then
    raise exception 'papel inválido' using errcode = '22023';
  end if;
  perform set_config('app.ator', ator::text, true);
  update public.profiles set role = papel where id = alvo;
  if not found then
    raise exception 'aluno não encontrado' using errcode = 'P0002';
  end if;
end;
$$;

-- Completa o perfil de quem foi convidado (nome, WhatsApp, empresa, cargo).
create or replace function public.admin_completar_perfil(alvo uuid, nome text, whatsapp text, empresa text, cargo text)
returns void
language sql volatile security invoker set search_path = ''
as $$
  update public.profiles
     set nome     = coalesce(nullif(left(trim(admin_completar_perfil.nome), 120), ''), profiles.nome),
         whatsapp = coalesce(nullif(left(trim(admin_completar_perfil.whatsapp), 30), ''), profiles.whatsapp),
         empresa  = coalesce(nullif(left(trim(admin_completar_perfil.empresa), 120), ''), profiles.empresa),
         cargo    = coalesce(nullif(left(trim(admin_completar_perfil.cargo), 120), ''), profiles.cargo)
   where id = alvo;
$$;

revoke execute on function public.admin_definir_status(uuid, boolean, uuid)          from public, anon, authenticated;
revoke execute on function public.admin_definir_papel(uuid, text, uuid)              from public, anon, authenticated;
revoke execute on function public.admin_completar_perfil(uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.admin_definir_status(uuid, boolean, uuid)           to service_role;
grant execute on function public.admin_definir_papel(uuid, text, uuid)               to service_role;
grant execute on function public.admin_completar_perfil(uuid, text, text, text, text) to service_role;

-- Funções criadas no futuro no esquema public também não ficam executáveis por anon.
alter default privileges in schema public revoke execute on functions from public, anon;
