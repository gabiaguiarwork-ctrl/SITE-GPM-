-- =====================================================================
-- Academia de Virtudes · 0010 · Inscrições: e-mail de confirmação,
-- travas das cotas de fralda e aviso de conta no portal (24/11/2026)
--
-- Rodar no SQL Editor DEPOIS da 0009. Idempotente.
--
-- - E-mail de confirmação: status por inscrição (enviado, falhou, nao_enviado).
--   A Edge Function "inscricao" envia pelo Resend; o painel reenvia pela
--   Edge Function "reenviar-confirmacao". No máximo 1 e-mail a cada 10 minutos
--   por inscrição quando quem pede é o site (o admin pode forçar).
-- - Cotas: não dá para baixar uma cota abaixo do que já está reservado, nem
--   apagar um tamanho com reservas. Toda mudança de cota vai para a auditoria.
-- - Inscrição e portal são separados: nada aqui cria ou altera auth.users ou
--   profiles. O painel só MOSTRA se o e-mail do inscrito também tem conta no portal.
-- =====================================================================

-- ---------------------------------------------------------------------
-- E-mail de confirmação
-- ---------------------------------------------------------------------
alter table public.inscricoes
  add column if not exists email_confirmacao_status text not null default 'nao_enviado',
  add column if not exists email_confirmacao_em     timestamptz;
alter table public.inscricoes drop constraint if exists inscricoes_email_confirmacao_status;
alter table public.inscricoes add constraint inscricoes_email_confirmacao_status
  check (email_confirmacao_status in ('enviado', 'falhou', 'nao_enviado'));
comment on column public.inscricoes.email_confirmacao_em is 'Última tentativa de envio do e-mail de confirmação.';

-- A Edge Function precisa do id para mandar o e-mail; o site continua recebendo só {ok, situacao}.
create or replace function privado.inscricao_registrar(dados jsonb)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  r jsonb := privado.gravar_inscricao(dados, 'site-academia-v2', true);
begin
  if (r ->> 'ok')::boolean then
    r := r || jsonb_build_object('id', (
      select i.id from public.inscricoes i join public.eventos e on e.id = i.evento_id
       where e.slug = dados ->> 'evento' and i.whatsapp = privado.whatsapp_limpo(dados ->> 'whatsapp')));
  end if;
  return r;
end;
$$;

-- Reserva o envio (marca a tentativa agora) e devolve só o que o e-mail precisa.
-- Sem "forcar", recusa se houve tentativa nos últimos 10 minutos.
create or replace function privado.email_confirmacao_reservar(inscricao uuid, forcar boolean)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  i public.inscricoes;
  e public.eventos;
begin
  update public.inscricoes x set email_confirmacao_em = now()
   where x.id = inscricao and x.status <> 'cancelado'
     and (forcar or x.email_confirmacao_em is null or x.email_confirmacao_em < now() - interval '10 minutes')
  returning * into i;
  if not found then
    return null;
  end if;
  select * into e from public.eventos where id = i.evento_id;
  return jsonb_build_object(
    'id', i.id,
    'email', i.email,
    'primeiro_nome', split_part(i.nome, ' ', 1),
    'situacao', i.status,
    'acompanhante_nome', case when i.acompanhante then i.acompanhante_nome end,
    'tamanhos', case when i.status = 'inscrito'
                     then to_jsonb(array_remove(array[i.doacao_tamanho, case when i.acompanhante then i.acompanhante_doacao_tamanho end], null))
                     else '[]'::jsonb end,
    'evento', jsonb_build_object('slug', e.slug, 'titulo', e.titulo, 'data_inicio', e.data_inicio,
                                 'local', e.local, 'doacao_marca', e.doacao_marca));
end;
$$;

-- Grava o resultado. Com "ator" (admin pelo painel), registra o reenvio na auditoria.
create or replace function privado.email_confirmacao_resultado(inscricao uuid, resultado text, ator uuid)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
begin
  if resultado not in ('enviado', 'falhou', 'nao_enviado') then
    raise exception 'resultado inválido' using errcode = '22023';
  end if;
  update public.inscricoes set email_confirmacao_status = resultado where id = inscricao;
  if ator is not null then
    insert into public.auditoria (quem, acao, alvo, detalhes)
    values (ator, 'reenviar_confirmacao', inscricao::text, jsonb_build_object('resultado', resultado));
  end if;
end;
$$;

create or replace function public.email_confirmacao_reservar(inscricao uuid, forcar boolean)
returns jsonb
language sql volatile security invoker set search_path = ''
as $$ select privado.email_confirmacao_reservar(inscricao, forcar); $$;

create or replace function public.email_confirmacao_resultado(inscricao uuid, resultado text, ator uuid)
returns void
language sql volatile security invoker set search_path = ''
as $$ select privado.email_confirmacao_resultado(inscricao, resultado, ator); $$;

-- O admin não marca "enviado" à mão: o status do e-mail só muda pelo servidor.
create or replace function privado.proteger_email_confirmacao()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if privado.ator() is not null and (select auth.uid()) is not null then
    new.email_confirmacao_status := old.email_confirmacao_status;
    new.email_confirmacao_em := old.email_confirmacao_em;
  end if;
  return new;
end;
$$;
drop trigger if exists inscricoes_proteger_email on public.inscricoes;
create trigger inscricoes_proteger_email before update on public.inscricoes
  for each row execute function privado.proteger_email_confirmacao();

-- ---------------------------------------------------------------------
-- Cotas: travas e auditoria
-- ---------------------------------------------------------------------
create or replace function privado.conferir_cota()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  usados integer;
begin
  select coalesce(u.usados, 0) into usados
    from (select 1) x left join privado.cotas_usadas(old.evento_id) u on u.tamanho = old.tamanho;
  if tg_op = 'DELETE' then
    if usados > 0 then
      raise exception 'O tamanho % já tem % pacote(s) reservado(s) e não pode ser removido.', old.tamanho, usados
        using errcode = 'P0001', hint = 'cota_abaixo_reservado';
    end if;
    return old;
  end if;
  if new.evento_id <> old.evento_id or new.tamanho <> old.tamanho then
    raise exception 'Não é possível trocar o evento ou o tamanho de uma cota.' using errcode = 'P0001';
  end if;
  if new.cota < usados then
    raise exception 'A cota do tamanho % não pode ficar em %: já há % pacote(s) reservado(s).', new.tamanho, new.cota, usados
      using errcode = 'P0001', hint = 'cota_abaixo_reservado';
  end if;
  return new;
end;
$$;
drop trigger if exists cotas_conferir on public.cotas_doacao;
create trigger cotas_conferir before update or delete on public.cotas_doacao
  for each row execute function privado.conferir_cota();

create or replace function privado.auditar_cota()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.cota = old.cota then
    return null;
  end if;
  insert into public.auditoria (quem, acao, alvo, detalhes)
  values (privado.ator(), case tg_op when 'INSERT' then 'criar_cota' when 'DELETE' then 'remover_cota' else 'alterar_cota' end,
          coalesce(new.evento_id, old.evento_id)::text,
          jsonb_build_object('tamanho', coalesce(new.tamanho, old.tamanho),
                             'de', case when tg_op <> 'INSERT' then old.cota end,
                             'para', case when tg_op <> 'DELETE' then new.cota end));
  return null;
end;
$$;
drop trigger if exists cotas_auditar on public.cotas_doacao;
create trigger cotas_auditar after insert or update or delete on public.cotas_doacao
  for each row execute function privado.auditar_cota();

-- Auditoria de evento passa a registrar os nomes dos campos alterados.
create or replace function privado.auditar_evento()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  campos text[];
begin
  if tg_op = 'UPDATE' then
    select array_agg(n.key order by n.key) into campos
      from jsonb_each(to_jsonb(new)) n
     where n.key <> 'atualizado_em' and n.value is distinct from (to_jsonb(old) -> n.key);
    if campos is null then
      return null;
    end if;
  end if;
  insert into public.auditoria (quem, acao, alvo, detalhes)
  values (privado.ator(), case tg_op when 'INSERT' then 'criar_evento' when 'DELETE' then 'excluir_evento' else 'alterar_evento' end,
          coalesce(new.id, old.id)::text,
          jsonb_build_object('slug', coalesce(new.slug, old.slug)) || case when campos is null then '{}'::jsonb else jsonb_build_object('campos', campos) end);
  return null;
end;
$$;

-- ---------------------------------------------------------------------
-- Lista do painel: + aviso "também tem conta no portal" (só informação)
-- ---------------------------------------------------------------------
drop view if exists public.inscricoes_painel;
create view public.inscricoes_painel
with (security_invoker = true)
as
select i.*,
       exists (select 1 from public.inscricoes o
                where o.evento_id = i.evento_id and o.id <> i.id and o.whatsapp <> i.whatsapp
                  and (o.email = i.email or lower(o.nome) = lower(i.nome))) as possivel_repetido,
       exists (select 1 from public.profiles p where lower(p.email) = i.email) as tem_conta_portal
  from public.inscricoes i;
revoke all on table public.inscricoes_painel from public, anon, authenticated;
grant select on table public.inscricoes_painel to authenticated, service_role;

-- Resumo: + quantos e-mails falharam ou não foram enviados
create or replace function privado.admin_resumo_evento(evento uuid)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not privado.is_admin() then
    raise exception 'acesso negado' using errcode = '42501';
  end if;
  return (
    select jsonb_build_object(
      'inscritos',    count(*) filter (where i.status = 'inscrito'),
      'pessoas',      coalesce(sum(i.pessoas) filter (where privado.inscricao_conta(i.status, i.confirmacao)), 0),
      'vagas',        privado.vagas_restantes(evento),
      'lista_espera', count(*) filter (where i.status = 'lista_espera'),
      'confirmaram',  count(*) filter (where i.status = 'inscrito' and i.confirmacao = 'sim'),
      'aguardando',   count(*) filter (where i.status = 'inscrito' and i.confirmacao = 'aguardando'),
      'nao_vao',      count(*) filter (where i.status = 'inscrito' and i.confirmacao = 'nao_vai'),
      'presentes',    count(i.checkin_em) + count(i.acompanhante_checkin_em),
      'email_falhou', count(*) filter (where i.status <> 'cancelado' and i.email_confirmacao_status = 'falhou'),
      'email_pendente', count(*) filter (where i.status <> 'cancelado' and i.email_confirmacao_status = 'nao_enviado'),
      'cotas',        coalesce((select jsonb_agg(jsonb_build_object('tamanho', c.tamanho, 'cota', c.cota,
                                                                    'reservados', coalesce(u.usados, 0))
                                                 order by position(c.tamanho in 'PMG'))
                                  from public.cotas_doacao c
                                  left join privado.cotas_usadas(evento) u on u.tamanho = c.tamanho
                                 where c.evento_id = evento), '[]'))
      from public.inscricoes i where i.evento_id = evento);
end;
$$;

-- ---------------------------------------------------------------------
-- Permissões
-- ---------------------------------------------------------------------
revoke execute on all functions in schema privado from public, anon;
grant execute on function privado.evento_publico(text) to anon, authenticated, service_role;
grant execute on function privado.inscricao_conta(text, text) to authenticated, service_role;
grant execute on function privado.vagas_restantes(uuid)       to authenticated, service_role;
grant execute on function privado.cotas_usadas(uuid)          to authenticated, service_role;
grant execute on function privado.tamanhos_disponiveis(uuid)  to authenticated, service_role;

revoke execute on function privado.inscricao_registrar(jsonb)                    from authenticated;
revoke execute on function privado.email_confirmacao_reservar(uuid, boolean)     from authenticated;
revoke execute on function privado.email_confirmacao_resultado(uuid, text, uuid) from authenticated;
grant  execute on function privado.inscricao_registrar(jsonb)                    to service_role;
grant  execute on function privado.email_confirmacao_reservar(uuid, boolean)     to service_role;
grant  execute on function privado.email_confirmacao_resultado(uuid, text, uuid) to service_role;
revoke execute on function public.email_confirmacao_reservar(uuid, boolean)      from public, anon, authenticated;
revoke execute on function public.email_confirmacao_resultado(uuid, text, uuid)  from public, anon, authenticated;
grant  execute on function public.email_confirmacao_reservar(uuid, boolean)      to service_role;
grant  execute on function public.email_confirmacao_resultado(uuid, text, uuid)  to service_role;
grant  execute on function privado.admin_resumo_evento(uuid) to authenticated;

-- Conferência:
-- select email_confirmacao_status, count(*) from public.inscricoes group by 1;
