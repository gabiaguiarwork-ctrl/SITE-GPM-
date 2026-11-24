-- =====================================================================
-- Academia de Virtudes · 0011 · Término do evento (data_fim) · 24/11/2026
--
-- Rodar no SQL Editor DEPOIS da 0010. Idempotente.
--
-- - eventos.data_fim (opcional; quando preenchido, depois do início).
-- - Encontro 3: 11/12/2026, das 9h às 17h.
-- - O e-mail de confirmação, o .ics e a página de presença passam a receber
--   data_fim e mostram "das 9h às 17h". Sem data_fim, mostram só o início.
-- =====================================================================

alter table public.eventos add column if not exists data_fim timestamptz;
alter table public.eventos drop constraint if exists eventos_data_fim_depois_do_inicio;
alter table public.eventos add constraint eventos_data_fim_depois_do_inicio
  check (data_fim is null or data_fim > data_inicio);
comment on column public.eventos.data_fim is 'Término do evento (opcional). Usado no e-mail, no .ics e na página de presença.';

update public.eventos set data_fim = '2026-12-11 17:00:00-03'
 where slug = 'encontro-3' and data_fim is null;

-- Página de presença: + data_fim (mesma assinatura e mesmas permissões da 0009)
create or replace function privado.presenca_consultar(token text)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select coalesce((
    select jsonb_build_object(
             'ok', true,
             'primeiro_nome', split_part(i.nome, ' ', 1),
             'titulo', e.titulo, 'data_inicio', e.data_inicio, 'data_fim', e.data_fim, 'local', e.local,
             'resposta', i.confirmacao,
             'doacao_marca', e.doacao_marca,
             'tamanhos', to_jsonb(array_remove(array[i.doacao_tamanho, case when i.acompanhante then i.acompanhante_doacao_tamanho end], null)))
      from public.inscricoes i
      join public.eventos e on e.id = i.evento_id
     where token ~ '^[A-Za-z0-9_-]{32,64}$'
       and i.token_confirmacao = token
       and i.status <> 'cancelado'
       and e.data_inicio > now() - interval '12 hours'
  ), jsonb_build_object('ok', false));
$$;

-- E-mail de confirmação: + data_fim (mesma assinatura e mesmas permissões da 0010)
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
    'evento', jsonb_build_object('slug', e.slug, 'titulo', e.titulo, 'data_inicio', e.data_inicio, 'data_fim', e.data_fim,
                                 'local', e.local, 'doacao_marca', e.doacao_marca));
end;
$$;

-- Conferência:
-- select slug, data_inicio, data_fim from public.eventos;
